import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { message, Modal } from 'antd'
import { authApi, companyApi } from '../../api/auth'
import { clearDayDriver, createOrderWithDays, itineraryDayWrite, ordersApi } from '../../api/orders'
import { useAuthenticatedAuth } from '../../auth/authState'
import { AccountMenu } from '../AccountMenu'
import { driversApi } from '../../api/drivers'
import { readCurrentCompanyId } from '../../currentCompany'
import { PREF_KEYS } from '../../localPrefs'
import { syncDraft, usePageLoad } from '../../usePageLoad'
import { contrastText, driverCalendarFill, readDriverCalendarColors } from '../../calendarUi'
import { calendarHorizon, earlierDate, formatLocalDate, formatMonthDay, laterDate, todayLocal } from '../../localDate'
import { conflictChoices, conflictDateChoices, ConflictDatePopover, type ConflictDateChoice } from '../../ConflictDatePopover'
import { assignedDriverFocus, calendarTrip, dateOrderEdges, dateSpan, driverAssignerCaption, driverDisplayLabel, conflictPatternStyle, conflictingOrderIds, conflictingVehicleOrderIds, dayOnVehicleDate, hasDispatcherAssignment, hasUnassignedDays, isOwnAssignment, orderDisplayLabel, orderSpan, ordersOnDriverDate, ordersOnVehicleDate, patternForOrder, CONFLICT_RED, type ConflictPattern } from '../../orderFlags'
import { placeMark } from '../../placeMark'
import type { ItineraryDay, Order, Vehicle } from '../../types'
import type { CalendarMark } from './DispatcherCalendarCard'
import { usePaneLift } from './paneLift'
import { VehicleBoard } from './VehicleBoard'
import { takePhotoBackdropClick } from '../PhotoViewer'
import { vehiclesApi } from '../../api/vehicles'
import '../driver/driver-calendar.css'
import './dispatcher.css'
import { useCalendarRangePick } from '../../useCalendarRangePick'
import { useOrderInfoDraft } from './useOrderInfoDraft'
import { DEFAULT_ASSIGNED_COLOR, comparePlate, mergeOrders, movedLayout, readLayout, sortBoardOrders, sortDrivers, toggledPins, writeBoardLayout, type BoardPerson, type DriverLayout } from './boardLayout'
import { useBoardDrag, type BoardDragActions } from './useBoardDrag'
import { alignCalendarScroll, collapseDriverMarks, scrollCalendarToDate } from './boardCalendar'
import { DriverDetailCard, DriverPane, DispatcherPoolCard, type PoolFilter } from './DriverPane'
import { OrderPane, type OrderFilter, type OrderPaneTab, type VehicleFilter } from './OrderPane'


export function DispatcherPage() {
  const { user, setUser } = useAuthenticatedAuth()
  const location = useLocation()
  const assignDesk = location.pathname.startsWith('/company/assign')
  const layoutKey = assignDesk ? PREF_KEYS.dispatcherLayout : PREF_KEYS.driverLayout
  const today = formatLocalDate(todayLocal())
  const companyId = user.companyId || readCurrentCompanyId()
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<BoardPerson[]>([])
  const [filter, setFilter] = useState<OrderFilter>('unassigned')
  const [orderPane, setOrderPane] = useState<OrderPaneTab>('orders')
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>('available')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleLayout, setVehicleLayout] = useState<DriverLayout>(() => readLayout(PREF_KEYS.vehicleLayout))
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('open')
  const [assignedColor, setAssignedColor] = useState(user.assignedColor || DEFAULT_ASSIGNED_COLOR)
  const [layout, setLayout] = useState<DriverLayout>(() => readLayout(layoutKey))
  const [armedUnbindId, setArmedUnbindId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrderDayId, setSelectedOrderDayId] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const driverCard = usePaneLift(Boolean(selectedDriverId))
  const [driverFocusDate, setDriverFocusDate] = useState<string | null>(null)
  const [driverFocusDriverOnly, setDriverFocusDriverOnly] = useState(false)
  const [conflictPick, setConflictPick] = useState<{ date: string; driverId: string; anchor: DOMRect } | null>(null)
  const [vehicleConflict, setVehicleConflict] = useState<{ date: string; anchor: DOMRect } | null>(null)
  const [driverTrips, setDriverTrips] = useState<Order[]>([])
  const [driverTripDriverId, setDriverTripDriverId] = useState<string | null>(null)
  const [driverNotes, setDriverNotes] = useState('')
  const driverNotesRef = useRef('')
  const driverNoteLock = useRef(false)
  const [orderInfoOpen, setOrderInfoOpen] = useState(false)
  const [creatingOrder, setCreatingOrder] = useState(false)
  const ordersRef = useRef<Order[]>([])
  const driverTripsRef = useRef<Order[]>([])
  const driverTripDriverIdRef = useRef<string | null>(null)
  const selectedOrderIdRef = useRef<string | null>(null)
  const loadedDriverRef = useRef({ id: undefined as string | null | undefined, notes: '' })
  const driversRef = useRef(drivers)
  const assignLock = useRef(false)
  const selectedDriverIdRef = useRef<string | null>(null)
  const selectedOrderDayIdRef = useRef<string | null>(null)
  const orderCalBodyRef = useRef<HTMLDivElement>(null)
  const createCalBodyRef = useRef<HTMLDivElement>(null)
  const createRange = useCalendarRangePick(createCalBodyRef)
  const orderScrollId = useRef<string | null>(null)
  /** 从订单某一天的当日卡片「返回日历」时，日历要回到这一天（日历是重新挂载的，否则会停在最早的月份）。 */
  const orderReturnDate = useRef<string | null>(null)
  const driverCalBodyRef = useRef<HTMLDivElement>(null)
  const vehicleCalBodyRef = useRef<HTMLDivElement>(null)
  const vehiclePlaced = useRef<string | null>(null)
  const calendarJumping = useRef(false)
  const driverScrollPending = useRef<string | null>(null)
  const orderPaneRef = useRef(orderPane)
  const dragActionsRef = useRef<BoardDragActions | null>(null)
  const { drag, dragRef, hoverDriverId, hoverVehicleId, hoverOrderPane, beginPointer } = useBoardDrag(busy, dragActionsRef)

  useEffect(() => {
    driversRef.current = drivers
    ordersRef.current = orders
    driverTripsRef.current = driverTrips
    driverTripDriverIdRef.current = driverTripDriverId
    orderPaneRef.current = orderPane
  }, [assignDesk, driverTripDriverId, driverTrips, drivers, orderPane, orders, user.id])

  const vehicleOrders = useMemo(() => mergeOrders(orders, driverTrips), [driverTrips, orders])
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
        : scoped.filter((order) => order.dayCount > 0 && !order.isHistorical)
    return sortBoardOrders(listed)
  }, [assignDesk, companyId, conflictedIds, filter, orders])
  const { from: createFrom, to: createTo } = createRange
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
        ? owned.filter((order) => !order.isFinished)
        : owned.filter((order) => order.isFinished)
    return sortBoardOrders(listed)
  }, [assignDesk, companyId, orders, poolFilter, selectedDriverId])
  const hiddenDrivers = useMemo(
    () => drivers.filter((driver) => driver.hidden),
    [drivers],
  )
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null
  const orderRangeStart = earlierDate(horizon.start, selectedOrder?.days[0]?.serviceDate || selectedOrder?.startDate) || horizon.start
  const orderRangeEnd = laterDate(horizon.end, selectedOrder?.endDate || selectedOrder?.days.at(-1)?.serviceDate) || horizon.end
  const selectedOrderDay = selectedOrder?.days.find((day) => day.id === selectedOrderDayId) ?? null
  const orderEditorDay = useMemo(
    () => (selectedOrder && selectedOrderDay ? { date: selectedOrderDay.serviceDate, items: [calendarTrip(selectedOrder, selectedOrderDay)] } : null),
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

  const orderDraft = useOrderInfoDraft(orders, selectedOrderId, {
    reload: loadBoard,
    onSaved: () => setOrderInfoOpen(false),
  })

  const shownOrderIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId
    if (shownOrderIdRef.current !== selectedOrderId) {
      // 换一张订单时收起当日行程和订单信息编辑。
      // oxlint-disable-next-line react/set-state-in-effect
      setSelectedOrderDayId(null)
      setOrderInfoOpen(false)
    }
    shownOrderIdRef.current = selectedOrderId
  }, [selectedOrderId])

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
    // 路由在调度台和派给调度之间切换时，需要重新载入各自的本地布局。
    // oxlint-disable-next-line react/set-state-in-effect
    setLayout(readLayout(layoutKey))
  }, [layoutKey])

  useEffect(() => {
    if (!selectedOrderId && !selectedDriverId && !selectedVehicleId && !addingVehicle) {
      return
    }
    function onClick(event: MouseEvent) {
      if (takePhotoBackdropClick()) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (target.closest('.dispatcher-card, .dispatcher-card-lift, .conflict-date-popover, button, a, input, textarea, select, label, [role="button"], .ant-modal-root, .account-menu, .library-overlay')) {
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
      orderReturnDate.current = null
      return
    }
    if (selectedOrderDay) {
      // 进入当日卡片：订单日历被替换掉，返回时按这一天重新定位。
      orderReturnDate.current = selectedOrderDay.serviceDate
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
    const returnDate = orderReturnDate.current
    const date = returnDate || selectedOrder?.days[0]?.serviceDate || selectedOrder?.startDate
    if (!date || !orderCalBodyRef.current) {
      return
    }
    scrollCalendarToDate(orderCalBodyRef.current, date, returnDate ? 'center' : 'start')
    orderScrollId.current = selectedOrderId
    orderReturnDate.current = null
  }, [creatingOrder, driverFocusDate, selectedOrder, selectedOrderDay, selectedOrderId])

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

  function closeCreateOrder() {
    createRange.clear()
    setCreatingOrder(false)
  }

  function toggleCreateOrder() {
    if (creatingOrder) {
      closeCreateOrder()
      return
    }
    setSelectedOrderId(null)
    setSelectedOrderDayId(null)
    createRange.clear()
    setCreatingOrder(true)
  }

  function onCreateDayPointerDown(date: string) {
    if (busy) {
      return
    }
    createRange.press(date)
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
        if (order?.days.some((day) => day.driverId && !isOwnAssignment(day, user.id))) {
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
      if (assignedDays.some((item) => !isOwnAssignment(item, user.id))) {
        message.warning('只能移除自己分配的订单')
        return
      }
    } else if (!day?.driverId) {
      return
    } else if (!isOwnAssignment(day, user.id)) {
      message.warning('只能移除自己分配的订单')
      return
    }
    assignLock.current = true
    setBusy(true)
    try {
      if (day && (onlyDay || order.isSplit)) {
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
    if (!isOwnAssignment(day, user.id)) {
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
    if (day.driverId && !isOwnAssignment(day, user.id)) {
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
    writeBoardLayout(PREF_KEYS.vehicleLayout, next, setVehicleLayout)
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
      order.days.some((day) => day.serviceDate === date && day.driverId === driverId && isOwnAssignment(day, user.id)),
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
      (item) => item.serviceDate === date && item.driverId === driverId && isOwnAssignment(item, user.id),
    )
    if (!day) {
      return
    }
    try {
      await vehiclesApi.bind(owned[0].id, day.id, vehicleId)
      await loadBoard()
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
    const day = order.days.find((item) => item.id === dayId) ?? order.days.find((item) => item.vehicleId && isOwnAssignment(item, user.id))
    const targetDayId = day?.id
    if (onlyDay) {
      if (!day || !isOwnAssignment(day, user.id)) {
        message.warning('只能解除自己分配的车辆')
        return false
      }
      if (!day.vehicleId) {
        message.warning('这一天还没有绑定车辆')
        return false
      }
    } else if (!order.days.some((item) => item.vehicleId && isOwnAssignment(item, user.id))) {
      message.warning('只能解除自己分配的车辆')
      return false
    }
    assignLock.current = true
    setBusy(true)
    try {
      if (!targetDayId) {
        return false
      }
      await vehiclesApi.unbind(orderId, targetDayId, onlyDay)
      await loadBoard()
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

  function showOrder(orderId: string) {
    setCreatingOrder(false)
    createRange.clear()
    setConflictPick(null)
    setSelectedOrderDayId(null)
    setOrderInfoOpen(false)
    setSelectedOrderId(orderId)
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
      driverCard.release()
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
    driverCard.release()
    queueDriverFocus(day.driverId, day.serviceDate, true)
  }

  function openOwnedDriverDay(orderId: string, dayId?: string) {
    const order = ordersRef.current.find((item) => item.id === orderId)
    const day = order?.days.find((item) => item.id === dayId)
    if (!order || !day || !isOwnAssignment(day, user.id)) {
      if (order && day) {
        message.warning('只能移除自己分配的订单')
      }
      return
    }
    driverCard.release()
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

  /** 整单拖动前检查：调度台里这张订单有别人分配的日期就不能整单拖（派给调度不限制）。 */
  function isForeignOrder(orderId: string) {
    if (assignDesk) {
      return false
    }
    const order = orders.find((item) => item.id === orderId) ?? driverTrips.find((item) => item.id === orderId)
    if (!order) {
      return true
    }
    return order.days.some((day) => day.driverId && !isOwnAssignment(day, user.id))
  }

  function toggleDriver(driverId: string) {
    const next = selectedDriverId === driverId ? null : driverId
    if (!next) {
      driverScrollPending.current = null
      setSelectedDriverId(null)
    } else if (selectedOrderIdRef.current) {
      driverScrollPending.current = null
      setSelectedDriverId(next)
    } else {
      queueDriverFocus(next, formatLocalDate(todayLocal()), false)
    }
  }

  function toggleVehicle(vehicleId: string) {
    setAddingVehicle(false)
    setSelectedVehicleId((current) => (current === vehicleId ? null : vehicleId))
  }

  /** 司导日历点某一天：车辆管理时打开这天的车；否则日期重叠时弹出冲突选择。 */
  function openDriverCalendarDay(mark: CalendarMark, anchor: HTMLButtonElement) {
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
    driverCard.release()
    setSelectedOrderId(null)
    setSelectedOrderDayId(null)
    setOrderInfoOpen(false)
    setConflictPick({ date: mark.date, driverId: selectedDriverId, anchor: anchor.getBoundingClientRect() })
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
    selectedDriverIdRef.current = selectedDriverId
    selectedOrderDayIdRef.current = selectedOrderDayId
    dragActionsRef.current = {
      vehiclePane: orderPane === 'vehicles',
      openDriverId: selectedDriverId,
      isForeignOrder,
      assignOrder,
      assignDay,
      unbindDay: unbindDriverDay,
      bindVehicle,
      unbindVehicle,
      reorderDriver,
      reorderVehicle,
      selectOrderDay,
      openOwnedDriverDay,
      openVehicleForDriverDay,
      queueDriverFocus,
      toggleOrder,
      toggleDriver,
      toggleVehicle,
      releaseDriverLift: driverCard.release,
    }
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
      owned: assignDesk ? undefined : !day.driverId || isOwnAssignment(day, user.id),
    }
  })

  function driverCalendarLabel(order: Order, day: ItineraryDay) {
    if (!isOwnAssignment(day, user.id)) {
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
            const owned = isOwnAssignment(day, user.id)
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
      const own = items.find((item) => isOwnAssignment(item.day, user.id)) ?? items[0]
      const edge = spans.get(own.order.id)
      const driverName = own.day.driverName || drivers.find((driver) => driver.id === own.day.driverId)?.name
      return {
        date,
        dayId: own.day.id,
        orderId: own.order.id,
        label: conflict ? undefined : driverName || undefined,
        assigned: true,
        owned: items.some((item) => isOwnAssignment(item.day, user.id)),
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
    const split = byDriver ? order.isSplit : false
    const conflicted = conflictedIds.has(order.id)
    const focusPattern = conflictIds.includes(order.id) ? patternForOrder([...conflictedIds], order.id) : undefined
    const live = order.isInProgress
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
      return order.isInProgress ? '进行中' : `${order.dayCount} 天`
    }
    if (assigned < order.dayCount || order.isSplit) {
      return '拆分'
    }
    return order.isInProgress ? '进行中' : '已分配'
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

      <OrderPane
        assignDesk={assignDesk}
        tab={orderPane}
        onTabChange={setOrderPane}
        drop={hoverOrderPane}
        addingVehicle={addingVehicle}
        onAddVehicle={() => {
          setAddingVehicle(true)
          setSelectedVehicleId(null)
        }}
        vehicleFilter={vehicleFilter}
        onVehicleFilterChange={setVehicleFilter}
        vehicleBoard={
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
            onPointerDown={(event, id) => beginPointer(event, { kind: 'vehicle', id, x: event.clientX, y: event.clientY })}
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
        }
        creatingOrder={creatingOrder}
        onToggleCreate={toggleCreateOrder}
        filter={filter}
        onFilterChange={setFilter}
        assignedColor={assignedColor}
        onAssignedColorChange={persistColor}
        orders={visibleOrders}
        renderOrderTile={(order) => renderOrderTile(order)}
        create={{
          from: createFrom,
          to: createTo,
          rangeStart: createCalStart,
          rangeEnd: createCalEnd,
          bodyRef: createCalBodyRef,
          busy,
          onClose: closeCreateOrder,
          onDatePointerDown: onCreateDayPointerDown,
          onDateTouchHold: createRange.hold,
          onDatePointerEnter: createRange.enter,
          onSubmit: () => void createOrderRange(),
        }}
        selected={
          selectedOrder
            ? {
                order: selectedOrder,
                day: selectedOrderDay,
                editorDay: orderEditorDay,
                assignDesk,
                subtitle: `${formatMonthDay(selectedOrder.startDate)} · ${selectedOrder.dayCount} 天 · ${assignDesk ? (selectedOrder.assignedDispatcherName || '未分配') : selectedOrder.assignedDayCount > 0 ? orderStatus(selectedOrder) : '未分配'}`,
                marks: orderMarks,
                rangeStart: orderRangeStart,
                rangeEnd: orderRangeEnd,
                bodyRef: orderCalBodyRef,
                onBodyScroll: syncDriverCalendarFromOrder,
                infoOpen: orderInfoOpen,
                onInfoOpenChange: (open) => {
                  setOrderInfoOpen(open)
                  if (open) {
                    setSelectedOrderDayId(null)
                  }
                },
                draft: orderDraft,
                removeLabel: user.role === 'dispatcher' && selectedOrder.companyId ? '退回公司' : '删除订单',
                onRemove: deleteSelectedOrder,
                onClose: () => setSelectedOrderId(null),
                onBackToCalendar: () => setSelectedOrderDayId(null),
                onChanged: loadBoard,
                beginPointer,
              }
            : null
        }
      />

      <DriverPane
        assignDesk={assignDesk}
        drop={Boolean(hoverDriverId && selectedDriverId && hoverDriverId === selectedDriverId && drag && drag.kind !== 'driver')}
        drivers={visibleDrivers}
        hiddenDrivers={hiddenDrivers}
        pinnedIds={layout.pinnedIds}
        selectedDriverId={selectedDriverId}
        hoverDriverId={hoverDriverId}
        drag={drag}
        conflictPatterns={vehicleConflictDrivers}
        armedUnbindId={armedUnbindId}
        canUnbind={canUnbind}
        onHiddenToggle={() => setArmedUnbindId(null)}
        onRestore={(id) => void restoreDriver(id)}
        onRequestUnbind={requestUnbind}
        onTogglePin={togglePin}
        beginPointer={beginPointer}
        lift={driverCard}
        card={
          !selectedDriver ? null : assignDesk ? (
            <DispatcherPoolCard
              person={selectedDriver}
              orders={dispatcherOrders}
              filter={poolFilter}
              onFilterChange={setPoolFilter}
              notes={driverNotes}
              onNotesChange={changeDriverNotes}
              onNotesSave={() => {
                void saveDriverNotes()
              }}
              onClose={() => setSelectedDriverId(null)}
              onHide={() => void hideDriver(selectedDriver.id)}
              onHeadPointerDown={driverCard.begin}
              renderOrderTile={(order) => renderOrderTile(order, 'driver')}
            />
          ) : (
            <DriverDetailCard
              key={selectedDriver.id}
              person={selectedDriver}
              isSelf={user.driverId === selectedDriver.id}
              busy={busy}
              marks={driverMarks}
              rangeStart={driverRangeStart}
              rangeEnd={driverRangeEnd}
              bodyRef={driverCalBodyRef}
              onBodyScroll={orderPane === 'vehicles' ? syncVehicleCalendarFromDriver : undefined}
              notes={driverNotes}
              onNotesChange={changeDriverNotes}
              onNotesSave={() => {
                void saveDriverNotes()
              }}
              onClose={() => {
                setConflictPick(null)
                setSelectedDriverId(null)
              }}
              onHide={() => void hideDriver(selectedDriver.id)}
              onCardPointerDown={driverCard.begin}
              onDayClick={openDriverCalendarDay}
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
          )
        }
      />

      {conflictPick && conflictOrders.length > 1 ? (
        <ConflictDatePopover
          anchor={conflictPick.anchor}
          choices={conflictDateChoices(conflictOrders, conflictPick.driverId, conflictPick.date, conflictedIds, (order, day) => {
            const label = day ? driverCalendarLabel(order, day) : undefined
            return {
              label: label || '',
              showText: Boolean(day && isOwnAssignment(day, user.id)),
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
            (_order, day) => {
              const owned = Boolean(day && isOwnAssignment(day, user.id))
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

