import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { message, Modal } from 'antd'
import { authApi, companyApi } from '../../api/auth'
import { clearDayDriver, createOrderWithDays, ordersApi, updateOrderInfo } from '../../api/orders'
import { useAuthenticatedAuth } from '../../auth/authState'
import { AccountMenu } from '../AccountMenu'
import { driversApi } from '../../api/drivers'
import { readCurrentCompanyId } from '../../currentCompany'
import { keepDraft, syncDraft, usePageLoad } from '../../usePageLoad'
import { PRESET_COLORS, contrastText } from '../../calendarUi'
import { addMonths, formatLocalDate, formatMonthDay, laterDate, monthEnd, monthStart, orderedRange, todayLocal } from '../../localDate'
import { conflictDateChoices, ConflictDatePopover, type ConflictDateChoice } from '../../ConflictDatePopover'
import { assignedDriverFocus, driverDisplayLabel, conflictPatternStyle, conflictingOrderIds, hasDispatcherAssignment, hasUnassignedDays, isHistoricalOrder, isIncomplete, isInProgress, isOwnAssignment, isSplitOrder, orderAssignerName, orderDisplayLabel, ordersOnDriverDate, patternForOrder, CONFLICT_RED } from '../../orderFlags'
import { contactLabel } from '../../text'
import type { DriverCalendarDay, ItineraryDay, Order } from '../../types'
import { OrderFilesBlock } from '../OrderFilesBlock'
import { TrashIcon } from '../OrderInfoFields'
import { DriverDayEditor } from '../driver/DriverDayEditor'
import {
  CALENDAR_HOLD_MS,
  type CalendarHold,
  calendarDateFromDrag,
  calendarHoldShifted,
  captureCalendarPointer,
  pointFromDragEvent,
} from '../../calendarDay'
import { DispatcherCalendarCard, DispatcherDayCard, type CalendarMark } from './DispatcherCalendarCard'
import '../driver/driver-calendar.css'
import './dispatcher.css'

const LAYOUT_KEY = 'trailink.dispatcher.driverLayout'
const ASSIGN_LAYOUT_KEY = 'trailink.company.dispatcherLayout'
const DEFAULT_ASSIGNED_COLOR = '#C6F0E0'
const DRAG_THRESHOLD = 8

interface DriverLayout {
  pinnedIds: string[]
  sortIds: string[]
}

interface BoardPerson {
  id: string
  name: string
  notes: string | null
  contact: string | null
  hidden: boolean
}

type OrderFilter = 'unassigned' | 'all'
type PoolFilter = 'open' | 'done'
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

function readLayout(key = LAYOUT_KEY): DriverLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '') as DriverLayout
    return {
      pinnedIds: parsed.pinnedIds ?? [],
      sortIds: parsed.sortIds ?? [],
    }
  } catch {
    return { pinnedIds: [], sortIds: [] }
  }
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

function sortDrivers(drivers: BoardPerson[], layout: DriverLayout) {
  const visible = drivers.filter((driver) => !driver.hidden)
  const pinned = layout.pinnedIds
    .map((id) => visible.find((driver) => driver.id === id))
    .filter((driver): driver is BoardPerson => Boolean(driver))
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

function scrollCalendarToDate(body: HTMLElement | null, date: string) {
  if (!body) {
    return
  }
  const cell = body.querySelector<HTMLElement>(`[data-service-date="${date}"]`)
  if (!cell) {
    return
  }
  const next = body.scrollTop + cell.getBoundingClientRect().top - body.getBoundingClientRect().top - 8
  const max = Math.max(0, body.scrollHeight - body.clientHeight)
  body.scrollTop = Math.min(Math.max(0, next), max)
}

export function DispatcherPage() {
  const { user, setUser } = useAuthenticatedAuth()
  const location = useLocation()
  const assignDesk = location.pathname.startsWith('/company/assign')
  const layoutKey = assignDesk ? ASSIGN_LAYOUT_KEY : LAYOUT_KEY
  const today = formatLocalDate(todayLocal())
  const companyId = user.companyId || readCurrentCompanyId()
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<BoardPerson[]>([])
  const [filter, setFilter] = useState<OrderFilter>('unassigned')
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('open')
  const [assignedColor, setAssignedColor] = useState(user.assignedColor || DEFAULT_ASSIGNED_COLOR)
  const [showColors, setShowColors] = useState(false)
  const [layout, setLayout] = useState<DriverLayout>(() => readLayout(layoutKey))
  const [showHidden, setShowHidden] = useState(false)
  const [armedUnbindId, setArmedUnbindId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrderDayId, setSelectedOrderDayId] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [driverFocusDate, setDriverFocusDate] = useState<string | null>(null)
  const [conflictPick, setConflictPick] = useState<{ date: string; driverId: string; anchor: DOMRect } | null>(null)
  const [driverTrips, setDriverTrips] = useState<Order[]>([])
  const [driverTripDriverId, setDriverTripDriverId] = useState<string | null>(null)
  const [driverNotes, setDriverNotes] = useState('')
  const driverNotesRef = useRef('')
  const driverNoteLock = useRef(false)
  const [orderPlatformNo, setOrderPlatformNo] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [orderCompanyId, setOrderCompanyId] = useState<string | null>(null)
  const [orderCompanyName, setOrderCompanyName] = useState('')
  const [orderInfoOpen, setOrderInfoOpen] = useState(false)
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [orderHintOpen, setOrderHintOpen] = useState(false)
  const [peopleHintOpen, setPeopleHintOpen] = useState(false)
  const [createRangeStart, setCreateRangeStart] = useState<string | null>(null)
  const [createRangeEnd, setCreateRangeEnd] = useState<string | null>(null)
  const createRangeDragging = useRef(false)
  const createHoldRef = useRef<CalendarHold | null>(null)
  const ordersRef = useRef<Order[]>([])
  const orderPlatformNoRef = useRef('')
  const orderNotesRef = useRef('')
  const orderCompanyIdRef = useRef<string | null>(null)
  const selectedOrderIdRef = useRef<string | null>(null)
  const loadedOrderRef = useRef({
    id: null as string | null,
    platform: '',
    notes: '',
    companyId: null as string | null,
  })
  const loadedDriverRef = useRef({ id: undefined as string | null | undefined, notes: '' })
  const companyBindGen = useRef(0)
  const selectOrderDayRef = useRef<(dayId: string) => void>(() => undefined)
  const openOwnedDriverDayRef = useRef<(orderId: string, dayId?: string) => void>(() => undefined)
  const toggleOrderRef = useRef<(orderId: string) => void>(() => undefined)
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
  const calendarJumping = useRef(false)
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

  const conflictedIds = useMemo(() => {
    const source =
      !assignDesk && driverTripDriverId === selectedDriverId && driverTrips.length > 0
        ? mergeOrders(orders, driverTrips)
        : orders
    return conflictingOrderIds(source)
  }, [assignDesk, driverTripDriverId, driverTrips, orders, selectedDriverId])
  const visibleOrders = useMemo(() => {
    const scoped = assignDesk && companyId
      ? orders.filter((order) => order.companyId === companyId)
      : orders
    const listed =
      filter === 'unassigned'
        ? scoped.filter((order) =>
            order.dayCount > 0 &&
            (assignDesk ? !hasDispatcherAssignment(order) : hasUnassignedDays(order) || conflictedIds.has(order.id)))
        : scoped.filter((order) => order.dayCount > 0 && !isHistoricalOrder(order, today))
    return sortBoardOrders(listed, today)
  }, [assignDesk, companyId, conflictedIds, filter, orders, today])
  const [createFrom, createTo] = createRangeStart ? orderedRange(createRangeStart, createRangeEnd) : [null, null]
  const createCalStart = formatLocalDate(monthStart(todayLocal()))
  const createCalEnd = formatLocalDate(monthEnd(addMonths(todayLocal(), 3)))

  const visibleDrivers = useMemo(() => sortDrivers(drivers, layout), [drivers, layout])
  const dispatcherOrders = useMemo(() => {
    if (!assignDesk || !selectedDriverId || !companyId) {
      return []
    }
    const owned = orders.filter(
      (order) => order.companyId === companyId && order.assignedDispatcherUserId === selectedDriverId && order.dayCount > 0,
    )
    const listed =
      poolFilter === 'open'
        ? owned.filter((order) => isIncomplete(order, today))
        : owned.filter((order) => !isIncomplete(order, today))
    return sortBoardOrders(listed, today)
  }, [assignDesk, companyId, orders, poolFilter, selectedDriverId, today])
  const hiddenDrivers = useMemo(
    () => drivers.filter((driver) => driver.hidden),
    [drivers],
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

  const loadBoard = useCallback(async () => {
    try {
      if (assignDesk) {
        const [nextOrders, home] = await Promise.all([ordersApi.list(), companyApi.desk(companyId)])
        setOrders(nextOrders)
        setDrivers((home.desk?.dispatchers ?? []).map((item) => ({
          id: item.userId,
          name: item.name,
          notes: item.notes,
          contact: item.contact,
          hidden: Boolean(item.hidden),
        })))
        return
      }
      const [nextOrders, nextDrivers] = await Promise.all([ordersApi.list(), driversApi.list()])
      setOrders(nextOrders)
      setDrivers(nextDrivers)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载调度台失败')
    }
  }, [assignDesk, companyId])

  usePageLoad(() => {
    if (dragRef.current) {
      return
    }
    return loadBoard()
  }, companyId)

  useEffect(() => {
    if (assignDesk || !selectedDriverId) {
      return
    }
    let cancelled = false
    ordersApi.list({ driverId: selectedDriverId }).then((trips) => {
      if (!cancelled) {
        setDriverTripDriverId(selectedDriverId)
        setDriverTrips(trips)
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        message.error(error instanceof Error ? error.message : '加载司导行程失败')
      }
    })
    return () => {
      cancelled = true
    }
  }, [assignDesk, selectedDriverId, orders])

  useEffect(() => {
    // 路由在调度台和派给调度之间切换时，需要重新载入各自的本地布局。
    // oxlint-disable-next-line react/set-state-in-effect
    setLayout(readLayout(layoutKey))
  }, [layoutKey])

  useEffect(() => {
    if (!selectedOrderId && !selectedDriverId) {
      return
    }
    function onClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (target.closest('.dispatcher-card, .conflict-date-popover, button, a, input, textarea, select, label, [role="button"], .ant-modal-root, .account-menu')) {
        return
      }
      setSelectedOrderDayId(null)
      setSelectedOrderId(null)
      setOrderInfoOpen(false)
      setSelectedDriverId(null)
      setConflictPick(null)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [selectedOrderId, selectedDriverId])

  useEffect(() => {
    if (!armedUnbindId) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('[data-unbind-driver]')) {
        return
      }
      setArmedUnbindId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [armedUnbindId])

  useEffect(() => {
    const notes = drivers.find((item) => item.id === selectedDriverId)?.notes ?? ''
    const loaded = loadedDriverRef.current
    const switched = loaded.id !== selectedDriverId
    syncDraft(driverNotesRef, setDriverNotes, loaded.notes, notes, switched)
    if (switched) {
      // oxlint-disable-next-line react/set-state-in-effect
      setPoolFilter('open')
    }
    loadedDriverRef.current = { id: selectedDriverId, notes }
  }, [drivers, selectedDriverId])

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId
    const order = orders.find((item) => item.id === selectedOrderId)
    const nextPlatform = order?.platformOrderNo ?? ''
    const nextNotes = order?.notes ?? ''
    const nextCompanyId = order?.companyId ?? null
    const nextCompanyName = order?.companyName ?? ''
    const loaded = loadedOrderRef.current
    const switched = loaded.id !== selectedOrderId
    if (switched) {
      setSelectedOrderDayId(null)
      setOrderInfoOpen(false)
    }
    syncDraft(orderPlatformNoRef, setOrderPlatformNo, loaded.platform, nextPlatform, switched)
    syncDraft(orderNotesRef, setOrderNotes, loaded.notes, nextNotes, switched)
    const companyId = keepDraft(orderCompanyIdRef.current, switched ? undefined : loaded.companyId, nextCompanyId)
    if (Object.is(companyId, nextCompanyId)) {
      orderCompanyIdRef.current = nextCompanyId
      // oxlint-disable-next-line react/set-state-in-effect
      setOrderCompanyId(nextCompanyId)
      setOrderCompanyName(nextCompanyName)
    }
    loadedOrderRef.current = {
      id: selectedOrderId,
      platform: nextPlatform,
      notes: nextNotes,
      companyId: nextCompanyId,
    }
  }, [orders, selectedOrderId])

  useEffect(() => {
    function cancelCreateHold() {
      const hold = createHoldRef.current
      if (!hold) {
        return null
      }
      window.clearTimeout(hold.timer)
      createHoldRef.current = null
      return hold
    }
    function resolveCreateHold(event: PointerEvent | TouchEvent, selectIfTap: boolean) {
      const hold = createHoldRef.current
      if (!hold) {
        return
      }
      const point = pointFromDragEvent(event)
      const shifted = point ? calendarHoldShifted(hold, point.x, point.y) : false
      cancelCreateHold()
      if (selectIfTap && !shifted) {
        setCreateRangeStart(hold.date)
        setCreateRangeEnd(hold.date)
      }
    }
    function followCreateDrag(event: PointerEvent | TouchEvent) {
      const hold = createHoldRef.current
      const point = pointFromDragEvent(event)
      if (hold && point && calendarHoldShifted(hold, point.x, point.y)) {
        cancelCreateHold()
        return
      }
      if (!createRangeDragging.current) {
        return
      }
      const date = calendarDateFromDrag(event, true)
      if (date) {
        setCreateRangeEnd((current) => (current === date ? current : date))
      }
    }
    function onMove(event: PointerEvent) {
      followCreateDrag(event)
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
      setHoverOrderPane(current.from === 'driver' && isOverOrderPane(event.clientX, event.clientY))
    }
    function onUp(event: PointerEvent) {
      resolveCreateHold(event, true)
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
        if (current.from === 'driver' && overOrderPane) {
          const orderId = current.kind === 'order' ? current.id : current.orderId
          if (orderId) {
            void unbindDayRef.current(orderId, current.dayId ?? '')
          }
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
      if (pending.kind === 'day' && pending.from === 'driver' && pending.orderId) {
        openOwnedDriverDayRef.current(pending.orderId, pending.dayId)
        return
      }
      if (pending.kind === 'order') {
        toggleOrderRef.current(pending.id)
        return
      }
      if (pending.kind === 'driver') {
        setSelectedDriverId((currentId) => (currentId === pending.id ? null : pending.id))
      }
    }
    function onTouchMove(event: TouchEvent) {
      followCreateDrag(event)
    }
    function onTouchEnd(event: TouchEvent) {
      resolveCreateHold(event, true)
      createRangeDragging.current = false
    }
    function onCancel(event: PointerEvent | TouchEvent) {
      resolveCreateHold(event, false)
      createRangeDragging.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onCancel)
    return () => {
      cancelCreateHold()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [])

  function syncDriverCalendarFromOrder() {
    if (calendarJumping.current || !selectedDriverIdRef.current || selectedOrderDayIdRef.current) {
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
    if (!selectedOrderId || !selectedDriverId || selectedOrderDayId || driverFocusDate) {
      return
    }
    const frame = window.requestAnimationFrame(() => syncDriverCalendarFromOrder())
    return () => window.cancelAnimationFrame(frame)
  }, [selectedOrderId, selectedDriverId, selectedOrderDayId, orderRangeEnd])

  useEffect(() => {
    if (!driverFocusDate) {
      return
    }
    const date = driverFocusDate
    let cancelled = false
    let followUp = 0
    const frame = window.requestAnimationFrame(() => {
      followUp = window.requestAnimationFrame(() => {
        if (cancelled) {
          return
        }
        calendarJumping.current = true
        scrollCalendarToDate(orderCalBodyRef.current, date)
        scrollCalendarToDate(driverCalBodyRef.current, date)
        calendarJumping.current = false
        setDriverFocusDate(null)
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(followUp)
    }
  }, [driverFocusDate, selectedDriverId, selectedOrderId])

  function persistLayout(next: DriverLayout) {
    setLayout(next)
    localStorage.setItem(layoutKey, JSON.stringify(next))
  }

  function persistColor(color: string) {
    if (color === assignedColor) {
      return
    }
    setAssignedColor(color)
    void authApi.updateAssignedColor(color).then(
      (saved) => {
        setUser(saved)
        setAssignedColor(saved.assignedColor || color)
      },
      (error) => {
        setAssignedColor(user.assignedColor || DEFAULT_ASSIGNED_COLOR)
        message.error(error instanceof Error ? error.message : '无法保存已分配颜色')
      },
    )
  }

  function clearCreateHold() {
    const hold = createHoldRef.current
    if (!hold) {
      return
    }
    window.clearTimeout(hold.timer)
    createHoldRef.current = null
  }

  function beginCreateTouchHold(date: string, x: number, y: number, target: HTMLElement, pointerId: number) {
    const existing = createHoldRef.current
    if (existing) {
      existing.x = x
      existing.y = y
      existing.target = target
      if (pointerId >= 0) {
        existing.pointerId = pointerId
      }
      return
    }
    const hold: CalendarHold = {
      pointerId,
      x,
      y,
      date,
      target,
      timer: window.setTimeout(() => {
        if (createHoldRef.current !== hold) {
          return
        }
        createHoldRef.current = null
        createRangeDragging.current = true
        setCreateRangeStart(hold.date)
        setCreateRangeEnd(hold.date)
        if (hold.pointerId >= 0) {
          captureCalendarPointer(hold.target, hold.pointerId)
        }
      }, CALENDAR_HOLD_MS),
    }
    createHoldRef.current = hold
  }

  function closeCreateOrder() {
    clearCreateHold()
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
      const created = await createOrderWithDays({
        startDate: createFrom,
        endDate: createTo,
        companyId: assignDesk ? companyId || undefined : undefined,
      })
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
      if (assignDesk) {
        await ordersApi.assignDispatcher(orderId, driverId)
        message.success('已整单分配给调度员')
      } else {
        await ordersApi.assignDriver(orderId, driverId)
        message.success('已分配给司导')
      }
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : assignDesk ? '无法分配给调度员' : '无法分配给司导')
    } finally {
      assignLock.current = false
      setBusy(false)
    }
  }

  async function unbindDriverDay(orderId: string, dayId: string) {
    const order = orders.find((item) => item.id === orderId)
    const day = order?.days.find((item) => item.id === dayId)
    if (!order || assignLock.current || busy) {
      return
    }
    if (assignDesk) {
      if (!order.assignedDispatcherUserId) {
        return
      }
      assignLock.current = true
      setBusy(true)
      try {
        await ordersApi.assignDispatcher(orderId, null)
        message.success('已整单收回，司导分配一并取消')
        await loadBoard()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '取消分配失败')
      } finally {
        assignLock.current = false
        setBusy(false)
      }
      return
    }
    if (!day?.driverId) {
      return
    }
    if (!isOwnAssignment(order, day, user.id)) {
      message.warning('只能移除自己分配的订单')
      return
    }
    assignLock.current = true
    setBusy(true)
    try {
      if (isSplitOrder(order)) {
        await ordersApi.updateDay(orderId, dayId, clearDayDriver(day))
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

  async function releaseConflictDay(choice: ConflictDateChoice) {
    const source = visibleTrips.length > 0 ? visibleTrips : orders
    const order = source.find((item) => item.id === choice.orderId) ?? orders.find((item) => item.id === choice.orderId)
    const day = order?.days.find((item) => item.id === choice.dayId)
    if (!order || !day || assignLock.current || busy) {
      return
    }
    if (!isOwnAssignment(order, day, user.id)) {
      message.warning('只能移除自己分配的订单')
      return
    }
    assignLock.current = true
    setBusy(true)
    try {
      await ordersApi.updateDay(order.id, day.id, clearDayDriver(day))
      message.success('已取消该日拆单')
      setConflictPick(null)
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '取消行程失败')
    } finally {
      assignLock.current = false
      setBusy(false)
    }
  }

  async function assignDay(orderId: string, dayId: string, driverId: string) {
    if (assignDesk) {
      void assignOrder(orderId, driverId)
      return
    }
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
      })
      message.success('已按天分配给司导')
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '无法分配给司导')
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
    persistLayout({ ...layout, pinnedIds })
  }

  function deleteSelectedOrder() {
    const order = selectedOrder
    if (!order || assignLock.current || busy) {
      return
    }
    const releaseToPool = user.role === 'dispatcher' && Boolean(order.companyId)
    Modal.confirm({
      title: releaseToPool ? '确定退回公司池？' : '确定删除这个订单？',
      content: (() => {
        const label = orderDisplayLabel(order)
        if (!releaseToPool) {
          return label || '该订单'
        }
        return label
          ? `${label} 将解除调度员和已派司导，订单仍由公司保留。`
          : '将解除调度员和已派司导，订单仍由公司保留。'
      })(),
      okText: releaseToPool ? '退回' : '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        assignLock.current = true
        setBusy(true)
        try {
          await ordersApi.remove(order.id)
          message.success(releaseToPool ? '已退回公司池' : '订单已删除')
          setSelectedOrderId(null)
          setSelectedOrderDayId(null)
          await loadBoard()
        } catch (error) {
          message.error(error instanceof Error ? error.message : releaseToPool ? '无法退回公司池' : '删除订单失败')
          throw error
        } finally {
          assignLock.current = false
          setBusy(false)
        }
      },
    })
  }

  async function writeHidden(driverId: string, hidden: boolean) {
    if (assignDesk) {
      await companyApi.setDispatcherHidden(driverId, hidden)
      setDrivers((current) => current.map((item) => (item.id === driverId ? { ...item, hidden } : item)))
      return
    }
    const saved = await driversApi.setHidden(driverId, hidden)
    setDrivers((current) => current.map((item) => (item.id === saved.id ? { ...item, hidden: saved.hidden } : item)))
  }

  async function hideDriver(driverId: string) {
    try {
      await writeHidden(driverId, true)
      persistLayout({
        pinnedIds: layout.pinnedIds.filter((id) => id !== driverId),
        sortIds: layout.sortIds.filter((id) => id !== driverId),
      })
      setSelectedDriverId((current) => (current === driverId ? null : current))
    } catch (error) {
      message.error(error instanceof Error ? error.message : assignDesk ? '隐藏调度员失败' : '隐藏司导失败')
    }
  }

  async function restoreDriver(driverId: string) {
    setArmedUnbindId((current) => (current === driverId ? null : current))
    try {
      await writeHidden(driverId, false)
    } catch (error) {
      message.error(error instanceof Error ? error.message : assignDesk ? '恢复调度员失败' : '恢复司导失败')
    }
  }

  function canUnbind(personId: string) {
    return assignDesk ? personId !== user.id : user.role === 'dispatcher' && personId !== user.driverId
  }

  function requestUnbind(driver: BoardPerson) {
    if (armedUnbindId !== driver.id) {
      setArmedUnbindId(driver.id)
      return
    }
    void confirmUnbind(driver)
  }

  async function confirmUnbind(driver: BoardPerson) {
    setArmedUnbindId(null)
    try {
      if (assignDesk) {
        await companyApi.removeDispatcher(driver.id, companyId)
      } else {
        await driversApi.unbind(driver.id)
      }
      persistLayout({
        pinnedIds: layout.pinnedIds.filter((id) => id !== driver.id),
        sortIds: layout.sortIds.filter((id) => id !== driver.id),
      })
      setSelectedDriverId((current) => (current === driver.id ? null : current))
      message.success(assignDesk ? '已解除绑定，未完成的订单已收回' : '已解除绑定，未完成的日期已收回')
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '解除绑定失败')
    }
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

  async function changeOrderCompany(nextId: string, nextName: string) {
    const order = selectedOrder ?? ordersRef.current.find((item) => item.id === selectedOrderId)
    const orderId = order?.id ?? null
    const previousId = order?.companyId ?? null
    const previousName = order?.companyName ?? ''
    const gen = ++companyBindGen.current
    orderCompanyIdRef.current = nextId
    setOrderCompanyId(nextId)
    setOrderCompanyName(nextName)
    if (!order || previousId === nextId) {
      return
    }
    try {
      const saved = await updateOrderInfo(order, { companyId: nextId })
      if (gen !== companyBindGen.current || selectedOrderIdRef.current !== orderId) {
        return
      }
      orderCompanyIdRef.current = saved.companyId ?? null
      setOrderCompanyId(orderCompanyIdRef.current)
      setOrderCompanyName(saved.companyName ?? nextName)
      message.success(saved.companyName ? `已绑定${saved.companyName}` : '已绑定公司')
      await loadBoard()
    } catch (error) {
      if (gen === companyBindGen.current && selectedOrderIdRef.current === orderId) {
        orderCompanyIdRef.current = previousId
        setOrderCompanyId(previousId)
        setOrderCompanyName(previousName)
      }
      message.error(error instanceof Error ? error.message : '绑定公司失败')
    }
  }

  async function saveOrderInfo() {
    const order = selectedOrder ?? ordersRef.current.find((item) => item.id === selectedOrderId)
    if (!order) {
      return
    }
    const platformOrderNo = orderPlatformNoRef.current
    const notes = orderNotesRef.current
    const nextCompanyId = orderCompanyIdRef.current
    try {
      const saved = await updateOrderInfo(order, { platformOrderNo, notes, companyId: nextCompanyId })
      orderPlatformNoRef.current = saved.platformOrderNo ?? ''
      orderNotesRef.current = saved.notes ?? ''
      orderCompanyIdRef.current = saved.companyId ?? null
      setOrderPlatformNo(orderPlatformNoRef.current)
      setOrderNotes(orderNotesRef.current)
      setOrderCompanyId(orderCompanyIdRef.current)
      setOrderCompanyName(saved.companyName ?? '')
      message.success('订单已保存')
      setOrderInfoOpen(false)
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存订单失败')
    }
  }

  function showOrder(orderId: string) {
    setCreatingOrder(false)
    setCreateRangeStart(null)
    setCreateRangeEnd(null)
    setConflictPick(null)
    setSelectedOrderDayId(null)
    setOrderInfoOpen(false)
    setSelectedOrderId(orderId)
  }

  function openOwnedDriverDay(orderId: string, dayId?: string) {
    const order = ordersRef.current.find((item) => item.id === orderId)
    const day = order?.days.find((item) => item.id === dayId)
    if (!order || !day || !isOwnAssignment(order, day, user.id)) {
      return
    }
    showOrder(orderId)
  }

  function toggleOrder(orderId: string) {
    if (selectedOrderIdRef.current === orderId) {
      setSelectedOrderId(null)
      return
    }
    showOrder(orderId)
    if (assignDesk) {
      return
    }
    const order = ordersRef.current.find((item) => item.id === orderId)
    const focus = order ? assignedDriverFocus(order, today) : null
    if (!focus) {
      return
    }
    setSelectedDriverId(focus.driverId)
    setDriverFocusDate(focus.date)
  }

  function changeDriverNotes(value: string) {
    driverNotesRef.current = value
    setDriverNotes(value)
  }

  async function saveDriverNotes() {
    const driver = selectedDriver ?? driversRef.current.find((item) => item.id === selectedDriverId)
    const notes = driverNotesRef.current
    if (!driver || driverNoteLock.current || (driver.notes ?? '') === notes) {
      return
    }
    driverNoteLock.current = true
    try {
      if (assignDesk) {
        const home = await companyApi.updateDispatcherNotes(driver.id, notes)
        const saved = home.desk?.dispatchers.find((item) => item.userId === driver.id)
        driverNotesRef.current = saved?.notes ?? ''
        setDriverNotes(driverNotesRef.current)
        setDrivers((current) =>
          current.map((item) => (item.id === driver.id ? { ...item, notes: saved?.notes ?? '' } : item)),
        )
      } else {
        const saved = await driversApi.updateNotes(driver.id, { notes })
        driverNotesRef.current = saved.notes ?? ''
        setDriverNotes(driverNotesRef.current)
        setDrivers((current) => current.map((item) => (item.id === saved.id ? saved : item)))
      }
      message.success('备注已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存备注失败')
    } finally {
      driverNoteLock.current = false
    }
  }

  useEffect(() => {
    assignOrderRef.current = assignOrder
    assignDayRef.current = assignDay
    unbindDayRef.current = unbindDriverDay
    reorderDriverRef.current = reorderDriver
    selectOrderDayRef.current = selectOrderDay
    openOwnedDriverDayRef.current = openOwnedDriverDay
    toggleOrderRef.current = toggleOrder
    selectedDriverIdRef.current = selectedDriverId
    selectedOrderDayIdRef.current = selectedOrderDayId
  })

  const orderMarks: CalendarMark[] = (selectedOrder?.days ?? []).map((day) => {
    const assigned = Boolean(day.driverId)
    const label = day.driverId
      ? (day.driverName ?? driverById.get(day.driverId)?.name)?.slice(0, 1)
      : '未派'
    return {
      date: day.serviceDate,
      dayId: day.id,
      orderId: selectedOrder!.id,
      label,
      assigned,
      color: assigned ? assignedColor : '#FFF1B8',
      textColor: assigned ? contrastText(assignedColor) : '#d46b08',
    }
  })

  const visibleTrips = !assignDesk && driverTripDriverId === selectedDriverId ? driverTrips : []
  const conflictOrders = conflictPick ? ordersOnDriverDate(visibleTrips.length > 0 ? visibleTrips : orders, conflictPick.driverId, conflictPick.date) : []
  const conflictIds = conflictOrders.map((order) => order.id)
  const driverMarks: CalendarMark[] = (assignDesk
    ? orders
        .filter((order) => order.assignedDispatcherUserId === selectedDriverId)
        .flatMap((order) =>
          order.days
            .filter((day) => day.serviceDate >= today)
            .map((day) => ({
              date: day.serviceDate,
              dayId: day.id,
              orderId: order.id,
              owned: true,
              label: orderDisplayLabel(order).slice(0, 2) || undefined,
            })),
        )
    : collapseDriverMarks(visibleTrips.flatMap((order) =>
        order.days
          .filter((day) => day.driverId === selectedDriverId && day.serviceDate >= today)
          .map((day) => {
            const owned = isOwnAssignment(order, day, user.id)
            return {
              date: day.serviceDate,
              dayId: day.id,
              orderId: order.id,
              owned,
              label: owned ? orderAssignerName(order, day) : undefined,
            }
          }),
      ))
  ).sort((left, right) => left.date.localeCompare(right.date)).map((mark) => {
    if (!selectedDriverId || assignDesk || ordersOnDriverDate(visibleTrips, selectedDriverId, mark.date).length < 2) {
      return mark
    }
    return { ...mark, conflict: true, color: CONFLICT_RED, textColor: '#fff' }
  })

  const driverRangeEnd = laterDate(driverMarks.at(-1)?.date, selectedOrder ? orderRangeEnd : undefined, today) || today

  const draggingOrder =
    drag?.kind === 'order' ? orders.find((order) => order.id === drag.id) : undefined
  const draggingDriver = drag?.kind === 'driver' ? drivers.find((driver) => driver.id === drag.id) : undefined
  const draggingDay =
    drag?.kind === 'day'
      ? orders.flatMap((order) => order.days.map((day) => ({ order, day }))).find((item) => item.day.id === drag.dayId)
      : undefined

  function renderOrderTile(order: Order, from: 'order' | 'driver' = 'order') {
    const byDriver = !assignDesk || from === 'driver'
    const assigned = byDriver ? order.assignedDayCount : hasDispatcherAssignment(order) ? order.dayCount : 0
    const split = byDriver ? isSplitOrder(order) : false
    const conflicted = conflictedIds.has(order.id)
    const focusPattern = conflictIds.includes(order.id) ? patternForOrder([...conflictedIds], order.id) : undefined
    const live = isInProgress(order, today)
    const fullyAssigned = byDriver ? assigned > 0 && !hasUnassignedDays(order) : hasDispatcherAssignment(order)
    return (
      <button
        key={order.id}
        type="button"
        className={`dispatcher-tile${drag?.id === order.id ? ' dragging' : ''}${assigned > 0 ? ' assigned' : ''}${split ? ' split' : ''}${conflicted ? ' conflict' : ''}${live ? ' live' : ''}${selectedOrderId === order.id ? ' open' : ''}`}
        style={
          focusPattern
            ? ({ ...conflictPatternStyle(focusPattern), ['--assigned-color']: assignedColor } as CSSProperties)
            : split || conflicted
              ? ({ ['--assigned-color']: assignedColor } as CSSProperties)
              : fullyAssigned
                ? { background: assignedColor, color: contrastText(assignedColor) }
                : undefined
        }
        onPointerDown={(event) =>
          beginPointer(event, { kind: 'order', id: order.id, from, x: event.clientX, y: event.clientY })
        }
      >
        <strong>{orderDisplayLabel(order)}</strong>
        <span>{formatMonthDay(order.startDate)}</span>
        <em>{from === 'driver' ? `${order.dayCount} 天` : orderStatus(order, byDriver)}</em>
      </button>
    )
  }

  function orderStatus(order: Order, byDriver = false) {
    if (assignDesk && !byDriver) {
      return order.assignedDispatcherName || (hasDispatcherAssignment(order) ? '已分配' : `${order.dayCount} 天`)
    }
    const assigned = order.assignedDayCount
    if (assigned === 0) {
      return isInProgress(order, today) ? '进行中' : `${order.dayCount} 天`
    }
    if (assigned < order.dayCount || isSplitOrder(order)) {
      return '拆分'
    }
    return isInProgress(order, today) ? '进行中' : '已分配'
  }

  if (assignDesk && user && user.role !== 'company') {
    return <Navigate to="/dispatcher" replace />
  }

  return (
    <div className="dispatcher-page">
      <header className="dispatcher-header">
        <div>
          <strong className="dispatcher-name">
            {assignDesk
              ? user.companies.find((item) => item.id === companyId)?.name || user.companyName || '公司'
              : user.name.trim() || '调度员'}
          </strong>
          <p>{assignDesk ? '派给调度' : '调度台'}</p>
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
        <DeskHint
          open={orderHintOpen}
          onToggle={() => setOrderHintOpen((current) => !current)}
          text={
            assignDesk
              ? '这里把本公司订单整单分给一位调度员。同一时间只能分给一个人。拖动订单或某一天到调度员都是整单分配；从调度员订单池拖回订单区即整单收回，已经派给司导的日期也会取消。未分配是还没派给调度员的单。点开订单看日历，日期上标的是司导。点开调度员可看他未完成和已完成的单，并写公司备注。'
              : '创建订单与司导界面相同：触屏按住不动约 0.5 秒再拖选起止日期，鼠标按下即拖。新建单不自动绑定所属公司，点开后搜索绑定。未分配是还有空日期的单，以及同一司导日期重叠的冲突单，过期未派完也在这里。点击订单看日历，可改所属公司、公司订单号和备注。已派给司导的订单会同时打开该司导，并跳到对应日期；拆单打开第一个已派日期的司导。改绑后新公司能在派给调度里看到。点击某一天编辑行程，拖动某一天只派那天。拖动卡片整单派单。从司导卡片把自己分配的一天拖回订单区可取消：拆单只取消那天，未拆单取消整单。其他人分配的日期也会显示，但不写公司或调度员的名字，也不能移除。已派完且结束的单不出现在这里，只在公司信息里查看。'
          }
        />
        <div className="dispatcher-grid">
          {visibleOrders.length === 0 ? <p className="dispatcher-empty">暂无订单</p> : null}
          {visibleOrders.map((order) => renderOrderTile(order))}
        </div>
        {creatingOrder ? (
          <div className="dispatcher-overlay">
            <DispatcherCalendarCard
              title="创建订单"
              subtitle="触屏按住不动约 0.5 秒再拖选，鼠标按下即拖。"
              marks={[]}
              selectable
              pickFrom={createRangeStart}
              pickTo={createRangeEnd}
              rangeStart={createCalStart}
              rangeEnd={createCalEnd}
              onClose={closeCreateOrder}
              onDatePointerDown={onCreateDayPointerDown}
              onDateTouchHold={beginCreateTouchHold}
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
                  <p className="dispatcher-hint">不知道订单号时，触屏按住不动约 0.5 秒再拖选起止日期，鼠标按下即拖。</p>
                )
              }
            />
          </div>
        ) : selectedOrder ? (
          <div className="dispatcher-overlay">
            {orderEditorDay && selectedOrderDay ? (
              <DispatcherDayCard
                title={[orderDisplayLabel(selectedOrder), formatMonthDay(selectedOrderDay.serviceDate)].filter(Boolean).join(' · ')}
                subtitle={selectedOrderDay.driverName ? `${selectedOrderDay.driverName} · 当日行程` : '当日行程'}
                onClose={() => setSelectedOrderDayId(null)}
                closeLabel="返回日历"
              >
                <DriverDayEditor key={orderEditorDay.items[0].itineraryDayId} day={orderEditorDay} onChanged={loadBoard} />
              </DispatcherDayCard>
            ) : (
              <DispatcherCalendarCard
                title={orderDisplayLabel(selectedOrder)}
                bodyRef={orderCalBodyRef}
                bodyKey="order"
                onBodyScroll={syncDriverCalendarFromOrder}
                subtitle={`${formatMonthDay(selectedOrder.startDate)} · ${selectedOrder.dayCount} 天 · ${assignDesk ? (selectedOrder.assignedDispatcherName || '未分配') : selectedOrder.assignedDayCount > 0 ? orderStatus(selectedOrder) : '未分配'}`}
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
                companyId={orderCompanyId}
                companyName={orderCompanyName}
                onCompanyChange={assignDesk ? undefined : changeOrderCompany}
                notes={orderNotes}
                onNotesChange={changeOrderNotes}
                notesLabel={assignDesk ? '公司备注' : undefined}
                notesPlaceholder={assignDesk ? '仅公司可见，调度和司导看不到' : undefined}
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
                removeLabel={user.role === 'dispatcher' && selectedOrder.companyId ? '退回公司' : '删除订单'}
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
          <h2>{assignDesk ? '调度员' : '司导'}</h2>
          <button
            type="button"
            className="dispatcher-chip"
            onClick={() => {
              setArmedUnbindId(null)
              setShowHidden((current) => !current)
            }}
          >
            {showHidden ? '收起已隐藏' : `已隐藏 ${hiddenDrivers.length}`}
          </button>
        </div>
        {showHidden && hiddenDrivers.length > 0 ? (
          <div className="dispatcher-hidden">
            {hiddenDrivers.map((driver) => (
              <div key={driver.id} className="dispatcher-hidden-row">
                <button type="button" className="dispatcher-chip" onClick={() => void restoreDriver(driver.id)}>
                  恢复 {driver.name}
                </button>
                {canUnbind(driver.id) ? (
                  <button
                    type="button"
                    className={`dispatcher-icon-btn danger${armedUnbindId === driver.id ? ' release' : ''}`}
                    data-unbind-driver={driver.id}
                    aria-label={armedUnbindId === driver.id ? `确认解除绑定 ${driver.name}` : `解除绑定 ${driver.name}`}
                    aria-pressed={armedUnbindId === driver.id}
                    onClick={() => requestUnbind(driver)}
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <DeskHint
          open={peopleHintOpen}
          onToggle={() => setPeopleHintOpen((current) => !current)}
          text={
            assignDesk
              ? '点击调度员看他接手的本公司订单。未完成和已完成用按钮切换。可排序、置顶，也可以隐藏。名字旁可写公司给这位调度的备注，调度看不到。已隐藏的可以恢复。垃圾桶先套红框，再点一次才解除绑定，并收回未完成的订单。不能解除自己。从订单池拖回订单区即整单收回，司导一并取消。'
              : '点击司导看未来行程。名字旁的笔记图标可改备注，右侧可隐藏。置顶在图标右上角。已隐藏的可以恢复。垃圾桶先套红框，再点一次才解除绑定，并收回未完成订单里分给这位司导的日期。已结束的行程保留。'
          }
        />
        <div className="dispatcher-grid">
          {visibleDrivers.length === 0 ? <p className="dispatcher-empty">{assignDesk ? '暂无调度员' : '暂无司导'}</p> : null}
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
                  aria-label={driver.name}
                  title={driver.name}
                  onPointerDown={(event) =>
                    beginPointer(event, { kind: 'driver', id: driver.id, x: event.clientX, y: event.clientY })
                  }
                >
                  <b>{driver.name.slice(0, 1)}</b>
                  <span>{driverDisplayLabel(driver)}</span>
                </button>
              </div>
            )
          })}
        </div>
        {selectedDriver ? (
          <div className="dispatcher-overlay">
            {assignDesk ? (
              <DispatcherDayCard
                title={`${selectedDriver.name} 的订单`}
                subtitle={dispatcherOrders.length > 0 ? `${dispatcherOrders.length} 单` : poolFilter === 'open' ? '没有未完成的单' : '没有已完成的单'}
                notes={driverNotes}
                onNotesChange={changeDriverNotes}
                onNotesSave={() => {
                  void saveDriverNotes()
                }}
                notesLabel="公司备注"
                notesPlaceholder="仅公司可见，调度看不到"
                onClose={() => setSelectedDriverId(null)}
                onRemove={() => void hideDriver(selectedDriver.id)}
                removeLabel="隐藏"
              >
                <div className="dispatcher-filters">
                  <button
                    type="button"
                    className={`dispatcher-chip${poolFilter === 'open' ? ' active' : ''}`}
                    onClick={() => setPoolFilter('open')}
                  >
                    未完成订单
                  </button>
                  <button
                    type="button"
                    className={`dispatcher-chip${poolFilter === 'done' ? ' active' : ''}`}
                    onClick={() => setPoolFilter('done')}
                  >
                    已完成订单
                  </button>
                </div>
                <div className="dispatcher-grid">
                  {dispatcherOrders.length === 0 ? <p className="dispatcher-empty">暂无订单</p> : null}
                  {dispatcherOrders.map((order) => renderOrderTile(order, 'driver'))}
                </div>
              </DispatcherDayCard>
            ) : (
              <DispatcherCalendarCard
                key={selectedDriver.id}
                title={selectedDriver.name}
                meta={`联系方式 ${contactLabel(selectedDriver.contact)}`}
                bodyRef={driverCalBodyRef}
                bodyKey="driver"
                subtitle={driverMarks.length > 0 ? `未来 ${driverMarks.length} 天有行程` : '暂无未来行程'}
                marks={driverMarks}
                rangeStart={today}
                rangeEnd={driverRangeEnd}
                notes={driverNotes}
                onNotesChange={changeDriverNotes}
                onNotesSave={() => {
                  void saveDriverNotes()
                }}
                onClose={() => {
                  setConflictPick(null)
                  setSelectedDriverId(null)
                }}
                onRemove={() => void hideDriver(selectedDriver.id)}
                onDayClick={(mark, anchor) => {
                  if (!selectedDriverId) {
                    return
                  }
                  setConflictPick({ date: mark.date, driverId: selectedDriverId, anchor: anchor.getBoundingClientRect() })
                }}
                onDayPointerDown={(event, mark) => {
                  if (mark.owned === false) {
                    message.warning('只能移除自己分配的订单')
                    return
                  }
                  beginPointer(event, {
                    kind: 'day',
                    id: mark.dayId,
                    orderId: mark.orderId,
                    dayId: mark.dayId,
                    from: 'driver',
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
              />
            )}
          </div>
        ) : null}
      </section>

      {conflictPick && conflictOrders.length > 1 ? (
        <ConflictDatePopover
          anchor={conflictPick.anchor}
          choices={conflictDateChoices(conflictOrders, conflictPick.driverId, conflictPick.date, conflictedIds, (order, day) => {
            const owned = isOwnAssignment(order, day, user.id)
            return { label: owned ? orderAssignerName(order, day) || '' : '', showText: owned }
          })}
          onChoose={(choice) => void releaseConflictDay(choice)}
          onClose={() => setConflictPick(null)}
        />
      ) : null}
      {drag && (draggingOrder || draggingDriver || draggingDay) ? (
        <div className="dispatcher-ghost" style={{ left: drag.x, top: drag.y }}>
          {draggingOrder
            ? orderDisplayLabel(draggingOrder)
            : draggingDay
              ? [orderDisplayLabel(draggingDay.order), formatMonthDay(draggingDay.day.serviceDate)].filter(Boolean).join(' ')
              : draggingDriver
                ? assignDesk
                  ? draggingDriver.name
                  : driverDisplayLabel(draggingDriver)
                : null}
        </div>
      ) : null}
    </div>
  )
}

function mergeOrders(primary: Order[], extra: Order[]) {
  const map = new Map(primary.map((order) => [order.id, order]))
  for (const order of extra) {
    map.set(order.id, order)
  }
  return [...map.values()]
}

function collapseDriverMarks(marks: CalendarMark[]) {
  const byDate = new Map<string, CalendarMark>()
  for (const mark of marks) {
    const current = byDate.get(mark.date)
    if (!current || (mark.owned && current.owned === false)) {
      byDate.set(mark.date, mark)
    }
  }
  return [...byDate.values()]
}

function toOrderCalendarDay(order: Order, day: ItineraryDay): DriverCalendarDay {
  return {
    date: day.serviceDate,
    items: [
      {
        orderId: order.id,
        label: orderDisplayLabel(order),
        itineraryDayId: day.id,
        endLocation: day.endLocation,
      },
    ],
  }
}

function DeskHint({ open, text, onToggle }: { open: boolean; text: string; onToggle: () => void }) {
  return (
    <div className="dispatcher-hint-block">
      <button
        type="button"
        className="dispatcher-hint-toggle"
        aria-expanded={open}
        aria-label={open ? '收起说明' : '展开说明'}
        onClick={onToggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={open ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'} />
        </svg>
      </button>
      {open ? <p className="dispatcher-hint">{text}</p> : null}
    </div>
  )
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M15 4.5l4.5 4.5-3 1.5-4.5 4.5-3-3 4.5-4.5L15 4.5zM6 18l4-2" />
    </svg>
  )
}
