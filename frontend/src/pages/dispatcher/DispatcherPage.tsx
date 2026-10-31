import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { message, Modal } from 'antd'
import { authApi, companyApi } from '../../api/auth'
import { clearDayDriver, createOrderWithDays, itineraryDayWrite, ordersApi, updateOrderInfo } from '../../api/orders'
import { useAuthenticatedAuth } from '../../auth/authState'
import { AccountMenu } from '../AccountMenu'
import { driversApi } from '../../api/drivers'
import { licenseApi } from '../../api/license'
import { readCurrentCompanyId } from '../../currentCompany'
import { keepDraft, syncDraft, usePageLoad } from '../../usePageLoad'
import { PRESET_COLORS, contrastText, driverCalendarFill, readDriverCalendarColors } from '../../calendarUi'
import { calendarHorizon, earlierDate, formatLocalDate, formatMonthDay, laterDate, orderedRange, todayLocal } from '../../localDate'
import { conflictChoices, conflictDateChoices, ConflictDatePopover, type ConflictDateChoice } from '../../ConflictDatePopover'
import { assignedDriverFocus, dateOrderEdges, dateSpan, driverAssignerCaption, driverDisplayLabel, conflictPatternStyle, conflictingOrderIds, conflictingVehicleOrderIds, dayOnVehicleDate, hasDispatcherAssignment, hasUnassignedDays, isHistoricalOrder, isIncomplete, isInProgress, isOwnAssignment, isSplitOrder, orderDisplayLabel, orderSpan, ordersOnDriverDate, ordersOnVehicleDate, patternForOrder, CONFLICT_RED, type ConflictPattern } from '../../orderFlags'
import { placeMark } from '../../placeMark'
import { contactLabel } from '../../text'
import type { DriverCalendarDay, ItineraryDay, LicensePhoto, Order, Vehicle } from '../../types'
import { OrderFilesBlock } from '../OrderFilesBlock'
import { TrashIcon } from '../OrderInfoFields'
import { DriverDayEditor } from '../driver/DriverDayEditor'
import { LicenseGallery } from '../LicenseGallery'
import {
  CALENDAR_HOLD_MS,
  type CalendarHold,
  calendarHoldShifted,
  captureCalendarPointer,
  followCalendarDrag,
  pointFromDragEvent,
} from '../../calendarDay'
import { DispatcherCalendarCard, DispatcherDayCard, type CalendarMark } from './DispatcherCalendarCard'
import { startPaneLift } from './paneLift'
import { takeVehicleBackdropClick, VehicleBoard } from './VehicleBoard'
import { vehiclesApi } from '../../api/vehicles'
import '../driver/driver-calendar.css'
import './dispatcher.css'

const LAYOUT_KEY = 'trailink.dispatcher.driverLayout'
const VEHICLE_LAYOUT_KEY = 'trailink.dispatcher.vehicleLayout'
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
  hasAvatar: boolean
}

type OrderFilter = 'unassigned' | 'all'
type VehicleFilter = 'available' | 'all'
type PoolFilter = 'open' | 'done'
type DragKind = 'order' | 'driver' | 'day' | 'vehicle'
type OrderPane = 'orders' | 'vehicles'

interface DragState {
  kind: DragKind
  id: string
  orderId?: string
  dayId?: string
  from?: 'order' | 'driver'
  onlyDay?: boolean
  x: number
  y: number
}

interface TouchDragHold {
  pointerId: number
  x: number
  y: number
  target: HTMLElement
  drag: DragState
  timer: number
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

function comparePlate(left: string, right: string) {
  return left.localeCompare(right, 'en', { sensitivity: 'base' }) || left.localeCompare(right)
}

function sortDrivers(
  drivers: BoardPerson[],
  layout: DriverLayout,
  options?: { manualUnpinned?: boolean; compareName?: (left: string, right: string) => number },
) {
  const manualUnpinned = options?.manualUnpinned !== false
  const compareName = options?.compareName ?? ((left: string, right: string) => left.localeCompare(right, 'zh-CN'))
  const visible = drivers.filter((driver) => !driver.hidden)
  const pinned = layout.pinnedIds
    .map((id) => visible.find((driver) => driver.id === id))
    .filter((driver): driver is BoardPerson => Boolean(driver))
  const pinnedIds = new Set(layout.pinnedIds)
  const rest = visible.filter((driver) => !pinnedIds.has(driver.id))
  const sortIndex = manualUnpinned ? new Map(layout.sortIds.map((id, index) => [id, index])) : new Map<string, number>()
  rest.sort((left, right) => {
    const leftRank = sortIndex.has(left.id)
    const rightRank = sortIndex.has(right.id)
    if (leftRank && rightRank) {
      return sortIndex.get(left.id)! - sortIndex.get(right.id)!
    }
    if (leftRank !== rightRank) {
      return leftRank ? -1 : 1
    }
    return compareName(left.name, right.name)
  })
  return [...pinned, ...rest]
}

function toggledPins(pinnedIds: string[], id: string) {
  return pinnedIds.includes(id) ? pinnedIds.filter((item) => item !== id) : [...pinnedIds, id]
}

function movedLayout(layout: DriverLayout, unpinnedIds: string[], sourceId: string, targetId: string) {
  const pinned = new Set(layout.pinnedIds)
  if (pinned.has(sourceId) !== pinned.has(targetId)) {
    return null
  }
  if (pinned.has(sourceId)) {
    return { ...layout, pinnedIds: moveIds(layout.pinnedIds, sourceId, targetId) }
  }
  return { ...layout, sortIds: moveIds(unpinnedIds, sourceId, targetId) }
}

function writeBoardLayout(key: string, next: DriverLayout, apply: (value: DriverLayout) => void) {
  apply(next)
  localStorage.setItem(key, JSON.stringify(next))
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

function alignCalendarScroll(source: HTMLElement | null, target: HTMLElement | null) {
  if (!source || !target) {
    return
  }
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

function scrollCalendarToDate(body: HTMLElement | null, date: string, placement: 'start' | 'center' = 'start') {
  if (!body) {
    return
  }
  const cell = body.querySelector<HTMLElement>(`[data-service-date="${date}"]`)
  if (!cell) {
    return
  }
  const delta = cell.getBoundingClientRect().top - body.getBoundingClientRect().top
  const next = placement === 'center'
    ? body.scrollTop + delta - (body.clientHeight - cell.offsetHeight) / 2
    : body.scrollTop + delta - 8
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
  const [orderPane, setOrderPane] = useState<OrderPane>('orders')
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>('available')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleLayout, setVehicleLayout] = useState<DriverLayout>(() => readLayout(VEHICLE_LAYOUT_KEY))
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [addingVehicle, setAddingVehicle] = useState(false)
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
  const [licensePhotos, setLicensePhotos] = useState<LicensePhoto[]>([])
  const [licenseTick, setLicenseTick] = useState(0)
  const [driverLift, setDriverLift] = useState(0)
  const [driverLiftSettling, setDriverLiftSettling] = useState(false)
  const [driverLiftDragging, setDriverLiftDragging] = useState(false)
  const driverLiftRef = useRef(0)
  const driverLiftTimer = useRef<number | null>(null)
  const [driverFocusDate, setDriverFocusDate] = useState<string | null>(null)
  const [driverFocusDriverOnly, setDriverFocusDriverOnly] = useState(false)
  const [conflictPick, setConflictPick] = useState<{ date: string; driverId: string; anchor: DOMRect } | null>(null)
  const [vehicleConflict, setVehicleConflict] = useState<{ date: string; anchor: DOMRect } | null>(null)
  const [driverTrips, setDriverTrips] = useState<Order[]>([])
  const [driverTripDriverId, setDriverTripDriverId] = useState<string | null>(null)
  const [driverNotes, setDriverNotes] = useState('')
  const driverNotesRef = useRef('')
  const driverNoteLock = useRef(false)
  const [orderPlatformNo, setOrderPlatformNo] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [orderSharedNotes, setOrderSharedNotes] = useState('')
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
  const driverTripsRef = useRef<Order[]>([])
  const driverTripDriverIdRef = useRef<string | null>(null)
  const userIdRef = useRef(user.id)
  const assignDeskRef = useRef(assignDesk)
  const orderPlatformNoRef = useRef('')
  const orderNotesRef = useRef('')
  const orderSharedNotesRef = useRef('')
  const orderCompanyIdRef = useRef<string | null>(null)
  const selectedOrderIdRef = useRef<string | null>(null)
  const loadedOrderRef = useRef({
    id: null as string | null,
    platform: '',
    notes: '',
    sharedNotes: '',
    companyId: null as string | null,
  })
  const loadedDriverRef = useRef({ id: undefined as string | null | undefined, notes: '' })
  const companyBindGen = useRef(0)
  const selectOrderDayRef = useRef<(dayId: string) => void>(() => undefined)
  const openOwnedDriverDayRef = useRef<(orderId: string, dayId?: string) => void>(() => undefined)
  const toggleOrderRef = useRef<(orderId: string) => void>(() => undefined)
  const releaseDriverLiftRef = useRef<() => void>(() => undefined)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverDriverId, setHoverDriverId] = useState<string | null>(null)
  const [hoverVehicleId, setHoverVehicleId] = useState<string | null>(null)
  const [hoverOrderPane, setHoverOrderPane] = useState(false)
  const dragRef = useRef(drag)
  const pendingRef = useRef<DragState | null>(null)
  const touchDragHoldRef = useRef<TouchDragHold | null>(null)
  const driversRef = useRef(drivers)
  const assignLock = useRef(false)
  const selectedDriverIdRef = useRef<string | null>(null)
  const selectedOrderDayIdRef = useRef<string | null>(null)
  const orderCalBodyRef = useRef<HTMLDivElement>(null)
  const createCalBodyRef = useRef<HTMLDivElement>(null)
  const orderScrollId = useRef<string | null>(null)
  const driverCalBodyRef = useRef<HTMLDivElement>(null)
  const vehicleCalBodyRef = useRef<HTMLDivElement>(null)
  const vehiclePlaced = useRef<string | null>(null)
  const calendarJumping = useRef(false)
  const driverScrollPending = useRef<string | null>(null)
  const assignOrderRef = useRef<(orderId: string, driverId: string) => Promise<void>>(async () => undefined)
  const assignDayRef = useRef<(orderId: string, dayId: string, driverId: string) => Promise<void>>(async () => undefined)
  const unbindDayRef = useRef<(orderId: string, dayId: string, onlyDay?: boolean) => Promise<void>>(async () => undefined)
  const reorderDriverRef = useRef<(sourceId: string, targetId: string) => void>(() => undefined)
  const reorderVehicleRef = useRef<(sourceId: string, targetId: string) => void>(() => undefined)
  const bindVehicleRef = useRef<(vehicleId: string, driverId: string, date: string) => Promise<void>>(async () => undefined)
  const unbindVehicleRef = useRef<(orderId: string, dayId: string, onlyDay?: boolean) => Promise<boolean>>(async () => false)
  const openVehicleForDriverDayRef = useRef<(orderId: string, dayId?: string) => void>(() => undefined)
  const queueDriverFocusRef = useRef<(driverId: string, date: string, driverOnly: boolean) => void>(() => undefined)
  const orderPaneRef = useRef(orderPane)

  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  useEffect(() => {
    driversRef.current = drivers
    ordersRef.current = orders
    driverTripsRef.current = driverTrips
    driverTripDriverIdRef.current = driverTripDriverId
    userIdRef.current = user.id
    assignDeskRef.current = assignDesk
    orderPaneRef.current = orderPane
  }, [assignDesk, driverTripDriverId, driverTrips, drivers, orderPane, orders, user.id])

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
  const horizon = calendarHorizon()
  const createCalStart = horizon.start
  const createCalEnd = horizon.end

  const visibleDrivers = useMemo(() => sortDrivers(drivers, layout), [drivers, layout])
  const visibleVehicles = useMemo(() => {
    const listed = vehicles.filter((item) => vehicleFilter === 'all' || item.available)
    return sortDrivers(
      listed.map((item) => ({ ...item, hidden: false, notes: null, contact: null, hasAvatar: false, name: item.plate })),
      vehicleLayout,
      { manualUnpinned: false, compareName: comparePlate },
    ).map(
      (item) => vehicles.find((vehicle) => vehicle.id === item.id)!,
    )
  }, [vehicleFilter, vehicleLayout, vehicles])
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
  const orderRangeStart = earlierDate(horizon.start, selectedOrder?.days[0]?.serviceDate || selectedOrder?.startDate) || horizon.start
  const orderRangeEnd = laterDate(horizon.end, selectedOrder?.endDate || selectedOrder?.days.at(-1)?.serviceDate) || horizon.end
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
          hasAvatar: Boolean(item.hasAvatar),
        })))
        return
      }
      const ordersTask = ordersApi.list().then(setOrders, (error: unknown) => {
        message.error(error instanceof Error ? error.message : '加载订单失败')
      })
      const driversTask = driversApi.list().then(setDrivers, (error: unknown) => {
        message.error(error instanceof Error ? error.message : '加载司导失败')
      })
      const vehiclesTask = vehiclesApi.list().then(setVehicles, (error: unknown) => {
        message.error(error instanceof Error ? error.message : '加载车辆失败')
      })
      await Promise.all([ordersTask, driversTask, vehiclesTask])
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
        if (driverScrollPending.current === selectedDriverId) {
          driverScrollPending.current = null
          setDriverFocusDate((current) => current ?? today)
        }
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        message.error(error instanceof Error ? error.message : '加载司导行程失败')
      }
    })
    return () => {
      cancelled = true
    }
  }, [assignDesk, selectedDriverId, orders, today])

  useEffect(() => {
    if (assignDesk || !selectedDriverId) {
      setLicensePhotos([])
      return
    }
    let cancelled = false
    licenseApi.listForDriver(selectedDriverId).then((photos) => {
      if (!cancelled) {
        setLicensePhotos(photos)
      }
    }).catch(() => {
      if (!cancelled) {
        setLicensePhotos([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [assignDesk, selectedDriverId])

  useEffect(() => {
    // 路由在调度台和派给调度之间切换时，需要重新载入各自的本地布局。
    // oxlint-disable-next-line react/set-state-in-effect
    setLayout(readLayout(layoutKey))
  }, [layoutKey])

  useEffect(() => {
    if (!selectedOrderId && !selectedDriverId && !selectedVehicleId && !addingVehicle) {
      return
    }
    function onClick(event: MouseEvent) {
      if (takeVehicleBackdropClick()) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (target.closest('.dispatcher-card, .dispatcher-card-lift, .conflict-date-popover, button, a, input, textarea, select, label, [role="button"], .ant-modal-root, .account-menu')) {
        return
      }
      setSelectedOrderDayId(null)
      setSelectedOrderId(null)
      setOrderInfoOpen(false)
      setSelectedDriverId(null)
      setConflictPick(null)
      setSelectedVehicleId(null)
      setAddingVehicle(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [addingVehicle, selectedDriverId, selectedOrderId, selectedVehicleId])

  useEffect(() => {
    if (selectedDriverId) {
      return
    }
    if (driverLiftTimer.current != null) {
      window.clearTimeout(driverLiftTimer.current)
      driverLiftTimer.current = null
    }
    driverLiftRef.current = 0
    setDriverLift(0)
    setDriverLiftSettling(false)
    setDriverLiftDragging(false)
  }, [selectedDriverId])

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
    const nextSharedNotes = order?.sharedNotes ?? ''
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
    syncDraft(orderSharedNotesRef, setOrderSharedNotes, loaded.sharedNotes, nextSharedNotes, switched)
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
      sharedNotes: nextSharedNotes,
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
    let followFrame = 0
    const followPoint = { current: null as { x: number; y: number } | null }
    function stopCreateFollow() {
      if (followFrame) {
        window.cancelAnimationFrame(followFrame)
        followFrame = 0
      }
      followPoint.current = null
    }
    function tickCreateFollow() {
      followFrame = 0
      const point = followPoint.current
      if (!createRangeDragging.current || !point) {
        return
      }
      const date = followCalendarDrag(createCalBodyRef.current, point.x, point.y)
      if (date) {
        setCreateRangeEnd((current) => (current === date ? current : date))
      }
      followFrame = window.requestAnimationFrame(tickCreateFollow)
    }
    function followCreateDrag(event: PointerEvent | TouchEvent) {
      const hold = createHoldRef.current
      const point = pointFromDragEvent(event)
      if (hold && point && calendarHoldShifted(hold, point.x, point.y)) {
        cancelCreateHold()
        return
      }
      if (!createRangeDragging.current || !point) {
        return
      }
      if (window.TouchEvent && event instanceof TouchEvent && event.cancelable) {
        event.preventDefault()
      }
      followPoint.current = point
      if (!followFrame) {
        followFrame = window.requestAnimationFrame(tickCreateFollow)
      }
    }
    function boardOrder(orderId: string) {
      return ordersRef.current.find((item) => item.id === orderId) ?? driverTripsRef.current.find((item) => item.id === orderId)
    }
    function foreignAssigned(orderId: string) {
      if (assignDeskRef.current) {
        return false
      }
      const order = boardOrder(orderId)
      if (!order) {
        return true
      }
      return order.days.some((day) => day.driverId && !isOwnAssignment(order, day, userIdRef.current))
    }
    function refuseForeignOrder() {
      message.warning('只能移除自己分配的订单')
    }
    function onMove(event: PointerEvent) {
      followCreateDrag(event)
      const hold = touchDragHoldRef.current
      if (hold && hold.pointerId === event.pointerId && calendarHoldShifted(hold, event.clientX, event.clientY)) {
        window.clearTimeout(hold.timer)
        touchDragHoldRef.current = null
        if (hold.drag.kind === 'day' && hold.drag.orderId) {
          if (orderPaneRef.current !== 'vehicles' && foreignAssigned(hold.drag.orderId)) {
            refuseForeignOrder()
          } else {
            const next: DragState = {
              kind: 'order',
              id: hold.drag.orderId,
              from: hold.drag.from,
              dayId: orderPaneRef.current === 'vehicles' ? hold.drag.dayId : undefined,
              x: event.clientX,
              y: event.clientY,
            }
            pendingRef.current = null
            dragRef.current = next
            setDrag(next)
          }
        }
      }
      const pending = pendingRef.current
      if (!dragRef.current && pending) {
        const deltaX = event.clientX - pending.x
        const deltaY = event.clientY - pending.y
        if (deltaX * deltaX + deltaY * deltaY >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
          if (pending.kind === 'order' && foreignAssigned(pending.id)) {
            pendingRef.current = null
            refuseForeignOrder()
          } else {
            const next = { ...pending, x: event.clientX, y: event.clientY }
            pendingRef.current = null
            setDrag(next)
            dragRef.current = next
          }
        }
      }
      const current = dragRef.current
      if (!current) {
        return
      }
      setDrag({ ...current, x: event.clientX, y: event.clientY })
      setHoverDriverId(resolveDriverId(event.clientX, event.clientY, selectedDriverIdRef.current))
      setHoverOrderPane(current.from === 'driver' && isOverOrderPane(event.clientX, event.clientY))
      const vehicleTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-vehicle-id]')
      setHoverVehicleId(current.kind === 'vehicle' ? vehicleTarget?.getAttribute('data-vehicle-id') ?? null : null)
    }
    function onUp(event: PointerEvent) {
      resolveCreateHold(event, true)
      createRangeDragging.current = false
      stopCreateFollow()
      const hold = touchDragHoldRef.current
      if (hold && hold.pointerId === event.pointerId) {
        const shifted = calendarHoldShifted(hold, event.clientX, event.clientY)
        window.clearTimeout(hold.timer)
        touchDragHoldRef.current = null
        if (!shifted) {
          pendingRef.current = hold.drag
        }
      }
      const current = dragRef.current
      const pending = pendingRef.current
      pendingRef.current = null
      if (current) {
        const driverId = resolveDriverId(event.clientX, event.clientY, selectedDriverIdRef.current)
        const overOrderPane = isOverOrderPane(event.clientX, event.clientY)
        setDrag(null)
        setHoverDriverId(null)
        setHoverVehicleId(null)
        setHoverOrderPane(false)
        dragRef.current = null
        if (current.kind === 'vehicle') {
          const vehicleTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-vehicle-id]')?.getAttribute('data-vehicle-id')
          if (vehicleTarget && vehicleTarget !== current.id && !driverId) {
            reorderVehicleRef.current(current.id, vehicleTarget)
            return
          }
          if (!driverId) {
            return
          }
          if (selectedDriverIdRef.current !== driverId) {
            queueDriverFocusRef.current(driverId, formatLocalDate(todayLocal()), true)
            return
          }
          const point = document.elementFromPoint(event.clientX, event.clientY)
          const date = point?.closest('[data-calendar="driver"]')
            ? point.closest('[data-service-date]')?.getAttribute('data-service-date') ?? null
            : null
          if (date) {
            void bindVehicleRef.current(current.id, driverId, date)
          }
          return
        }
        if (current.from === 'driver') {
          if (overOrderPane) {
            const orderId = current.kind === 'order' ? current.id : current.orderId
            if (orderId) {
              if (orderPaneRef.current === 'vehicles') {
                void unbindVehicleRef.current(orderId, current.dayId ?? '', Boolean(current.onlyDay))
              } else {
                void unbindDayRef.current(orderId, current.dayId ?? '', current.onlyDay)
              }
            }
          }
          if (orderPaneRef.current === 'vehicles' || overOrderPane) {
            return
          }
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
        if (orderPaneRef.current === 'vehicles') {
          openVehicleForDriverDayRef.current(pending.orderId, pending.dayId)
        } else {
          openOwnedDriverDayRef.current(pending.orderId, pending.dayId)
        }
        return
      }
      if (pending.kind === 'order') {
        if (pending.from === 'driver') {
          releaseDriverLiftRef.current()
        }
        toggleOrderRef.current(pending.id)
        return
      }
      if (pending.kind === 'driver') {
        const next = selectedDriverIdRef.current === pending.id ? null : pending.id
        if (!next) {
          driverScrollPending.current = null
          setSelectedDriverId(null)
        } else if (selectedOrderIdRef.current) {
          driverScrollPending.current = null
          setSelectedDriverId(next)
        } else {
          queueDriverFocusRef.current(next, formatLocalDate(todayLocal()), false)
        }
      }
      if (pending.kind === 'vehicle') {
        setAddingVehicle(false)
        setSelectedVehicleId((current) => (current === pending.id ? null : pending.id))
      }
    }
    function onTouchMove(event: TouchEvent) {
      followCreateDrag(event)
      if ((dragRef.current || pendingRef.current) && event.cancelable) {
        event.preventDefault()
      }
    }
    function onTouchEnd(event: TouchEvent) {
      resolveCreateHold(event, true)
      createRangeDragging.current = false
      stopCreateFollow()
    }
    function onCancel(event: PointerEvent | TouchEvent) {
      resolveCreateHold(event, false)
      createRangeDragging.current = false
      stopCreateFollow()
      const hold = touchDragHoldRef.current
      if (!hold) {
        return
      }
      if ('pointerId' in event && event.pointerId !== hold.pointerId) {
        return
      }
      window.clearTimeout(hold.timer)
      touchDragHoldRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onCancel)
    return () => {
      cancelCreateHold()
      const hold = touchDragHoldRef.current
      if (hold) {
        window.clearTimeout(hold.timer)
        touchDragHoldRef.current = null
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onCancel)
      stopCreateFollow()
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

  function syncVehicleCalendarFromDriver() {
    if (calendarJumping.current || orderPaneRef.current !== 'vehicles') {
      return
    }
    alignCalendarScroll(driverCalBodyRef.current, vehicleCalBodyRef.current)
  }

  useEffect(() => {
    if (!selectedOrderId || !selectedDriverId || selectedOrderDayId || driverFocusDate) {
      return
    }
    if (!assignDesk && driverTripDriverId !== selectedDriverId) {
      return
    }
    const frame = window.requestAnimationFrame(() => syncDriverCalendarFromOrder())
    return () => window.cancelAnimationFrame(frame)
  }, [assignDesk, driverTripDriverId, orderRangeEnd, selectedDriverId, selectedOrderDayId, selectedOrderId])

  useLayoutEffect(() => {
    if (!driverFocusDate) {
      return
    }
    if (!assignDesk && selectedDriverId && driverTripDriverId !== selectedDriverId) {
      return
    }
    calendarJumping.current = true
    if (!driverFocusDriverOnly) {
      scrollCalendarToDate(orderCalBodyRef.current, driverFocusDate)
    }
    scrollCalendarToDate(driverCalBodyRef.current, driverFocusDate)
    if (orderPaneRef.current === 'vehicles') {
      alignCalendarScroll(driverCalBodyRef.current, vehicleCalBodyRef.current)
    }
    calendarJumping.current = false
    const frame = window.requestAnimationFrame(() => {
      setDriverFocusDate(null)
      setDriverFocusDriverOnly(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [assignDesk, driverFocusDate, driverFocusDriverOnly, driverTripDriverId, selectedDriverId, selectedOrderId])

  useLayoutEffect(() => {
    if (!creatingOrder) {
      return
    }
    scrollCalendarToDate(createCalBodyRef.current, today)
  }, [creatingOrder, today])

  useLayoutEffect(() => {
    if (!selectedOrderId || creatingOrder) {
      orderScrollId.current = null
      return
    }
    if (driverFocusDate) {
      orderScrollId.current = selectedOrderId
      return
    }
    if (orderScrollId.current === selectedOrderId) {
      return
    }
    const date = selectedOrder?.days[0]?.serviceDate || selectedOrder?.startDate
    if (!date || !orderCalBodyRef.current) {
      return
    }
    scrollCalendarToDate(orderCalBodyRef.current, date)
    orderScrollId.current = selectedOrderId
  }, [creatingOrder, driverFocusDate, selectedOrder, selectedOrderId])

  function persistLayout(next: DriverLayout) {
    writeBoardLayout(layoutKey, next, setLayout)
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

  function clearDriverLiftTimer() {
    if (driverLiftTimer.current != null) {
      window.clearTimeout(driverLiftTimer.current)
      driverLiftTimer.current = null
    }
  }

  function releaseDriverLift() {
    if (driverLiftRef.current <= 0) {
      return
    }
    driverLiftRef.current = 0
    setDriverLift(0)
    setDriverLiftSettling(true)
    clearDriverLiftTimer()
    driverLiftTimer.current = window.setTimeout(() => {
      driverLiftTimer.current = null
      setDriverLiftSettling(false)
    }, 240)
  }

  function beginDriverLift(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target
    if (target instanceof Element && target.closest('button, a, input, textarea, select, label')) {
      return
    }
    const overlay = event.currentTarget.closest('.dispatcher-overlay')
    const pane = document.querySelector('[data-driver-pane]')
    const orderPane = document.querySelector('[data-order-pane]')
    if (!(overlay instanceof HTMLElement) || !(pane instanceof HTMLElement) || !(orderPane instanceof HTMLElement)) {
      return
    }
    clearDriverLiftTimer()
    setDriverLiftSettling(false)
    startPaneLift(event, {
      direction: 'up',
      overlay,
      pane,
      maxPane: orderPane,
      settling: driverLiftSettling,
      current: driverLiftRef.current,
      onChange: (value) => {
        driverLiftRef.current = value
        setDriverLift(value)
      },
      onDragging: setDriverLiftDragging,
    })
  }

  function beginPointer(event: ReactPointerEvent, next: DragState) {
    if (busy) {
      return
    }
    if (event.pointerType === 'touch') {
      const existing = touchDragHoldRef.current
      if (existing) {
        window.clearTimeout(existing.timer)
        touchDragHoldRef.current = null
      }
      const target = event.currentTarget
      if (!(target instanceof HTMLElement)) {
        return
      }
      const hold: TouchDragHold = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        target,
        drag: next,
        timer: window.setTimeout(() => {
          if (touchDragHoldRef.current !== hold) {
            return
          }
          touchDragHoldRef.current = null
          pendingRef.current = hold.drag.kind === 'day' ? { ...hold.drag, onlyDay: true } : hold.drag
          try {
            hold.target.setPointerCapture(hold.pointerId)
          } catch {
            // 手指已经离开时不再抓住触点。
          }
        }, CALENDAR_HOLD_MS),
      }
      touchDragHoldRef.current = hold
      if (next.kind === 'day') {
        event.preventDefault()
        try {
          target.setPointerCapture(event.pointerId)
        } catch {
          // 手指已经离开时不再抓住触点。
        }
      }
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
        const order = orders.find((item) => item.id === orderId) ?? driverTrips.find((item) => item.id === orderId)
        if (order?.days.some((day) => day.driverId && !isOwnAssignment(order, day, user.id))) {
          message.warning('只能移除自己分配的订单')
          return
        }
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

  async function unbindDriverDay(orderId: string, dayId: string, onlyDay = false) {
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
    const assignedDays = order.days.filter((item) => item.driverId)
    if (!onlyDay && !day) {
      if (assignedDays.length === 0) {
        return
      }
      if (assignedDays.some((item) => !isOwnAssignment(order, item, user.id))) {
        message.warning('只能移除自己分配的订单')
        return
      }
    } else if (!day?.driverId) {
      return
    } else if (!isOwnAssignment(order, day, user.id)) {
      message.warning('只能移除自己分配的订单')
      return
    }
    assignLock.current = true
    setBusy(true)
    try {
      if (day && (onlyDay || isSplitOrder(order))) {
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
    if (day.driverId && !isOwnAssignment(order, day, user.id)) {
      message.warning('只能移除自己分配的订单')
      return
    }
    assignLock.current = true
    setBusy(true)
    try {
      await ordersApi.updateDay(orderId, dayId, itineraryDayWrite(day, driverId))
      message.success('已按天分配给司导')
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '无法分配给司导')
    } finally {
      assignLock.current = false
      setBusy(false)
    }
  }

  function reorderBoard(layout: DriverLayout, unpinnedIds: string[], sourceId: string, targetId: string, persist: (next: DriverLayout) => void) {
    const next = movedLayout(layout, unpinnedIds, sourceId, targetId)
    if (next) {
      persist(next)
    }
  }

  function reorderDriver(sourceId: string, targetId: string) {
    const pinned = new Set(layout.pinnedIds)
    reorderBoard(layout, visibleDrivers.filter((driver) => !pinned.has(driver.id)).map((driver) => driver.id), sourceId, targetId, persistLayout)
  }

  function togglePin(driverId: string) {
    persistLayout({ ...layout, pinnedIds: toggledPins(layout.pinnedIds, driverId) })
  }

  function persistVehicleLayout(next: DriverLayout) {
    writeBoardLayout(VEHICLE_LAYOUT_KEY, next, setVehicleLayout)
  }

  function reorderVehicle(sourceId: string, targetId: string) {
    const pinned = new Set(vehicleLayout.pinnedIds)
    if (!pinned.has(sourceId) || !pinned.has(targetId)) {
      return
    }
    reorderBoard(vehicleLayout, [], sourceId, targetId, persistVehicleLayout)
  }

  function toggleVehiclePin(vehicleId: string) {
    persistVehicleLayout({ ...vehicleLayout, pinnedIds: toggledPins(vehicleLayout.pinnedIds, vehicleId) })
  }

  async function bindVehicle(vehicleId: string, driverId: string, date: string) {
    const onDate = ordersOnDriverDate(driverTripsRef.current, driverId, date)
    const owned = onDate.filter((order) =>
      order.days.some((day) => day.serviceDate === date && day.driverId === driverId && isOwnAssignment(order, day, user.id)),
    )
    if (owned.length === 0) {
      message.warning('只能给自己分配的日期绑定车辆')
      return
    }
    if (owned.length > 1) {
      message.warning('这一天有多张订单，请先点开其中一张')
      return
    }
    const day = owned[0].days.find(
      (item) => item.serviceDate === date && item.driverId === driverId && isOwnAssignment(owned[0], item, user.id),
    )
    if (!day) {
      return
    }
    try {
      const result = await vehiclesApi.bind(owned[0].id, day.id, vehicleId)
      patchVehicleDays(result.orderId, result.dayIds, result.vehicleId)
      const plate = vehicles.find((item) => item.id === vehicleId)?.plate
      message.success(plate ? `已绑定 ${plate}` : '已绑定车辆')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '绑定车辆失败')
    }
  }

  async function unbindVehicle(orderId: string, dayId: string, onlyDay = false) {
    const order = orders.find((item) => item.id === orderId) ?? driverTrips.find((item) => item.id === orderId)
    if (!order || assignLock.current || busy) {
      return false
    }
    const day = order.days.find((item) => item.id === dayId) ?? order.days.find((item) => item.vehicleId && isOwnAssignment(order, item, user.id))
    const targetDayId = day?.id
    if (onlyDay) {
      if (!day || !isOwnAssignment(order, day, user.id)) {
        message.warning('只能解除自己分配的车辆')
        return false
      }
      if (!day.vehicleId) {
        message.warning('这一天还没有绑定车辆')
        return false
      }
    } else if (!order.days.some((item) => item.vehicleId && isOwnAssignment(order, item, user.id))) {
      message.warning('只能解除自己分配的车辆')
      return false
    }
    assignLock.current = true
    setBusy(true)
    try {
      if (!targetDayId) {
        return false
      }
      const result = await vehiclesApi.unbind(orderId, targetDayId, onlyDay)
      patchVehicleDays(result.orderId, result.dayIds, result.vehicleId)
      message.success(onlyDay ? '已解除当天的车辆' : '已解除这张订单的车辆')
      return true
    } catch (error) {
      message.error(error instanceof Error ? error.message : '解除车辆失败')
      return false
    } finally {
      assignLock.current = false
      setBusy(false)
    }
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

  function changeOrderSharedNotes(value: string) {
    orderSharedNotesRef.current = value
    setOrderSharedNotes(value)
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
    const sharedNotes = orderSharedNotesRef.current
    const nextCompanyId = orderCompanyIdRef.current
    try {
      const saved = await updateOrderInfo(order, { platformOrderNo, notes, sharedNotes, companyId: nextCompanyId })
      orderPlatformNoRef.current = saved.platformOrderNo ?? ''
      orderNotesRef.current = saved.notes ?? ''
      orderSharedNotesRef.current = saved.sharedNotes ?? ''
      orderCompanyIdRef.current = saved.companyId ?? null
      setOrderPlatformNo(orderPlatformNoRef.current)
      setOrderNotes(orderNotesRef.current)
      setOrderSharedNotes(orderSharedNotesRef.current)
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

  function patchVehicleDays(orderId: string, dayIds: Iterable<string>, vehicleId: string | null) {
    const ids = new Set(dayIds)
    const patch = (list: Order[]) =>
      list.map((order) =>
        order.id === orderId
          ? { ...order, days: order.days.map((day) => (ids.has(day.id) ? { ...day, vehicleId } : day)) }
          : order,
      )
    setOrders(patch)
    setDriverTrips(patch)
  }

  function queueDriverFocus(driverId: string, date: string, driverOnly: boolean) {
    setDriverFocusDriverOnly(driverOnly)
    if (driverTripDriverIdRef.current === driverId) {
      driverScrollPending.current = null
      setDriverFocusDate(date)
    } else {
      driverScrollPending.current = driverId
      if (date !== today) {
        setDriverFocusDate(date)
      }
    }
    setSelectedDriverId(driverId)
  }

  function findDeskOrder(orderId: string) {
    return vehicleOrders.find((item) => item.id === orderId)
  }

  function openVehicleForDriverDay(orderId: string, dayId?: string) {
    const order = findDeskOrder(orderId)
    const day = order?.days.find((item) => item.id === dayId)
    if (!day?.vehicleId) {
      message.warning('这一天还没有绑定车辆')
      return
    }
    if (!vehicles.some((item) => item.id === day.vehicleId)) {
      message.warning('只能打开自己的车辆')
      return
    }
    if (!selectedDriverId) {
      return
    }
    setAddingVehicle(false)
    setVehicleConflict(null)
    setSelectedVehicleId(day.vehicleId)
    queueDriverFocus(selectedDriverId, day.serviceDate, true)
  }

  function openVehicleCalendarDay(mark: CalendarMark, anchor: HTMLButtonElement) {
    if (mark.conflict) {
      releaseDriverLift()
      setConflictPick(null)
      setSelectedDriverId(null)
      setDriverFocusDate(null)
      setVehicleConflict({ date: mark.date, anchor: anchor.getBoundingClientRect() })
      return
    }
    const order = findDeskOrder(mark.orderId)
    const day = order?.days.find((item) => item.id === mark.dayId)
    if (!day?.driverId) {
      return
    }
    setVehicleConflict(null)
    setConflictPick(null)
    releaseDriverLift()
    queueDriverFocus(day.driverId, day.serviceDate, true)
  }

  function openOwnedDriverDay(orderId: string, dayId?: string) {
    const order = ordersRef.current.find((item) => item.id === orderId)
    const day = order?.days.find((item) => item.id === dayId)
    if (!order || !day || !isOwnAssignment(order, day, user.id)) {
      if (order && day) {
        message.warning('只能移除自己分配的订单')
      }
      return
    }
    releaseDriverLift()
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
    setDriverFocusDriverOnly(false)
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
    reorderVehicleRef.current = reorderVehicle
    bindVehicleRef.current = bindVehicle
    unbindVehicleRef.current = unbindVehicle
    selectOrderDayRef.current = selectOrderDay
    openOwnedDriverDayRef.current = openOwnedDriverDay
    openVehicleForDriverDayRef.current = openVehicleForDriverDay
    queueDriverFocusRef.current = queueDriverFocus
    toggleOrderRef.current = toggleOrder
    releaseDriverLiftRef.current = releaseDriverLift
    selectedDriverIdRef.current = selectedDriverId
    selectedOrderDayIdRef.current = selectedOrderDayId
  })

  const selectedSpan = selectedOrder ? orderSpan(selectedOrder) : null
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
      place: placeMark(day.endLocation),
      assigned,
      color: assigned ? assignedColor : '#FFF1B8',
      textColor: assigned ? contrastText(assignedColor) : '#d46b08',
      orderStart: selectedSpan?.start === day.serviceDate,
      orderEnd: selectedSpan?.end === day.serviceDate,
      owned: assignDesk ? undefined : !day.driverId || isOwnAssignment(selectedOrder!, day, user.id),
    }
  })

  function driverCalendarLabel(order: Order, day: ItineraryDay) {
    if (!isOwnAssignment(order, day, user.id)) {
      return undefined
    }
    if (orderPane !== 'vehicles') {
      return driverAssignerCaption(order, day) || undefined
    }
    const plate = day.vehicleId ? vehicles.find((item) => item.id === day.vehicleId)?.plate : undefined
    return plate || '未配车'
  }

  const visibleTrips = !assignDesk && driverTripDriverId === selectedDriverId ? driverTrips : []
  const calendarColors = readDriverCalendarColors()
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
              place: placeMark(day.endLocation),
              label: orderDisplayLabel(order).slice(0, 2) || undefined,
            })),
        )
    : collapseDriverMarks(visibleTrips.flatMap((order) =>
        order.days
          .filter((day) => day.driverId === selectedDriverId)
          .map((day) => {
            const owned = isOwnAssignment(order, day, user.id)
            const fill = driverCalendarFill(day.serviceDate, today, calendarColors)
            return {
              date: day.serviceDate,
              dayId: day.id,
              orderId: order.id,
              owned,
              place: placeMark(day.endLocation),
              label: driverCalendarLabel(order, day),
              color: fill,
              textColor: fill ? contrastText(fill) : undefined,
            }
          }),
      ))
  ).sort((left, right) => left.date.localeCompare(right.date)).map((mark) => {
    const onDate = selectedDriverId && !assignDesk ? ordersOnDriverDate(visibleTrips, selectedDriverId, mark.date) : []
    const edges = dateOrderEdges(visibleTrips, mark.date, onDate.map((order) => order.id))
    const edged = { ...mark, orderStart: edges.start, orderEnd: edges.end }
    if (onDate.length < 2) {
      return edged
    }
    return { ...edged, conflict: true, color: CONFLICT_RED, textColor: '#fff' }
  })

  const driverRangeStart = earlierDate(horizon.start, driverMarks[0]?.date, selectedOrder ? orderRangeStart : undefined) || horizon.start
  const driverRangeEnd = laterDate(horizon.end, driverMarks.at(-1)?.date, selectedOrder ? orderRangeEnd : undefined) || horizon.end

  const draggingOrder =
    drag?.kind === 'order' ? orders.find((order) => order.id === drag.id) : undefined
  const draggingDriver = drag?.kind === 'driver' ? drivers.find((driver) => driver.id === drag.id) : undefined
  const draggingDay =
    drag?.kind === 'day'
      ? orders.flatMap((order) => order.days.map((day) => ({ order, day }))).find((item) => item.day.id === drag.dayId)
      : undefined
  const draggingVehicle = drag?.kind === 'vehicle' ? vehicles.find((item) => item.id === drag.id) : undefined
  const vehicleOrders = useMemo(() => mergeOrders(orders, driverTrips), [driverTrips, orders])
  const vehicleCalendarMarks = useMemo(() => {
    if (!selectedVehicleId) {
      return []
    }
    const hits = vehicleOrders.flatMap((order) =>
      order.days.filter((day) => day.vehicleId === selectedVehicleId).map((day) => ({ order, day })),
    )
    const spans = new Map<string, { start: string; end: string } | null>()
    for (const item of hits) {
      if (spans.has(item.order.id)) {
        continue
      }
      spans.set(
        item.order.id,
        dateSpan(hits.filter((hit) => hit.order.id === item.order.id).map((hit) => hit.day.serviceDate)),
      )
    }
    const byDate = new Map<string, { order: Order; day: ItineraryDay }[]>()
    for (const item of hits) {
      const list = byDate.get(item.day.serviceDate) ?? []
      list.push(item)
      byDate.set(item.day.serviceDate, list)
    }
    return [...byDate.entries()].map(([date, items]) => {
      const conflict = items.length > 1
      const own = items.find((item) => isOwnAssignment(item.order, item.day, user.id)) ?? items[0]
      const edge = spans.get(own.order.id)
      const driverName = own.day.driverName || drivers.find((driver) => driver.id === own.day.driverId)?.name
      return {
        date,
        dayId: own.day.id,
        orderId: own.order.id,
        label: conflict ? undefined : driverName || undefined,
        assigned: true,
        owned: items.some((item) => isOwnAssignment(item.order, item.day, user.id)),
        conflict,
        color: conflict ? CONFLICT_RED : assignedColor,
        textColor: conflict ? '#fff' : contrastText(assignedColor),
        orderStart: !conflict && edge?.start === date,
        orderEnd: !conflict && edge?.end === date,
      }
    }).sort((left, right) => left.date.localeCompare(right.date))
  }, [assignedColor, drivers, selectedVehicleId, user.id, vehicleOrders])
  const vehicleConflictedIds = useMemo(
    () => (selectedVehicleId ? conflictingVehicleOrderIds(vehicleOrders, selectedVehicleId) : new Set<string>()),
    [selectedVehicleId, vehicleOrders],
  )
  const vehicleConflictDrivers = useMemo(() => {
    const patterns = new Map<string, ConflictPattern>()
    if (!vehicleConflict || !selectedVehicleId) {
      return patterns
    }
    for (const order of ordersOnVehicleDate(vehicleOrders, selectedVehicleId, vehicleConflict.date)) {
      const day = dayOnVehicleDate(order, selectedVehicleId, vehicleConflict.date)
      if (!day?.driverId || patterns.has(day.driverId)) {
        continue
      }
      patterns.set(day.driverId, patternForOrder([...vehicleConflictedIds], order.id))
    }
    return patterns
  }, [selectedVehicleId, vehicleConflict, vehicleConflictedIds, vehicleOrders])
  const vehicleRangeStart = earlierDate(
    horizon.start,
    vehicleCalendarMarks[0]?.date,
    selectedDriverId ? driverRangeStart : undefined,
  ) || horizon.start
  const vehicleRangeEnd = laterDate(
    horizon.end,
    vehicleCalendarMarks.at(-1)?.date,
    selectedDriverId ? driverRangeEnd : undefined,
  ) || horizon.end

  useLayoutEffect(() => {
    const body = vehicleCalBodyRef.current
    if (!body || orderPane !== 'vehicles' || !selectedVehicleId) {
      vehiclePlaced.current = null
      return
    }
    if (driverFocusDate) {
      return
    }
    if (selectedDriverId) {
      calendarJumping.current = true
      alignCalendarScroll(driverCalBodyRef.current, body)
      calendarJumping.current = false
      vehiclePlaced.current = selectedVehicleId
      return
    }
    if (vehiclePlaced.current === selectedVehicleId || vehiclePlaced.current?.startsWith(`${selectedVehicleId}:`)) {
      return
    }
    calendarJumping.current = true
    scrollCalendarToDate(body, today, 'center')
    calendarJumping.current = false
    vehiclePlaced.current = `${selectedVehicleId}:${vehicleRangeStart}:${vehicleRangeEnd}`
  }, [driverFocusDate, orderPane, selectedDriverId, selectedVehicleId, today, vehicleRangeEnd, vehicleRangeStart])

  useEffect(() => {
    setVehicleConflict(null)
  }, [orderPane, selectedVehicleId])

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
        <div className={`dispatcher-pane-bar${assignDesk ? ' assign' : ''}`}>
          {assignDesk ? <h2>订单</h2> : (
            <div className="dispatcher-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={orderPane === 'orders'}
                className={`dispatcher-tab${orderPane === 'orders' ? ' active' : ''}`}
                onClick={() => setOrderPane('orders')}
              >
                订单
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={orderPane === 'vehicles'}
                className={`dispatcher-tab${orderPane === 'vehicles' ? ' active' : ''}`}
                onClick={() => setOrderPane('vehicles')}
              >
                车辆
              </button>
            </div>
          )}
          <div className="dispatcher-filters">
            {orderPane === 'vehicles' && !assignDesk ? (
              <>
                <button
                  type="button"
                  className={`dispatcher-chip${addingVehicle ? ' active' : ''}`}
                  onClick={() => {
                    setAddingVehicle(true)
                    setSelectedVehicleId(null)
                  }}
                >
                  添加车辆
                </button>
                <button
                  type="button"
                  className={`dispatcher-chip${vehicleFilter === 'available' ? ' active' : ''}`}
                  onClick={() => setVehicleFilter('available')}
                >
                  可用车辆
                </button>
                <button
                  type="button"
                  className={`dispatcher-chip${vehicleFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setVehicleFilter('all')}
                >
                  所有车辆
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
        {orderPane !== 'vehicles' && filter === 'all' && showColors ? (
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
              ? '这里把本公司订单整单分给一位调度员。同一时间只能分给一个人。触屏拖动订单或调度员前先按住约 0.5 秒，否则上下滑动是在滚动区域；鼠标按下即可拖。订单详情里，没有订单的日期直接拖动是滑动日历；有订单的日期直接拖动是整单交给调度员。按住约 0.5 秒再拖这一天，松在调度员上仍是整单，调度分配不按天。从调度员订单池拖回订单区即整单收回，已经派给司导的日期也会取消。未分配是还没派给调度员的单。点开订单看日历，日期上标的是司导。点开调度员可看他未完成和已完成的单，并写公司备注。'
              : orderPane === 'vehicles'
                ? '没有置顶的车辆按车牌字母顺序排列，置顶的保持置顶顺序。添加车辆后点图标打开车辆日历，左上角是车牌。编辑打开车辆详情，垃圾桶先套红框再点一次才删除。照片、停用和详情高度都在编辑里。点小图时详情撑到页面底部再看大图。已绑定的日期用订单里选的已分配颜色填上，并写司导名字。打开时今天这一行垂直居中。日历从半年前画到半年后。司导日历也开着时，滑动司导日历会带动车辆日历，车辆日历自己滑动不会带动司导。点车辆日历的日期打开该司导并跳到这一天；点司导日历里已绑车辆的日期打开该车并跳到这一天。同一天两张订单用了同一辆车时，车辆日历这一天标红。点开后弹出和订单冲突一样的图案选择，司导日历收起，涉及的司导图标换成对应图案。再点一次才解除这一天该车和这张订单的绑定。触屏拖动车辆图标或车辆日历前先按住约 0.5 秒，鼠标按下即可拖。司导日历没打开时，拖到司导图标上先打开日历。日历已经打开时，拖到该司导的订单上：整单绑定还没有车的日期，拆单只绑定这一段还没有车的日期。这些日期都已经有车时不分配，并提示该订单已经绑定了其他车辆。车辆管理时，司导日历只做车辆操作。直接拖回车辆区解除这张订单的车辆，按住约 0.5 秒再拖只解除当天。只能改自己分配的日期。还没有车时日期上写未配车，绑上车后改成车牌。别人的日期不写字，也不能拖。'
                : '创建订单与司导界面相同：触屏按住不动约 0.5 秒再拖选起止日期，鼠标按下即拖。拖到日历上下边缘时，日历跟着滚动。日历从半年前画到半年后，打开时停在今天或这张订单的日期。触屏拖动订单或司导前先按住约 0.5 秒，否则上下滑动是在滚动区域。订单和司导详情里，没有订单的日期直接拖动是滑动日历；有订单的日期直接拖动是整单，按住约 0.5 秒再拖是这一天。鼠标按下即可拖某一天。新建单不自动绑定所属公司，点开后搜索绑定。未分配是还有空日期的单，以及同一司导日期重叠的冲突单，过期未派完也在这里。点击订单看日历，可改所属公司、公司订单号和备注。已派给司导的订单会同时打开该司导，并跳到对应日期；拆单打开第一个已派日期的司导。改绑后新公司能在派给调度里看到。点击某一天编辑行程。从司导卡片拖回订单区：鼠标按是否拆单决定，拆单只取消那天，未拆单取消整单。触屏直接拖有订单的日期取消整单，按住约 0.5 秒再拖只取消当天。其他人分配的日期也会显示，但不写公司或调度员的名字，不能拖动，也不能移除。已派完且结束的单不出现在这里，只在公司信息里查看。'
          }
        />
        {orderPane === 'vehicles' && !assignDesk ? (
          <VehicleBoard
            vehicles={visibleVehicles}
            pinnedIds={vehicleLayout.pinnedIds}
            selectedId={selectedVehicleId}
            adding={addingVehicle}
            dragId={drag?.kind === 'vehicle' ? drag.id : null}
            hoverId={hoverVehicleId}
            busy={busy}
            calendarMarks={vehicleCalendarMarks}
            calendarRangeStart={vehicleRangeStart}
            calendarRangeEnd={vehicleRangeEnd}
            calendarBodyRef={vehicleCalBodyRef}
            onCalendarDayClick={openVehicleCalendarDay}
            onSelect={setSelectedVehicleId}
            onAddingChange={setAddingVehicle}
            onPin={toggleVehiclePin}
            onPointerDown={(event, id) =>
              beginPointer(event, { kind: 'vehicle', id, x: event.clientX, y: event.clientY })
            }
            onUpsert={(vehicle) =>
              setVehicles((current) =>
                current.some((item) => item.id === vehicle.id)
                  ? current.map((item) => (item.id === vehicle.id ? vehicle : item))
                  : [...current, vehicle],
              )
            }
            onRemoved={(id) => {
              setVehicles((current) => current.filter((item) => item.id !== id))
              const clear = (list: Order[]) =>
                list.map((order) => ({
                  ...order,
                  days: order.days.map((day) => (day.vehicleId === id ? { ...day, vehicleId: null } : day)),
                }))
              setOrders(clear)
              setDriverTrips(clear)
            }}
          />
        ) : (
          <>
        <div className="dispatcher-grid">
          {visibleOrders.length === 0 ? <p className="dispatcher-empty">暂无订单</p> : null}
          {visibleOrders.map((order) => renderOrderTile(order))}
        </div>
        {creatingOrder ? (
          <div className="dispatcher-overlay">
            <DispatcherCalendarCard
              title="创建订单"
              subtitle="触屏按住不动约 0.5 秒再拖选，鼠标按下即拖。拖到上下边缘时日历跟着滚动。"
              marks={[]}
              selectable
              pickFrom={createRangeStart}
              pickTo={createRangeEnd}
              rangeStart={createCalStart}
              rangeEnd={createCalEnd}
              bodyRef={createCalBodyRef}
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
                  <p className="dispatcher-hint">不知道订单号时，触屏按住不动约 0.5 秒再拖选起止日期，鼠标按下即拖。拖到上下边缘时日历跟着滚动。</p>
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
                sharedNotes={orderSharedNotes}
                onSharedNotesChange={changeOrderSharedNotes}
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
                onDayClick={(mark) => {
                  if (mark.owned === false) {
                    message.warning('只能移除自己分配的订单')
                  }
                }}
                onDayPointerDown={(event, mark) => {
                  if (mark.owned === false) {
                    return
                  }
                  beginPointer(event, {
                    kind: 'day',
                    id: mark.dayId,
                    orderId: mark.orderId,
                    dayId: mark.dayId,
                    from: 'order',
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
              />
            )}
          </div>
        ) : null}
          </>
        )}
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
              : '点击司导看他的行程，已完成和进行中的日期都会显示。着色和我的行程一样：早于今天是已完成色，今天和之后是未完成色。订单没打开时，打开司导停在今天。订单日历已经打开时，订单日历不动，司导日历跟到订单日历当前的日期。名字旁的笔记图标可改备注，右侧可隐藏。置顶在图标右上角。已隐藏的可以恢复。垃圾桶先套红框，再点一次才解除绑定，并收回未完成订单里分给这位司导的日期。已结束的行程保留。'
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
                  <PersonAvatar
                    name={driver.name}
                    src={driver.hasAvatar ? (assignDesk ? `/api/company/dispatchers/${driver.id}/avatar` : `/api/drivers/${driver.id}/avatar`) : null}
                    pattern={vehicleConflictDrivers.get(driver.id)}
                  />
                  <span>{driverDisplayLabel(driver)}</span>
                </button>
              </div>
            )
          })}
        </div>
        {selectedDriver ? (
          <div
            className={`dispatcher-overlay liftable${driverLiftDragging ? ' dragging' : ''}`}
            style={
              driverLift > 0 || driverLiftSettling
                ? { top: -driverLift, height: `calc(100% + ${driverLift}px)`, zIndex: 8 }
                : undefined
            }
            onTransitionEnd={(event) => {
              if (event.propertyName !== 'top' || event.target !== event.currentTarget) {
                return
              }
              clearDriverLiftTimer()
              setDriverLiftSettling(false)
            }}
          >
            <div
              className="dispatcher-card-lift"
              role="separator"
              aria-orientation="horizontal"
              aria-label={assignDesk ? '拖动调整调度员详情高度' : '拖动调整司导详情高度'}
              onPointerDown={beginDriverLift}
            />
            {assignDesk ? (
              <DispatcherDayCard
                title={`${selectedDriver.name} 的订单`}
                onHeadPointerDown={beginDriverLift}
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
                inkBar
                title={selectedDriver.name}
                onCardPointerDown={beginDriverLift}
                meta={`联系方式 ${contactLabel(selectedDriver.contact)}`}
                bodyRef={driverCalBodyRef}
                bodyKey="driver"
                onBodyScroll={orderPane === 'vehicles' ? syncVehicleCalendarFromDriver : undefined}
                subtitle={driverMarks.length > 0 ? `${driverMarks.length} 天有行程` : '暂无行程'}
                marks={driverMarks}
                rangeStart={driverRangeStart}
                rangeEnd={driverRangeEnd}
                notes={driverNotes}
                onNotesChange={changeDriverNotes}
                onNotesSave={() => {
                  void saveDriverNotes()
                }}
                notesExtra={
                  user.driverId === selectedDriver.id || licensePhotos.length > 0 ? (
                    <LicenseGallery
                      photos={licensePhotos}
                      caption="驾照"
                      urlFor={(photo) => `${licenseApi.driverUrl(selectedDriver.id, photo.id)}?v=${licenseTick}`}
                      canManage={user.driverId === selectedDriver.id}
                      busy={busy}
                      onUpload={async (side, file) => {
                        await licenseApi.upload(side, file)
                        setLicensePhotos(await licenseApi.listForDriver(selectedDriver.id))
                        setLicenseTick((tick) => tick + 1)
                      }}
                      onReplace={async (photoId, file) => {
                        await licenseApi.replace(photoId, file)
                        setLicensePhotos(await licenseApi.listForDriver(selectedDriver.id))
                        setLicenseTick((tick) => tick + 1)
                      }}
                      onRemove={async (photoId) => {
                        await licenseApi.remove(photoId)
                        setLicensePhotos(await licenseApi.listForDriver(selectedDriver.id))
                        setLicenseTick((tick) => tick + 1)
                      }}
                    />
                  ) : undefined
                }
                onClose={() => {
                  setConflictPick(null)
                  setSelectedDriverId(null)
                }}
                onRemove={() => void hideDriver(selectedDriver.id)}
                onDayClick={(mark, anchor) => {
                  if (orderPane === 'vehicles') {
                    openVehicleForDriverDay(mark.orderId, mark.dayId)
                    return
                  }
                  if (mark.owned === false && !mark.conflict) {
                    message.warning('只能移除自己分配的订单')
                    return
                  }
                  if (!selectedDriverId) {
                    return
                  }
                  releaseDriverLift()
                  setSelectedOrderId(null)
                  setSelectedOrderDayId(null)
                  setOrderInfoOpen(false)
                  setConflictPick({ date: mark.date, driverId: selectedDriverId, anchor: anchor.getBoundingClientRect() })
                }}
                dragConflict={orderPane === 'vehicles'}
                onDayPointerDown={(event, mark) => {
                  if (mark.owned === false) {
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
            const label = day ? driverCalendarLabel(order, day) : undefined
            return {
              label: label || '',
              showText: Boolean(day && isOwnAssignment(order, day, user.id)),
            }
          })}
          onChoose={(choice) => void releaseConflictDay(choice)}
          onClose={() => setConflictPick(null)}
        />
      ) : null}
      {vehicleConflict && selectedVehicleId && ordersOnVehicleDate(vehicleOrders, selectedVehicleId, vehicleConflict.date).length > 1 ? (
        <ConflictDatePopover
          anchor={vehicleConflict.anchor}
          choices={conflictChoices(
            ordersOnVehicleDate(vehicleOrders, selectedVehicleId, vehicleConflict.date).map((order) => ({
              order,
              day: dayOnVehicleDate(order, selectedVehicleId, vehicleConflict.date),
            })),
            vehicleConflict.date,
            vehicleConflictedIds,
            (order, day) => {
              const owned = Boolean(day && isOwnAssignment(order, day, user.id))
              return {
                label: owned ? (day?.driverName || '司导') : '',
                showText: owned,
              }
            },
          )}
          onChoose={(choice) => {
            void unbindVehicle(choice.orderId, choice.dayId, true).then((removed) => {
              if (removed) {
                setVehicleConflict(null)
              }
            })
          }}
          onClose={() => setVehicleConflict(null)}
        />
      ) : null}
      {drag && (draggingOrder || draggingDriver || draggingDay || draggingVehicle) ? (
        <div className="dispatcher-ghost" style={{ left: drag.x, top: drag.y }}>
          {draggingOrder
            ? orderDisplayLabel(draggingOrder)
            : draggingDay
              ? [orderDisplayLabel(draggingDay.order), formatMonthDay(draggingDay.day.serviceDate)].filter(Boolean).join(' ')
              : draggingVehicle
                ? draggingVehicle.plate
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

function PersonAvatar({ name, src, pattern }: { name: string; src: string | null; pattern?: ConflictPattern }) {
  const [failed, setFailed] = useState(false)
  return (
    <b style={pattern ? conflictPatternStyle(pattern, 36) : undefined}>
      {pattern ? null : src && !failed ? (
        <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />
      ) : (
        name.slice(0, 1)
      )}
    </b>
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
