import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { message, Modal } from 'antd'
import { createOrderWithDays, ordersApi } from '../../api/orders'
import { AccountMenu } from '../AccountMenu'
import { driversApi } from '../../api/drivers'
import { PRESET_COLORS, contrastText } from '../../calendarUi'
import { addMonths, formatLocalDate, formatMonthDay, laterDate, monthEnd, monthStart, orderedRange, toDateOnly, todayLocal } from '../../localDate'
import { assignedDayCount, hasUnassignedDays, isHistoricalOrder, isSplitOrder } from '../../orderFlags'
import type { Driver, DriverCalendarDay, ItineraryDay, Order } from '../../types'
import { OrderFilesBlock } from '../OrderFilesBlock'
import { DriverDayEditor } from '../driver/DriverDayEditor'
import { DispatcherCalendarCard, DispatcherDayCard, type CalendarMark } from './DispatcherCalendarCard'
import '../driver/driver-calendar.css'
import './dispatcher.css'

const COLOR_KEY = 'trailink.dispatcher.assignedColor'
const LAYOUT_KEY = 'trailink.dispatcher.driverLayout'
const PROFILE_KEY = 'trailink.dispatcher.profile'
const DEFAULT_ASSIGNED_COLOR = '#C6F0E0'
const DRAG_THRESHOLD = 8

interface DriverLayout {
  pinnedIds: string[]
  sortIds: string[]
  hiddenIds: string[]
}

type OrderFilter = 'unassigned' | 'all'
type DragKind = 'order' | 'driver' | 'day'

interface DragState {
  kind: DragKind
  id: string
  orderId?: string
  dayId?: string
  from?: 'order' | 'driver'
  x: number
  y: number
}

function readColor() {
  return localStorage.getItem(COLOR_KEY) || DEFAULT_ASSIGNED_COLOR
}

function readLayout(): DriverLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '') as DriverLayout
    return {
      pinnedIds: parsed.pinnedIds ?? [],
      sortIds: parsed.sortIds ?? [],
      hiddenIds: parsed.hiddenIds ?? [],
    }
  } catch {
    return { pinnedIds: [], sortIds: [], hiddenIds: [] }
  }
}

function readProfileName() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || '') as { name?: string }
    return parsed.name?.trim() || '调度员'
  } catch {
    return '调度员'
  }
}

function isIncomplete(order: Order, today: string) {
  const end = order.endDate || order.startDate
  return end >= today
}

function isInProgress(order: Order, today: string) {
  const end = order.endDate || order.startDate
  return order.startDate <= today && end >= today
}

function sortBoardOrders(orders: Order[], today: string) {
  return [...orders].sort((left, right) => {
    const leftLive = isInProgress(left, today)
    const rightLive = isInProgress(right, today)
    if (leftLive !== rightLive) {
      return leftLive ? -1 : 1
    }
    if (leftLive) {
      return right.startDate.localeCompare(left.startDate) || left.orderNo.localeCompare(right.orderNo)
    }
    return left.startDate.localeCompare(right.startDate) || left.orderNo.localeCompare(right.orderNo)
  })
}

function sortDrivers(drivers: Driver[], layout: DriverLayout) {
  const hidden = new Set(layout.hiddenIds)
  const visible = drivers.filter((driver) => !hidden.has(driver.id))
  const pinned = layout.pinnedIds
    .map((id) => visible.find((driver) => driver.id === id))
    .filter((driver): driver is Driver => Boolean(driver))
  const pinnedIds = new Set(layout.pinnedIds)
  const rest = visible.filter((driver) => !pinnedIds.has(driver.id))
  const sortIndex = new Map(layout.sortIds.map((id, index) => [id, index]))
  rest.sort((left, right) => {
    const leftRank = sortIndex.has(left.id)
    const rightRank = sortIndex.has(right.id)
    if (leftRank && rightRank) {
      return sortIndex.get(left.id)! - sortIndex.get(right.id)!
    }
    if (leftRank !== rightRank) {
      return leftRank ? -1 : 1
    }
    return left.name.localeCompare(right.name, 'zh-CN')
  })
  return [...pinned, ...rest]
}

function moveIds(ids: string[], sourceId: string, targetId: string) {
  const working = ids.includes(sourceId) ? [...ids] : [sourceId, ...ids]
  const from = working.indexOf(sourceId)
  if (from < 0 || sourceId === targetId) {
    return working
  }
  working.splice(from, 1)
  const insertAt = working.indexOf(targetId)
  working.splice(insertAt < 0 ? working.length : insertAt, 0, sourceId)
  return working
}

function resolveDriverId(x: number, y: number, openDriverId: string | null) {
  const element = document.elementFromPoint(x, y)
  const icon = element?.closest('[data-driver-id]')
  if (icon) {
    return icon.getAttribute('data-driver-id')
  }
  if (openDriverId && element?.closest('[data-driver-pane]')) {
    return openDriverId
  }
  return null
}

function isOverOrderPane(x: number, y: number) {
  return Boolean(document.elementFromPoint(x, y)?.closest('[data-order-pane]'))
}

function monthValue(key: string) {
  const [year, month] = key.split('-').map(Number)
  return year * 12 + month
}

function nearestMonthSection(sections: HTMLElement[], key: string) {
  const target = monthValue(key)
  return [...sections].sort(
    (left, right) =>
      Math.abs(monthValue(left.dataset.month || '') - target) -
      Math.abs(monthValue(right.dataset.month || '') - target),
  )[0]
}

function alignCalendarScroll(source: HTMLElement, target: HTMLElement) {
  const sourceMonths = [...source.querySelectorAll<HTMLElement>('section[data-month]')]
  const targetMonths = [...target.querySelectorAll<HTMLElement>('section[data-month]')]
  if (sourceMonths.length === 0 || targetMonths.length === 0) {
    return
  }

  let current = sourceMonths[0]
  for (const section of sourceMonths) {
    if (section.offsetTop <= source.scrollTop + 16) {
      current = section
    }
  }

  const key = current.dataset.month || ''
  const match = targetMonths.find((section) => section.dataset.month === key) ?? nearestMonthSection(targetMonths, key)
  if (!match) {
    return
  }

  const next = match.offsetTop - (current.offsetTop - source.scrollTop)
  const max = Math.max(0, target.scrollHeight - target.clientHeight)
  target.scrollTop = Math.min(Math.max(0, next), max)
}

export function DispatcherPage() {
  const today = formatLocalDate(todayLocal())
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [filter, setFilter] = useState<OrderFilter>('unassigned')
  const [assignedColor, setAssignedColor] = useState(readColor)
  const [showColors, setShowColors] = useState(false)
  const [layout, setLayout] = useState<DriverLayout>(readLayout)
  const [profileName, setProfileName] = useState(readProfileName)
  const [editingName, setEditingName] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrderDayId, setSelectedOrderDayId] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [driverNotes, setDriverNotes] = useState('')
  const [orderPlatformNo, setOrderPlatformNo] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [orderInfoOpen, setOrderInfoOpen] = useState(false)
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [createRangeStart, setCreateRangeStart] = useState<string | null>(null)
  const [createRangeEnd, setCreateRangeEnd] = useState<string | null>(null)
  const createRangeDragging = useRef(false)
  const ordersRef = useRef<Order[]>([])
  const orderPlatformNoRef = useRef('')
  const orderNotesRef = useRef('')
  const selectOrderDayRef = useRef<(dayId: string) => void>(() => undefined)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverDriverId, setHoverDriverId] = useState<string | null>(null)
  const [hoverOrderPane, setHoverOrderPane] = useState(false)
  const dragRef = useRef(drag)
  const pendingRef = useRef<DragState | null>(null)
  const driversRef = useRef(drivers)
  const assignLock = useRef(false)
  const selectedDriverIdRef = useRef<string | null>(null)
  const selectedOrderDayIdRef = useRef<string | null>(null)
  const orderCalBodyRef = useRef<HTMLDivElement>(null)
  const driverCalBodyRef = useRef<HTMLDivElement>(null)
  const assignOrderRef = useRef<(orderId: string, driverId: string) => Promise<void>>(async () => undefined)
  const assignDayRef = useRef<(orderId: string, dayId: string, driverId: string) => Promise<void>>(async () => undefined)
  const unbindDayRef = useRef<(orderId: string, dayId: string) => Promise<void>>(async () => undefined)
  const reorderDriverRef = useRef<(sourceId: string, targetId: string) => void>(() => undefined)

  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  useEffect(() => {
    driversRef.current = drivers
    ordersRef.current = orders
  }, [drivers, orders])

  const visibleOrders = useMemo(() => {
    const listed =
      filter === 'unassigned'
        ? orders.filter((order) => isIncomplete(order, today) && order.dayCount > 0 && hasUnassignedDays(order))
        : orders.filter((order) => order.dayCount > 0 && !isHistoricalOrder(order, today))
    return sortBoardOrders(listed, today)
  }, [filter, orders, today])
  const [createFrom, createTo] = createRangeStart ? orderedRange(createRangeStart, createRangeEnd) : [null, null]
  const createCalStart = formatLocalDate(monthStart(addMonths(todayLocal(), -1)))
  const createCalEnd = formatLocalDate(monthEnd(addMonths(todayLocal(), 3)))

  const visibleDrivers = useMemo(() => sortDrivers(drivers, layout), [drivers, layout])
  const hiddenDrivers = useMemo(
    () => drivers.filter((driver) => layout.hiddenIds.includes(driver.id)),
    [drivers, layout.hiddenIds],
  )
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null
  const orderRangeStart = selectedOrder?.days[0]?.serviceDate || selectedOrder?.startDate || today
  const orderRangeEnd = selectedOrder?.endDate || selectedOrder?.days.at(-1)?.serviceDate || orderRangeStart
  const selectedOrderDay = selectedOrder?.days.find((day) => day.id === selectedOrderDayId) ?? null
  const orderEditorDay = useMemo(
    () => (selectedOrder && selectedOrderDay ? toOrderCalendarDay(selectedOrder, selectedOrderDay) : null),
    [selectedOrder, selectedOrderDay],
  )
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? null
  const driverById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers])

  async function loadBoard() {
    try {
      const [nextOrders, nextDrivers] = await Promise.all([ordersApi.list(), driversApi.list()])
      setOrders(nextOrders)
      setDrivers(nextDrivers)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载调度台失败')
    }
  }

  useEffect(() => {
    void loadBoard()
  }, [])

  useEffect(() => {
    setDriverNotes(driversRef.current.find((item) => item.id === selectedDriverId)?.notes ?? '')
  }, [selectedDriverId])

  useEffect(() => {
    setSelectedOrderDayId(null)
    setOrderInfoOpen(false)
    const order = ordersRef.current.find((item) => item.id === selectedOrderId)
    const platformOrderNo = order?.platformOrderNo ?? ''
    const notes = order?.notes ?? ''
    orderPlatformNoRef.current = platformOrderNo
    orderNotesRef.current = notes
    setOrderPlatformNo(platformOrderNo)
    setOrderNotes(notes)
  }, [selectedOrderId])

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const pending = pendingRef.current
      if (!dragRef.current && pending) {
        const deltaX = event.clientX - pending.x
        const deltaY = event.clientY - pending.y
        if (deltaX * deltaX + deltaY * deltaY >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
          const next = { ...pending, x: event.clientX, y: event.clientY }
          pendingRef.current = null
          setDrag(next)
          dragRef.current = next
        }
      }
      const current = dragRef.current
      if (!current) {
        return
      }
      setDrag({ ...current, x: event.clientX, y: event.clientY })
      setHoverDriverId(resolveDriverId(event.clientX, event.clientY, selectedDriverIdRef.current))
      setHoverOrderPane(current.kind === 'day' && current.from === 'driver' && isOverOrderPane(event.clientX, event.clientY))
    }
    function onUp(event: PointerEvent) {
      createRangeDragging.current = false
      const current = dragRef.current
      const pending = pendingRef.current
      pendingRef.current = null
      if (current) {
        const driverId = resolveDriverId(event.clientX, event.clientY, selectedDriverIdRef.current)
        const overOrderPane = isOverOrderPane(event.clientX, event.clientY)
        setDrag(null)
        setHoverDriverId(null)
        setHoverOrderPane(false)
        dragRef.current = null
        if (current.kind === 'day' && current.from === 'driver' && current.orderId && current.dayId && overOrderPane) {
          void unbindDayRef.current(current.orderId, current.dayId)
          return
        }
        if (current.kind === 'day' && current.from === 'order' && current.dayId && !driverId) {
          selectOrderDayRef.current(current.dayId)
          return
        }
        if (!driverId) {
          return
        }
        if (current.kind === 'order') {
          void assignOrderRef.current(current.id, driverId)
          return
        }
        if (current.kind === 'day' && current.orderId && current.dayId) {
          void assignDayRef.current(current.orderId, current.dayId, driverId)
          return
        }
        if (current.kind === 'driver' && driverId !== current.id) {
          reorderDriverRef.current(current.id, driverId)
        }
        return
      }
      if (!pending) {
        return
      }
      if (pending.kind === 'day' && pending.from === 'order' && pending.dayId) {
        selectOrderDayRef.current(pending.dayId)
        return
      }
      if (pending.kind === 'order') {
        setCreatingOrder(false)
        setCreateRangeStart(null)
        setCreateRangeEnd(null)
        setSelectedOrderId((currentId) => (currentId === pending.id ? null : pending.id))
        return
      }
      if (pending.kind === 'driver') {
        setSelectedDriverId((currentId) => (currentId === pending.id ? null : pending.id))
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  function syncDriverCalendarFromOrder() {
    if (!selectedDriverIdRef.current || selectedOrderDayIdRef.current) {
      return
    }
    const source = orderCalBodyRef.current
    const target = driverCalBodyRef.current
    if (!source || !target) {
      return
    }
    alignCalendarScroll(source, target)
  }

  useEffect(() => {
    if (!selectedOrderId || !selectedDriverId || selectedOrderDayId) {
      return
    }
    const frame = window.requestAnimationFrame(() => syncDriverCalendarFromOrder())
    return () => window.cancelAnimationFrame(frame)
  }, [selectedOrderId, selectedDriverId, selectedOrderDayId, orderRangeEnd])

  function persistLayout(next: DriverLayout) {
    setLayout(next)
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(next))
  }

  function persistColor(color: string) {
    setAssignedColor(color)
    localStorage.setItem(COLOR_KEY, color)
  }

  function closeCreateOrder() {
    setCreatingOrder(false)
    setCreateRangeStart(null)
    setCreateRangeEnd(null)
    createRangeDragging.current = false
  }

  function toggleCreateOrder() {
    if (creatingOrder) {
      closeCreateOrder()
      return
    }
    setSelectedOrderId(null)
    setSelectedOrderDayId(null)
    setCreateRangeStart(null)
    setCreateRangeEnd(null)
    setCreatingOrder(true)
  }

  function onCreateDayPointerDown(date: string) {
    if (busy) {
      return
    }
    createRangeDragging.current = true
    setCreateRangeStart(date)
    setCreateRangeEnd(date)
  }

  function onCreateDayPointerEnter(date: string) {
    if (createRangeDragging.current) {
      setCreateRangeEnd(date)
    }
  }

  async function createOrderRange() {
    if (!createFrom || !createTo) {
      message.warning('请先在日历上选择起止日期')
      return
    }
    setBusy(true)
    try {
      const created = await createOrderWithDays({ startDate: createFrom, endDate: createTo })
      if (created.warnings.length > 0) {
        message.warning(created.warnings.join('；'))
      } else {
        message.success(`已添加 ${created.dates.length} 天行程`)
      }
      closeCreateOrder()
      await loadBoard()
      setSelectedOrderId(created.order.id)
    } catch (error) {
      if (error instanceof RangeError) {
        message.warning(error.message)
        return
      }
      message.error(error instanceof Error ? error.message : '创建订单失败')
    } finally {
      setBusy(false)
    }
  }

  function persistName(name: string) {
    const value = name.trim() || '调度员'
    setProfileName(value)
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: value }))
  }

  function beginPointer(event: ReactPointerEvent, next: DragState) {
    if (busy) {
      return
    }
    if (next.kind !== 'day') {
      event.preventDefault()
    }
    pendingRef.current = next
  }

  async function assignOrder(orderId: string, driverId: string) {
    if (assignLock.current || busy) {
      return
    }
    assignLock.current = true
    setBusy(true)
    try {
      await ordersApi.assignDriver(orderId, driverId, true)
      message.success('已分配给司导')
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '日期冲突，无法分配')
    } finally {
      assignLock.current = false
      setBusy(false)
    }
  }

  async function unbindDriverDay(orderId: string, dayId: string) {
    const order = orders.find((item) => item.id === orderId)
    const day = order?.days.find((item) => item.id === dayId)
    if (!order || !day?.driverId || assignLock.current || busy) {
      return
    }
    assignLock.current = true
    setBusy(true)
    try {
      if (isSplitOrder(order)) {
        await ordersApi.updateDay(orderId, dayId, {
          serviceDate: day.serviceDate,
          description: day.description,
          endLocation: day.endLocation,
          driverId: null,
        })
        message.success('已取消该日拆单')
      } else {
        await ordersApi.assignDriver(orderId, null)
        message.success('已取消整单绑定')
      }
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '取消行程失败')
    } finally {
      assignLock.current = false
      setBusy(false)
    }
  }

  async function assignDay(orderId: string, dayId: string, driverId: string) {
    const order = orders.find((item) => item.id === orderId)
    const day = order?.days.find((item) => item.id === dayId)
    if (!order || !day || assignLock.current || busy) {
      return
    }
    if (day.driverId === driverId) {
      return
    }
    assignLock.current = true
    setBusy(true)
    try {
      await ordersApi.updateDay(orderId, dayId, {
        serviceDate: day.serviceDate,
        description: day.description,
        endLocation: day.endLocation,
        driverId,
        failOnConflict: true,
      })
      message.success('已按天分配给司导')
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '日期冲突，无法分配')
    } finally {
      assignLock.current = false
      setBusy(false)
    }
  }

  function reorderDriver(sourceId: string, targetId: string) {
    const pinnedSet = new Set(layout.pinnedIds)
    if (pinnedSet.has(sourceId) !== pinnedSet.has(targetId)) {
      return
    }
    if (pinnedSet.has(sourceId)) {
      persistLayout({ ...layout, pinnedIds: moveIds(layout.pinnedIds, sourceId, targetId) })
      return
    }
    const visibleIds = visibleDrivers.filter((driver) => !pinnedSet.has(driver.id)).map((driver) => driver.id)
    persistLayout({ ...layout, sortIds: moveIds(visibleIds, sourceId, targetId) })
  }

  function togglePin(driverId: string) {
    const pinnedIds = layout.pinnedIds.includes(driverId)
      ? layout.pinnedIds.filter((id) => id !== driverId)
      : [...layout.pinnedIds, driverId]
    persistLayout({ ...layout, pinnedIds, hiddenIds: layout.hiddenIds.filter((id) => id !== driverId) })
  }

  function deleteSelectedOrder() {
    const order = selectedOrder
    if (!order || assignLock.current || busy) {
      return
    }
    Modal.confirm({
      title: '确定删除这个订单？',
      content: order.orderNo,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        assignLock.current = true
        setBusy(true)
        try {
          await ordersApi.remove(order.id)
          message.success('订单已删除')
          setSelectedOrderId(null)
          setSelectedOrderDayId(null)
          await loadBoard()
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除订单失败')
          throw error
        } finally {
          assignLock.current = false
          setBusy(false)
        }
      },
    })
  }

  function hideDriver(driverId: string) {
    persistLayout({
      pinnedIds: layout.pinnedIds.filter((id) => id !== driverId),
      sortIds: layout.sortIds.filter((id) => id !== driverId),
      hiddenIds: layout.hiddenIds.includes(driverId) ? layout.hiddenIds : [...layout.hiddenIds, driverId],
    })
    setSelectedDriverId((current) => (current === driverId ? null : current))
  }

  function restoreDriver(driverId: string) {
    persistLayout({ ...layout, hiddenIds: layout.hiddenIds.filter((id) => id !== driverId) })
  }

  function selectOrderDay(dayId: string) {
    setOrderInfoOpen(false)
    setSelectedOrderDayId(dayId)
  }

  function changeOrderPlatformNo(value: string) {
    orderPlatformNoRef.current = value
    setOrderPlatformNo(value)
  }

  function changeOrderNotes(value: string) {
    orderNotesRef.current = value
    setOrderNotes(value)
  }

  async function saveOrderInfo() {
    const order = selectedOrder ?? ordersRef.current.find((item) => item.id === selectedOrderId)
    if (!order) {
      return
    }
    const platformOrderNo = orderPlatformNoRef.current.trim() || undefined
    const notes = orderNotesRef.current
    try {
      const saved = await ordersApi.update(order.id, {
        platformOrderNo,
        sourceCompany: order.sourceCompany ?? undefined,
        startDate: toDateOnly(order.startDate),
        guestCount: order.guestCount,
        notes,
      })
      orderPlatformNoRef.current = saved.platformOrderNo ?? ''
      orderNotesRef.current = saved.notes ?? ''
      setOrderPlatformNo(orderPlatformNoRef.current)
      setOrderNotes(orderNotesRef.current)
      message.success('订单已保存')
      setOrderInfoOpen(false)
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存订单失败')
    }
  }

  async function saveDriverNotes() {
    if (!selectedDriver || (selectedDriver.notes ?? '') === driverNotes) {
      return
    }
    try {
      const saved = await driversApi.update(selectedDriver.id, {
        name: selectedDriver.name,
        phone: selectedDriver.phone ?? undefined,
        notes: driverNotes,
      })
      setDrivers((current) => current.map((driver) => (driver.id === saved.id ? saved : driver)))
      message.success('备注已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存备注失败')
    }
  }

  useEffect(() => {
    assignOrderRef.current = assignOrder
    assignDayRef.current = assignDay
    unbindDayRef.current = unbindDriverDay
    reorderDriverRef.current = reorderDriver
    selectOrderDayRef.current = selectOrderDay
    selectedDriverIdRef.current = selectedDriverId
    selectedOrderDayIdRef.current = selectedOrderDayId
  })

  const orderMarks: CalendarMark[] = (selectedOrder?.days ?? []).map((day) => ({
    date: day.serviceDate,
    dayId: day.id,
    orderId: selectedOrder!.id,
    label: day.driverId ? driverById.get(day.driverId)?.name.slice(0, 1) : '未派',
    assigned: Boolean(day.driverId),
    color: day.driverId ? assignedColor : '#FFF1B8',
    textColor: day.driverId ? contrastText(assignedColor) : '#d46b08',
  }))

  const driverMarks: CalendarMark[] = orders
    .flatMap((order) =>
      order.days
        .filter((day) => day.driverId === selectedDriverId && day.serviceDate >= today)
        .map((day) => ({
          date: day.serviceDate,
          dayId: day.id,
          orderId: order.id,
          label: isSplitOrder(order) ? `${order.orderNo.slice(-4)}拆` : order.orderNo.slice(-4),
        })),
    )
    .sort((left, right) => left.date.localeCompare(right.date))

  const driverRangeEnd = laterDate(driverMarks.at(-1)?.date, selectedOrder ? orderRangeEnd : undefined, today) || today

  const draggingOrder =
    drag?.kind === 'order' ? orders.find((order) => order.id === drag.id) : undefined
  const draggingDriver = drag?.kind === 'driver' ? drivers.find((driver) => driver.id === drag.id) : undefined
  const draggingDay =
    drag?.kind === 'day'
      ? orders.flatMap((order) => order.days.map((day) => ({ order, day }))).find((item) => item.day.id === drag.dayId)
      : undefined

  function orderStatus(order: Order) {
    const assigned = assignedDayCount(order)
    if (assigned === 0) {
      return isInProgress(order, today) ? '进行中' : `${order.dayCount} 天`
    }
    if (assigned < order.dayCount || isSplitOrder(order)) {
      return '拆分'
    }
    return isInProgress(order, today) ? '进行中' : '已分配'
  }

  return (
    <div className="dispatcher-page">
      <header className="dispatcher-header">
        <div>
          {editingName ? (
            <input
              className="dispatcher-name-input"
              autoFocus
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              onBlur={() => {
                persistName(profileName)
                setEditingName(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  persistName(profileName)
                  setEditingName(false)
                }
              }}
            />
          ) : (
            <button type="button" className="dispatcher-name" onClick={() => setEditingName(true)}>
              {profileName}
            </button>
          )}
          <p>调度台</p>
        </div>
        <div className="dispatcher-header-actions">
          <AccountMenu />
        </div>
      </header>

      <section className={`dispatcher-pane${hoverOrderPane ? ' drop' : ''}`} data-order-pane="true">
        <div className="dispatcher-pane-bar">
          <h2>订单</h2>
          <div className="dispatcher-filters">
            <button
              type="button"
              className={`dispatcher-chip${creatingOrder ? ' active' : ''}`}
              onClick={toggleCreateOrder}
            >
              创建订单
            </button>
            <button
              type="button"
              className={`dispatcher-chip${filter === 'unassigned' ? ' active' : ''}`}
              onClick={() => {
                setFilter('unassigned')
                setShowColors(false)
              }}
            >
              未分配订单
            </button>
            <button
              type="button"
              className={`dispatcher-chip${filter === 'all' ? ' active' : ''}`}
              onClick={() => setFilter('all')}
            >
              所有订单
            </button>
            {filter === 'all' ? (
              <button type="button" className="dispatcher-chip" onClick={() => setShowColors((current) => !current)}>
                <i style={{ background: assignedColor }} />
                已分配颜色
              </button>
            ) : null}
          </div>
        </div>
        {filter === 'all' && showColors ? (
          <div className="dispatcher-swatches">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`dispatcher-swatch${assignedColor === color ? ' selected' : ''}`}
                style={{ background: color }}
                aria-label={color}
                onClick={() => persistColor(color)}
              />
            ))}
          </div>
        ) : null}
        <p className="dispatcher-hint">
          创建订单与司导界面相同：在日历上按住并拖选起止日期。点击订单看日历，可改公司订单号和备注。点击某一天编辑行程，拖动某一天只派那天。拖动卡片整单派单。从司导卡片把一天拖回订单区可取消：拆单只取消那天，未拆单取消整单。已派完且结束的单不出现在这里，只在公司信息里查看。冲突会报错，卡片保持打开。
        </p>
        <div className="dispatcher-grid">
          {visibleOrders.length === 0 ? <p className="dispatcher-empty">暂无订单</p> : null}
          {visibleOrders.map((order) => {
            const assigned = assignedDayCount(order)
            const split = isSplitOrder(order)
            const live = isInProgress(order, today)
            return (
              <button
                key={order.id}
                type="button"
                className={`dispatcher-tile${drag?.id === order.id ? ' dragging' : ''}${assigned > 0 ? ' assigned' : ''}${split ? ' split' : ''}${live ? ' live' : ''}${selectedOrderId === order.id ? ' open' : ''}`}
                style={
                  split
                    ? { ['--assigned-color']: assignedColor } as CSSProperties
                    : assigned > 0 && !hasUnassignedDays(order)
                      ? { background: assignedColor, color: contrastText(assignedColor) }
                      : undefined
                }
                onPointerDown={(event) =>
                  beginPointer(event, { kind: 'order', id: order.id, x: event.clientX, y: event.clientY })
                }
              >
                <strong>{order.orderNo}</strong>
                <span>{formatMonthDay(order.startDate)}</span>
                <em>{orderStatus(order)}</em>
              </button>
            )
          })}
        </div>
        {creatingOrder ? (
          <div className="dispatcher-overlay">
            <DispatcherCalendarCard
              title="创建订单"
              subtitle="在日历上按住并拖选起止日期。"
              marks={[]}
              selectable
              pickFrom={createRangeStart}
              pickTo={createRangeEnd}
              rangeStart={createCalStart}
              rangeEnd={createCalEnd}
              onClose={closeCreateOrder}
              onDatePointerDown={onCreateDayPointerDown}
              onDatePointerEnter={onCreateDayPointerEnter}
              footer={
                createFrom && createTo ? (
                  <button
                    type="button"
                    className="driver-primary-button"
                    disabled={busy}
                    onClick={() => void createOrderRange()}
                  >
                    添加 {formatMonthDay(createFrom)}
                    {createFrom !== createTo ? `–${formatMonthDay(createTo)}` : ''} 仅日期
                  </button>
                ) : (
                  <p className="dispatcher-hint">不知道订单号时，在日历上按住并拖选起止日期。</p>
                )
              }
            />
          </div>
        ) : selectedOrder ? (
          <div className="dispatcher-overlay">
            {orderEditorDay && selectedOrderDay ? (
              <DispatcherDayCard
                title={`${selectedOrder.orderNo} · ${formatMonthDay(selectedOrderDay.serviceDate)}`}
                subtitle={selectedOrderDay.driverName ? `${selectedOrderDay.driverName} · 当日行程` : '当日行程'}
                onClose={() => setSelectedOrderDayId(null)}
              >
                <DriverDayEditor key={orderEditorDay.items[0].itineraryDayId} day={orderEditorDay} onChanged={loadBoard} />
              </DispatcherDayCard>
            ) : (
              <DispatcherCalendarCard
                title={selectedOrder.orderNo}
                bodyRef={orderCalBodyRef}
                bodyKey="order"
                onBodyScroll={syncDriverCalendarFromOrder}
                subtitle={`${formatMonthDay(selectedOrder.startDate)} · ${selectedOrder.dayCount} 天 · ${assignedDayCount(selectedOrder) > 0 ? orderStatus(selectedOrder) : '未分配'}`}
                marks={orderMarks}
                rangeStart={orderRangeStart}
                rangeEnd={orderRangeEnd}
                infoOpen={orderInfoOpen}
                onInfoOpenChange={(open) => {
                  setOrderInfoOpen(open)
                  if (open) {
                    setSelectedOrderDayId(null)
                  }
                }}
                platformOrderNo={orderPlatformNo}
                onPlatformOrderNoChange={changeOrderPlatformNo}
                notes={orderNotes}
                onNotesChange={changeOrderNotes}
                onNotesSave={() => {
                  void saveOrderInfo()
                }}
                notesExtra={
                  <label className="dispatcher-notes-field">
                    订单截图
                    <OrderFilesBlock
                      compact
                      orderId={selectedOrder.id}
                      files={selectedOrder.files ?? []}
                      onChanged={() => void loadBoard()}
                    />
                  </label>
                }
                onRemove={deleteSelectedOrder}
                removeLabel="删除订单"
                onClose={() => setSelectedOrderId(null)}
                onCardPointerDown={(event) =>
                  beginPointer(event, { kind: 'order', id: selectedOrder.id, x: event.clientX, y: event.clientY })
                }
                onDayPointerDown={(event, mark) =>
                  beginPointer(event, {
                    kind: 'day',
                    id: mark.dayId,
                    orderId: mark.orderId,
                    dayId: mark.dayId,
                    from: 'order',
                    x: event.clientX,
                    y: event.clientY,
                  })
                }
              />
            )}
          </div>
        ) : null}
      </section>

      <section
        className={`dispatcher-pane drivers${hoverDriverId && selectedDriverId && hoverDriverId === selectedDriverId && drag && drag.kind !== 'driver' ? ' drop' : ''}`}
        data-driver-pane="true"
      >
        <div className="dispatcher-pane-bar">
          <h2>司导</h2>
          <button type="button" className="dispatcher-chip" onClick={() => setShowHidden((current) => !current)}>
            {showHidden ? '收起已隐藏' : `已隐藏 ${hiddenDrivers.length}`}
          </button>
        </div>
        {showHidden && hiddenDrivers.length > 0 ? (
          <div className="dispatcher-hidden">
            {hiddenDrivers.map((driver) => (
              <button key={driver.id} type="button" className="dispatcher-chip" onClick={() => restoreDriver(driver.id)}>
                恢复 {driver.name}
              </button>
            ))}
          </div>
        ) : null}
        <p className="dispatcher-hint">点击司导看未来行程。名字旁的笔记图标可改备注，右侧可移除。置顶在图标右上角。</p>
        <div className="dispatcher-grid">
          {visibleDrivers.length === 0 ? <p className="dispatcher-empty">暂无司导</p> : null}
          {visibleDrivers.map((driver) => {
            const pinned = layout.pinnedIds.includes(driver.id)
            return (
              <div
                key={driver.id}
                data-driver-id={driver.id}
                className={`dispatcher-driver${hoverDriverId === driver.id && drag && drag.kind !== 'driver' ? ' drop' : ''}${pinned ? ' pinned' : ''}${drag?.id === driver.id ? ' dragging' : ''}${selectedDriverId === driver.id ? ' open' : ''}`}
              >
                <div className="dispatcher-corner">
                  <button
                    type="button"
                    className={`dispatcher-icon-btn${pinned ? ' active' : ''}`}
                    aria-label={pinned ? '取消置顶' : '置顶'}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => togglePin(driver.id)}
                  >
                    <PinIcon filled={pinned} />
                  </button>
                </div>
                <button
                  type="button"
                  className="dispatcher-avatar"
                  onPointerDown={(event) =>
                    beginPointer(event, { kind: 'driver', id: driver.id, x: event.clientX, y: event.clientY })
                  }
                >
                  <b>{driver.name.slice(0, 1)}</b>
                  <span>{driver.name}</span>
                </button>
              </div>
            )
          })}
        </div>
        {selectedDriver ? (
          <div className="dispatcher-overlay">
            <DispatcherCalendarCard
              key={selectedDriver.id}
              title={selectedDriver.name}
              bodyRef={driverCalBodyRef}
              bodyKey="driver"
              subtitle={driverMarks.length > 0 ? `未来 ${driverMarks.length} 天有行程` : '暂无未来行程'}
              marks={driverMarks}
              rangeStart={today}
              rangeEnd={driverRangeEnd}
              notes={driverNotes}
              onNotesChange={setDriverNotes}
              onNotesSave={() => {
                void saveDriverNotes()
              }}
              onClose={() => setSelectedDriverId(null)}
              onRemove={() => hideDriver(selectedDriver.id)}
              onDayPointerDown={(event, mark) =>
                beginPointer(event, {
                  kind: 'day',
                  id: mark.dayId,
                  orderId: mark.orderId,
                  dayId: mark.dayId,
                  from: 'driver',
                  x: event.clientX,
                  y: event.clientY,
                })
              }
            />
          </div>
        ) : null}
      </section>

      {drag && (draggingOrder || draggingDriver || draggingDay) ? (
        <div className="dispatcher-ghost" style={{ left: drag.x, top: drag.y }}>
          {draggingOrder
            ? draggingOrder.orderNo
            : draggingDay
              ? `${draggingDay.order.orderNo} ${formatMonthDay(draggingDay.day.serviceDate)}`
              : draggingDriver?.name}
        </div>
      ) : null}
    </div>
  )
}

function toOrderCalendarDay(order: Order, day: ItineraryDay): DriverCalendarDay {
  return {
    date: day.serviceDate,
    items: [
      {
        orderId: order.id,
        orderNo: order.orderNo,
        itineraryDayId: day.id,
        endLocation: day.endLocation,
        description: day.description,
        activities: [],
      },
    ],
  }
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M15 4.5l4.5 4.5-3 1.5-4.5 4.5-3-3 4.5-4.5L15 4.5zM6 18l4-2" />
    </svg>
  )
}
