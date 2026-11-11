import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useWeatherSource } from '../../api/weather'
import { message } from 'antd'
import { authApi, companyApi } from '../../api/auth'
import { clearDayDriver, createOrderWithDays, itineraryDayWrite, ordersApi } from '../../api/orders'
import { useAuthenticatedAuth } from '../../auth/authState'
import { AccountMenu } from '../AccountMenu'
import { driversApi } from '../../api/drivers'
import { readCurrentCompanyId } from '../../currentCompany'
import { PREF_KEYS } from '../../localPrefs'
import { syncDraft, usePageLoad } from '../../usePageLoad'
import { contrastText, driverCalendarFill, readDriverCalendarColors } from '../../calendarUi'
import { calendarHorizon, earlierDate, formatLocalDate, formatMonthDay, laterDate, toDateOnly, todayLocal } from '../../localDate'
import { conflictChoices, conflictDateChoices, ConflictDatePopover, type ConflictDateChoice } from '../../ConflictDatePopover'
import { assignedDriverFocus, calendarTrip, dateOrderEdges, dateSpan, driverAssignerCaption, driverDisplayLabel, conflictPatternStyle, conflictingOrderIds, conflictingVehicleOrderIds, dayOnVehicleDate, hasDispatcherAssignment, hasUnassignedDays, isOwnAssignment, orderDisplayLabel, orderSpan, orderTileLabel, ordersOnDriverDate, ordersOnVehicleDate, patternForOrder, CONFLICT_RED, type ConflictPattern } from '../../orderFlags'
import { placeMark } from '../../placeMark'
import type { ItineraryDay, Order, OrderClaim, Vehicle } from '../../types'
import { grabApi } from '../../api/grab'
import { recognitionApi } from '../../api/recognition'
import { AiOrderCard } from './AiOrderCard'
import { ClaimConfirmBar, ClaimPickPopover } from './ClaimParts'
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
import {
  alignCalendarScroll,
  alignCalendarToDate,
  calendarDateVisible,
  collapseDriverMarks,
  scrollCalendarToDate,
} from './boardCalendar'
import { DriverDetailCard, DriverPane, DispatcherPoolCard, type PoolFilter } from './DriverPane'
import { useDisarmOnOutside } from '../../useDisarmOnOutside'
import { useCalendarInk } from '../../calendarInk'
import { OrderPane, type OrderFilter, type OrderPaneTab, type VehicleFilter } from './OrderPane'
import { RescheduleFooter, RescheduleSaveButton, reschedulePreviewOf, rescheduleHint, saveOrderDates } from './orderReschedulePreview'
import { useOrderReschedule } from './useOrderReschedule'
import { markRecordsBack, readDispatcherJump, type DispatcherJump } from './dispatcherJump'


/** 抢单专用色的浅底（日历格子），边框和文字用橙色。 */
const GRAB_FILL = '#FFF7E6'

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
  /** 车辆标签「未配车」：司导区只留下自己已派单、还没配车的司导。 */
  const [missingOnly, setMissingOnly] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleLayout, setVehicleLayout] = useState<DriverLayout>(() => readLayout(PREF_KEYS.vehicleLayout))
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('open')
  const [assignedColor, setAssignedColor] = useState(user.assignedColor || DEFAULT_ASSIGNED_COLOR)
  const [layout, setLayout] = useState<DriverLayout>(() => readLayout(layoutKey))
  const [armedUnbindId, setArmedUnbindId] = useState<string | null>(null)
  /** 日期文字 / 背景字的透明度：司导卡片的控制条和订单卡片共用这一份。 */
  const calendarInk = useCalendarInk()
  /** 日历上的天气和司导日历同一份数据，来源注在页头。 */
  const weatherSource = useWeatherSource()
  /** 套着红框、等第二次点的删除类按钮：'order' 是订单卡片的退回 / 删除，'hide:<id>' 是司导 / 调度员卡片的隐藏。 */
  const [armedRemove, setArmedRemove] = useState<string | null>(null)
  const orderRemoveArmed = armedRemove === 'order'
  const [busy, setBusy] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrderDayId, setSelectedOrderDayId] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const driverCard = usePaneLift(Boolean(selectedDriverId))
  const [driverFocusDate, setDriverFocusDate] = useState<string | null>(null)
  const [driverFocusDriverOnly, setDriverFocusDriverOnly] = useState(false)
  const [conflictPick, setConflictPick] = useState<{ date: string; driverId: string; anchor: DOMRect } | null>(null)
  /** 待确认的抢单（调度台才读，派给调度不读）。 */
  const [claims, setClaims] = useState<OrderClaim[]>([])
  /** 多位司导抢同一张单时，点订单图标弹出的选择框。 */
  const [claimPick, setClaimPick] = useState<{ orderId: string; anchor: DOMRect } | null>(null)
  const [vehicleConflict, setVehicleConflict] = useState<{ date: string; anchor: DOMRect } | null>(null)
  const [driverTrips, setDriverTrips] = useState<Order[]>([])
  const [driverTripDriverId, setDriverTripDriverId] = useState<string | null>(null)
  const [driverNotes, setDriverNotes] = useState('')
  const driverNotesRef = useRef('')
  /** 正在保存的司导备注：失焦和点「保存」几乎同时触发时，后一个等前一个的结果。 */
  const driverNoteSaving = useRef<Promise<boolean> | null>(null)
  const [orderInfoOpen, setOrderInfoOpen] = useState(false)
  const [creatingOrder, setCreatingOrder] = useState(false)
  /** AI 建单：服务器配了密钥才显示入口。 */
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const ordersRef = useRef<Order[]>([])
  const driverTripsRef = useRef<Order[]>([])
  const driverTripDriverIdRef = useRef<string | null>(null)
  const selectedOrderIdRef = useRef<string | null>(null)
  const loadedDriverRef = useRef({ id: undefined as string | null | undefined, notes: '' })
  const driversRef = useRef(drivers)
  const assignLock = useRef(false)
  const orderCalBodyRef = useRef<HTMLDivElement>(null)
  /** 在订单日历上拖动改日期。 */
  const reschedule = useOrderReschedule(orderCalBodyRef)
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
  /** 从订单记录点司导、车牌跳过来：调度台第一次读完数据后打开对应的卡片，只跳一次。 */
  const pendingJump = useRef<DispatcherJump | null>(readDispatcherJump(location.state))
  /** 从订单记录跳过来的：页面左上角显示返回按钮，回到公司信息的订单记录。 */
  const [cameFromRecords] = useState(() => pendingJump.current !== null)
  const navigate = useNavigate()
  const [boardLoaded, setBoardLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    recognitionApi.status().then(
      (status) => alive && setAiEnabled(status.enabled),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])

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

  const claimsByOrder = useMemo(() => {
    const map = new Map<string, OrderClaim[]>()
    for (const claim of claims) {
      map.set(claim.orderId, [...(map.get(claim.orderId) ?? []), claim])
    }
    return map
  }, [claims])
  const claimsByDriver = useMemo(() => {
    const map = new Map<string, OrderClaim[]>()
    for (const claim of claims) {
      map.set(claim.driverId, [...(map.get(claim.driverId) ?? []), claim])
    }
    return map
  }, [claims])
  /** 名单里的司导，加上还不在名单里的抢单司导（只在调度台出现，确认后自动进名单）。 */
  const boardDrivers = useMemo(() => {
    const known = new Set(drivers.map((driver) => driver.id))
    const extra: BoardPerson[] = []
    for (const claim of claims) {
      if (!known.has(claim.driverId)) {
        known.add(claim.driverId)
        extra.push({ id: claim.driverId, name: claim.driverName, contact: claim.contact, notes: null, hidden: false, hasAvatar: claim.hasAvatar })
      }
    }
    return [...drivers, ...extra]
  }, [claims, drivers])
  /** 置顶的在前，接着是抢单司导（虚线框），最后是其余的司导。 */
  const visibleDrivers = useMemo(() => {
    const sorted = sortDrivers(boardDrivers, layout)
    const pinned = new Set(layout.pinnedIds)
    return [
      ...sorted.filter((driver) => pinned.has(driver.id)),
      ...sorted.filter((driver) => !pinned.has(driver.id) && claimsByDriver.has(driver.id)),
      ...sorted.filter((driver) => !pinned.has(driver.id) && !claimsByDriver.has(driver.id)),
    ]
  }, [boardDrivers, claimsByDriver, layout])
  /** 自己派出的、今天及以后、还没配车的日期，按司导汇总；没派司导的日期不算。 */
  const missingVehicles = useMemo(() => {
    const byDriver = new Map<string, { days: number; first: string }>()
    const orderIds = new Set<string>()
    if (assignDesk) {
      return { byDriver, orderCount: 0 }
    }
    for (const order of vehicleOrders) {
      for (const day of order.days) {
        if (!day.driverId || day.vehicleId || day.serviceDate < today || !isOwnAssignment(day, user.id)) {
          continue
        }
        orderIds.add(order.id)
        const entry = byDriver.get(day.driverId)
        if (entry) {
          entry.days += 1
          entry.first = day.serviceDate < entry.first ? day.serviceDate : entry.first
        } else {
          byDriver.set(day.driverId, { days: 1, first: day.serviceDate })
        }
      }
    }
    return { byDriver, orderCount: orderIds.size }
  }, [assignDesk, today, user.id, vehicleOrders])
  const missingMode = missingOnly && orderPane === 'vehicles' && !assignDesk
  /** 未配车时最早缺车的司导排最前；平时照常。 */
  const paneDrivers = useMemo(() => {
    if (!missingMode) {
      return visibleDrivers
    }
    return visibleDrivers
      .filter((driver) => missingVehicles.byDriver.has(driver.id))
      .sort((a, b) => missingVehicles.byDriver.get(a.id)!.first.localeCompare(missingVehicles.byDriver.get(b.id)!.first))
  }, [missingMode, missingVehicles, visibleDrivers])
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
  const selectedDriver = boardDrivers.find((driver) => driver.id === selectedDriverId) ?? null
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
      const ordersTask = ordersApi.list({ desk: true }).then(setOrders, (error: unknown) => {
        message.error(error instanceof Error ? error.message : '加载订单失败')
      })
      const driversTask = driversApi.list().then(setDrivers, (error: unknown) => {
        message.error(error instanceof Error ? error.message : '加载司导失败')
      })
      const vehiclesTask = vehiclesApi.list().then(setVehicles, (error: unknown) => {
        message.error(error instanceof Error ? error.message : '加载车辆失败')
      })
      const claimsTask = grabApi.claims().then(setClaims, () => setClaims([]))
      await Promise.all([ordersTask, driversTask, vehiclesTask, claimsTask])
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
    if (reschedule.active && reschedule.orderId !== selectedOrderId) {
      reschedule.close()
    }
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
    return loadBoard().finally(() => setBoardLoaded(true))
  }, companyId)

  useEffect(() => {
    if (!pendingJump.current) {
      return
    }
    // 跳转信息只用一次：从浏览器记录里去掉，刷新页面不会再跳。
    try {
      const state = window.history.state as Record<string, unknown> | null
      window.history.replaceState({ ...state, usr: null }, '')
    } catch {
      // 不影响跳转。
    }
  }, [])

  useEffect(() => {
    const jump = pendingJump.current
    if (!jump || !boardLoaded) {
      return
    }
    pendingJump.current = null
    if (assignDesk) {
      // 派给调度：没有司导、车辆卡片，只打开这张订单。
      if (orders.some((order) => order.id === jump.orderId)) {
        showOrder(jump.orderId)
      } else {
        message.warning('找不到这张单')
      }
    } else {
      openJump(jump)
    }
    // 只在第一次读完数据时跳；openJump 读的是这一次渲染的订单、司导和车辆。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [boardLoaded])

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
      if (target.closest('.dispatcher-card, .dispatcher-card-lift, .calendar-ink-bar, .conflict-date-popover, button, a, input, textarea, select, label, [role="button"], .ant-modal-root, .account-menu, .library-overlay')) {
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

  // 二次确认（红框）进行中，点页面上别的地方就取消。捕获阶段监听，卡片和日历里拦住冒泡的按下也能取消。
  const clearArmedRemove = useCallback(() => setArmedRemove(null), [])
  useDisarmOnOutside(armedRemove !== null, '[data-card-remove]', clearArmedRemove)
  const clearArmedUnbind = useCallback(() => setArmedUnbindId(null), [])
  useDisarmOnOutside(armedUnbindId !== null, '[data-unbind-driver]', clearArmedUnbind)

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



  /** 上半部分正在显示的日历：车辆管理时是车辆日历，创建订单时是创建日历，否则是订单日历。 */
  function topCalendarBody() {
    if (orderPaneRef.current === 'vehicles') {
      return vehicleCalBodyRef.current
    }
    return createCalBodyRef.current ?? orderCalBodyRef.current
  }

  /** 由同步改动引起的滚动：记下目标日历被设成的位置，它自己的滚动事件就不再反过来带动另一边。 */
  const syncedScroll = useRef(new WeakMap<HTMLElement, number>())

  /**
   * 上下两张日历一起滑：滑哪一张，另一张就把同一天对齐到同样的高度。
   * 订单 / 创建订单 / 车辆日历和司导日历都一样，不分情况；没有日历（当日卡片、调度员订单池）时什么都不做。
   */
  function syncCalendars(source: HTMLElement | null, target: HTMLElement | null) {
    if (calendarJumping.current || !source || !target) {
      return
    }
    const expected = syncedScroll.current.get(source)
    if (expected !== undefined) {
      syncedScroll.current.delete(source)
      if (Math.abs(source.scrollTop - expected) < 2) {
        return
      }
    }
    const before = target.scrollTop
    alignCalendarScroll(source, target)
    if (target.scrollTop !== before) {
      syncedScroll.current.set(target, target.scrollTop)
    }
  }

  function syncDriverCalendarFromTop() {
    syncCalendars(topCalendarBody(), driverCalBodyRef.current)
  }

  function syncTopCalendarFromDriver() {
    syncCalendars(driverCalBodyRef.current, topCalendarBody())
  }

  function syncDriverCalendarFromOrder() {
    if (calendarJumping.current) {
      return
    }
    alignCalendarScroll(orderCalBodyRef.current, driverCalBodyRef.current)
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
    // 从订单日历上点的一天：订单日历看得见这一天就不动，司导日历把这一天放到和订单日历一样的高度。
    const orderBody = orderCalBodyRef.current
    if (!driverFocusDriverOnly && !calendarDateVisible(orderBody, driverFocusDate)) {
      scrollCalendarToDate(orderBody, driverFocusDate)
    }
    const driverBody = driverCalBodyRef.current
    const aligned = !driverFocusDriverOnly && alignCalendarToDate(orderBody, driverBody, driverFocusDate)
    // 司导日历比订单日历矮、这一天在底下时，对齐后可能露不全：退一步把它放到可见范围里。
    if (!aligned || !calendarDateVisible(driverBody, driverFocusDate)) {
      scrollCalendarToDate(driverBody, driverFocusDate, aligned ? 'center' : 'start')
    }
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
    // 打开创建订单时，下面的司导日历也对齐过来。
    calendarJumping.current = true
    alignCalendarScroll(createCalBodyRef.current, driverCalBodyRef.current)
    calendarJumping.current = false
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
    setAiOpen(false)
    createRange.clear()
    setCreatingOrder(true)
  }

  function toggleAiOrder() {
    if (aiOpen) {
      setAiOpen(false)
      return
    }
    closeCreateOrder()
    setSelectedOrderId(null)
    setSelectedOrderDayId(null)
    setAiOpen(true)
  }

  async function onAiOrderCreated(orderId: string) {
    setAiOpen(false)
    message.success('已生成订单，可以开始派单')
    await loadBoard()
    setSelectedOrderId(orderId)
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
        onMyDesk: !assignDesk,
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
        // 还有未分配的日期时只派这些日期，已派给别人的不动；全部已分配才是整单改派。
        const openDays = order?.days.filter((day) => !day.driverId).length ?? 0
        if (openDays === 0 && order?.days.some((day) => day.driverId && !isOwnAssignment(day, user.id))) {
          message.warning('只能移除自己分配的订单')
          return
        }
        const result = await ordersApi.assignDriver(orderId, driverId)
        message.success(
          openDays > 0 && openDays < (order?.days.length ?? 0)
            ? `已把未分配的 ${result.updatedDayCount} 天派给司导`
            : '已分配给司导',
        )
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

  /** 订单卡片的退回 / 删除：和司导、车辆一样，第一次点套红框，再点一次才执行。 */
  async function deleteSelectedOrder() {
    const order = selectedOrder
    if (!order || assignLock.current || busy) {
      return
    }
    if (!orderRemoveArmed) {
      setArmedRemove('order')
      return
    }
    // 跟着界面走：调度台上已绑公司的单退回公司订单池（公司账户也一样）；派给调度里是真删。
    const releaseToPool = !assignDesk && Boolean(order.companyId)
    setArmedRemove(null)
    assignLock.current = true
    setBusy(true)
    try {
      await ordersApi.remove(order.id, releaseToPool)
      message.success(releaseToPool ? '已退回公司' : '订单已删除')
      setSelectedOrderId(null)
      setSelectedOrderDayId(null)
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : releaseToPool ? '无法退回公司' : '删除订单失败')
    } finally {
      assignLock.current = false
      setBusy(false)
    }
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

  /** 隐藏司导 / 调度员：和删除一样，第一次点套红框，再点一次才隐藏。 */
  function requestHide(driverId: string) {
    if (armedRemove !== `hide:${driverId}`) {
      setArmedRemove(`hide:${driverId}`)
      return
    }
    setArmedRemove(null)
    void hideDriver(driverId)
  }

  async function hideDriver(driverId: string) {
    try {
      await writeHidden(driverId, true)
      // 隐藏就是拉黑：他的抢单不再显示。
      setClaims((current) => current.filter((claim) => claim.driverId !== driverId))
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
    // 按界面不按角色：公司账户在调度台上也能解除自己的司导；不能解除自己。
    return assignDesk ? personId !== user.id : personId !== user.driverId
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
    // 调度台：这一天派了司导、但下面打开的不是他（拆单时每天可能是不同的司导），
    // 先打开这位司导的卡片、日历跳到这一天，不进当日行程；再点一次才进当日行程。
    const day = selectedOrder?.days.find((item) => item.id === dayId)
    if (
      !assignDesk &&
      day?.driverId &&
      day.driverId !== selectedDriverId &&
      drivers.some((driver) => driver.id === day.driverId && !driver.hidden)
    ) {
      setSelectedOrderDayId(null)
      queueDriverFocus(day.driverId, day.serviceDate, false)
      return
    }
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

  /** 订单记录跳过来：未派单只打开订单；派了司导没配车，切到车辆打开司导；点司导打开订单和司导详情（司导日历到他在这张单上的第一天）；点车牌切到车辆，打开车辆和那天的司导。 */
  function openJump(jump: DispatcherJump) {
    const order = orders.find((item) => item.id === jump.orderId)
    if (!order) {
      message.warning('这张单不在你的调度台上')
      return
    }
    const days = [...order.days].sort((left, right) => left.serviceDate.localeCompare(right.serviceDate))
    const knownDriver = (driverId: string) => boardDrivers.some((driver) => driver.id === driverId)
    setCreatingOrder(false)
    createRange.clear()
    setAiOpen(false)
    setMissingOnly(false)
    setConflictPick(null)
    setVehicleConflict(null)
    if (jump.kind === 'order') {
      setOrderPane('orders')
      showOrder(order.id)
      return
    }
    if (jump.kind === 'driver') {
      setOrderPane('orders')
      showOrder(order.id)
      const day = days.find((item) => item.driverId === jump.driverId)
      if (!day) {
        return
      }
      if (!knownDriver(jump.driverId)) {
        message.warning('这位司导不在你的司导列表里')
        return
      }
      queueDriverFocus(jump.driverId, day.serviceDate, false)
      return
    }
    setOrderPane('vehicles')
    setSelectedOrderId(null)
    setSelectedOrderDayId(null)
    setAddingVehicle(false)
    if (jump.kind === 'missingVehicle') {
      // 派了司导、没配车：车辆管理里打开这位司导，日历到他在这张单上第一个没配车的日子，方便拖车给他。
      setSelectedVehicleId(null)
      const day =
        days.find((item) => item.driverId === jump.driverId && !item.vehicleId) ??
        days.find((item) => item.driverId === jump.driverId)
      if (!day) {
        return
      }
      if (!knownDriver(jump.driverId)) {
        message.warning('这位司导不在你的司导列表里')
        return
      }
      queueDriverFocus(jump.driverId, day.serviceDate, true)
      return
    }
    const vehicle = vehicles.find((item) => item.id === jump.vehicleId)
    if (vehicle) {
      if (!vehicle.available) {
        setVehicleFilter('all')
      }
      setSelectedVehicleId(vehicle.id)
    } else {
      message.warning('只能打开自己的车辆')
    }
    const day = days.find((item) => item.vehicleId === jump.vehicleId)
    if (day?.driverId && knownDriver(day.driverId)) {
      queueDriverFocus(day.driverId, day.serviceDate, true)
    }
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
      setClaimPick(null)
      return
    }
    showOrder(orderId)
    if (assignDesk) {
      // 和调度台一样：打开订单时把负责它的人一起打开（这里是分到的调度员）。
      const owner = ordersRef.current.find((item) => item.id === orderId)?.assignedDispatcherUserId
      if (owner && driversRef.current.some((person) => person.id === owner && !person.hidden)) {
        driverCard.release()
        setSelectedDriverId(owner)
      }
      return
    }
    const orderClaims = claimsByOrder.get(orderId) ?? []
    if (orderClaims.length > 0) {
      openClaimedOrder(orderId, orderClaims)
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

  /**
   * 打开有人抢的订单：一位司导抢时同时打开这位司导；多位时弹出扑克牌选择框，
   * 司导区域滚到这些司导，图标换成对应的扑克牌，由调度员点选。
   */
  function openClaimedOrder(orderId: string, orderClaims: OrderClaim[]) {
    const order = ordersRef.current.find((item) => item.id === orderId)
    const focusDate = order?.days.find((day) => !day.driverId)?.serviceDate ?? order?.startDate ?? today
    if (orderClaims.length === 1) {
      setClaimPick(null)
      driverCard.release()
      setSelectedDriverId(orderClaims[0].driverId)
      setDriverFocusDriverOnly(false)
      setDriverFocusDate(focusDate)
      return
    }
    driverCard.release()
    setSelectedDriverId(null)
    const tile = document.querySelector(`[data-order-tile="${orderId}"]`)
    const anchor = tile?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, 120, 0, 0)
    setClaimPick({ orderId, anchor })
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-driver-id="${orderClaims[0].driverId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  /** 从选择框或司导区域点了某位抢单司导：打开他，日历跳到这张单还没派的第一天。 */
  function openClaimant(driverId: string, orderId: string) {
    const order = ordersRef.current.find((item) => item.id === orderId)
    const focusDate = order?.days.find((day) => !day.driverId)?.serviceDate ?? order?.startDate ?? today
    setClaimPick(null)
    if (selectedOrderIdRef.current !== orderId) {
      showOrder(orderId)
    }
    driverCard.release()
    setSelectedDriverId(driverId)
    setDriverFocusDriverOnly(false)
    setDriverFocusDate(focusDate)
  }

  function toggleDriver(driverId: string) {
    const next = selectedDriverId === driverId ? null : driverId
    const driverClaims = next ? claimsByDriver.get(next) : undefined
    if (next && driverClaims?.length && !assignDesk) {
      // 抢单司导：同时打开他抢的那张单（已经打开的是他抢的单就不换）。
      const current = driverClaims.find((claim) => claim.orderId === selectedOrderIdRef.current)
      openClaimant(next, (current ?? driverClaims[0]).orderId)
      return
    }
    if (!next) {
      driverScrollPending.current = null
      setSelectedDriverId(null)
    } else if (selectedOrderIdRef.current) {
      driverScrollPending.current = null
      setSelectedDriverId(next)
    } else {
      // 「未配车」时打开司导直接跳到他第一个还没配车的日期。
      const missingFirst = missingMode ? missingVehicles.byDriver.get(next)?.first : undefined
      queueDriverFocus(next, missingFirst ?? formatLocalDate(todayLocal()), false)
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

  function saveDriverNotes(): Promise<boolean> {
    if (driverNoteSaving.current) {
      return driverNoteSaving.current
    }
    const task = writeDriverNotes().finally(() => {
      driverNoteSaving.current = null
    })
    driverNoteSaving.current = task
    return task
  }

  async function writeDriverNotes() {
    const driver = selectedDriver ?? driversRef.current.find((item) => item.id === selectedDriverId)
    const notes = driverNotesRef.current
    if (!driver) {
      return false
    }
    if ((driver.notes ?? '') === notes) {
      return true
    }
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
      return true
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存备注失败')
      return false
    }
  }

  useEffect(() => {
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
  // 抢单待确认：订单日历标出被抢的（还没派的）日期；司导日历标出这位司导抢的那张单的日期。都用橙色。
  const openDates = (order: Order | undefined) => new Set((order?.days ?? []).filter((day) => !day.driverId).map((day) => day.serviceDate))
  const orderClaimDates = !assignDesk && selectedOrder && claimsByOrder.get(selectedOrder.id)?.length ? openDates(selectedOrder) : new Set<string>()
  const claimsOfSelectedDriver = !assignDesk && selectedDriverId ? (claimsByDriver.get(selectedDriverId) ?? []) : []
  const claimOfSelectedDriver =
    claimsOfSelectedDriver.find((claim) => claim.orderId === selectedOrderId) ?? (claimsOfSelectedDriver.length === 1 ? claimsOfSelectedDriver[0] : undefined)
  const driverClaimSource = claimOfSelectedDriver ? orders.find((order) => order.id === claimOfSelectedDriver.orderId) : undefined
  const orderMarks: CalendarMark[] = (selectedOrder?.days ?? []).map((day) => {
    const assigned = Boolean(day.driverId)
    const label = day.driverId
      ? (day.driverName ?? driverById.get(day.driverId)?.name)?.slice(0, 1)
      : '未派'
    const grab = !assigned && orderClaimDates.has(day.serviceDate)
    return {
      date: day.serviceDate,
      dayId: day.id,
      orderId: selectedOrder!.id,
      label: grab ? '抢单' : label,
      place: placeMark(day.endLocation),
      weather: day.weather,
      assigned,
      grab,
      color: assigned ? assignedColor : grab ? GRAB_FILL : '#FFF1B8',
      textColor: assigned ? contrastText(assignedColor) : '#d46b08',
      orderStart: selectedSpan?.start === day.serviceDate,
      orderEnd: selectedSpan?.end === day.serviceDate,
      owned: assignDesk ? undefined : !day.driverId || isOwnAssignment(day, user.id),
    }
  })

  // 改日期：预览新日期上的各天（原来的行程跟着平移；两头新增的是空白日；落到范围外的会删掉）。
  const reschedulePreview =
    reschedule.active && reschedule.preview && selectedOrder && reschedule.orderId === selectedOrder.id
      ? reschedulePreviewOf(selectedOrder, reschedule.preview, orderMarks)
      : null

  function startReschedule() {
    const order = selectedOrder
    if (!order) {
      return
    }
    const dates = order.days.map((day) => day.serviceDate).sort()
    const start = dates[0] ?? toDateOnly(order.startDate)
    const end = dates[dates.length - 1] ?? start
    setOrderInfoOpen(false)
    setSelectedOrderDayId(null)
    setArmedRemove(null)
    reschedule.open(order.id, start, end)
  }

  async function saveReschedule() {
    const order = selectedOrder
    const preview = reschedulePreview
    if (!order || !preview || busy || !reschedule.changed || reschedule.tooLong) {
      return
    }
    // 要删掉日子时，和删除一样：第一次点「保存」套红框，再点一次才保存。
    if (preview.removed > 0 && armedRemove !== 'dates') {
      setArmedRemove('dates')
      return
    }
    setArmedRemove(null)
    setBusy(true)
    try {
      if (await saveOrderDates(order.id, preview.plan)) {
        reschedule.close()
        await loadBoard()
      }
    } finally {
      setBusy(false)
    }
  }

  function rescheduleFooter() {
    const preview = reschedulePreview
    if (!preview) {
      return null
    }
    return (
      <RescheduleFooter
        preview={preview}
        tooLong={reschedule.tooLong}
        changed={reschedule.changed}
        onCancel={() => reschedule.close()}
        onReset={() => reschedule.reset()}
      />
    )
  }

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
              weather: day.weather,
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
              weather: day.weather,
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
  if (driverClaimSource) {
    // 抢的日期：已有行程的那天在原来的格子上加橙框（确认时会被拒），空的日期补一个只做标记的格子。
    for (const day of driverClaimSource.days.filter((item) => !item.driverId)) {
      const index = driverMarks.findIndex((mark) => mark.date === day.serviceDate)
      if (index >= 0) {
        driverMarks[index] = { ...driverMarks[index], grab: true }
      } else {
        driverMarks.push({
          date: day.serviceDate,
          dayId: day.id,
          orderId: driverClaimSource.id,
          label: '抢单',
          place: placeMark(day.endLocation),
          weather: day.weather,
          grab: true,
          inert: true,
          color: GRAB_FILL,
          textColor: '#d46b08',
        })
      }
    }
    driverMarks.sort((left, right) => left.date.localeCompare(right.date))
  }

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

  /** 多位司导抢当前打开的单：每位司导一种扑克牌图案，选择框和司导区域的图标用同一套。 */
  const selectedClaims = useMemo(
    () => (!assignDesk && selectedOrderId ? (claimsByOrder.get(selectedOrderId) ?? []) : []),
    [assignDesk, claimsByOrder, selectedOrderId],
  )
  const claimPatterns = useMemo(() => {
    const patterns = new Map<string, ConflictPattern>()
    if (selectedClaims.length < 2) {
      return patterns
    }
    const ids = selectedClaims.map((claim) => claim.driverId)
    for (const id of ids) {
      patterns.set(id, patternForOrder(ids, id))
    }
    return patterns
  }, [selectedClaims])
  const driverPatterns = useMemo(
    () => (claimPatterns.size ? new Map([...vehicleConflictDrivers, ...claimPatterns]) : vehicleConflictDrivers),
    [claimPatterns, vehicleConflictDrivers],
  )
  const claimantIds = useMemo(() => new Set(assignDesk ? [] : claimsByDriver.keys()), [assignDesk, claimsByDriver])

  async function confirmClaim(claim: OrderClaim) {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      const result = await grabApi.confirm(claim.orderId, claim.driverId)
      message.success(`已派给 ${claim.driverName}，共 ${result.dates.length} 天`)
      setClaimPick(null)
      await loadBoard()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '确认派单失败')
      await loadBoard()
    } finally {
      setBusy(false)
    }
  }

  // 订单卡片：确认给当前打开的抢单司导；只有一位抢时就是他；多位又没选时提示去选。
  const orderClaimTarget = selectedClaims.find((claim) => claim.driverId === selectedDriverId) ?? (selectedClaims.length === 1 ? selectedClaims[0] : undefined)
  const orderClaimAction = selectedClaims.length ? (
    orderClaimTarget ? (
      <ClaimConfirmBar text={`${orderClaimTarget.driverName} 抢单待确认`} busy={busy} onConfirm={() => void confirmClaim(orderClaimTarget)} />
    ) : (
      <ClaimConfirmBar text={`${selectedClaims.length} 位司导抢单，点订单图标或司导区域的扑克牌选择`} busy={busy} />
    )
  ) : null
  // 司导卡片：确认他抢的、当前打开的那张单；他只抢了一张时就是那张。
  const selectedDriverClaims = claimsOfSelectedDriver
  const driverClaimTarget = claimOfSelectedDriver
  const driverClaimOrder = driverClaimSource
  const driverClaimAction = selectedDriverClaims.length ? (
    driverClaimTarget ? (
      <ClaimConfirmBar
        text={`抢了 ${driverClaimOrder ? orderDisplayLabel(driverClaimOrder) || formatMonthDay(driverClaimOrder.startDate) : '订单'}，待确认`}
        busy={busy}
        onConfirm={() => void confirmClaim(driverClaimTarget)}
      />
    ) : (
      <ClaimConfirmBar text={`抢了 ${selectedDriverClaims.length} 张单，点订单区里标着抢单待确认的订单确认`} busy={busy} />
    )
  ) : null

  function renderOrderTile(order: Order, from: 'order' | 'driver' = 'order') {
    const byDriver = !assignDesk || from === 'driver'
    const assigned = byDriver ? order.assignedDayCount : hasDispatcherAssignment(order) ? order.dayCount : 0
    const split = byDriver ? order.isSplit : false
    const conflicted = conflictedIds.has(order.id)
    const focusPattern = conflictIds.includes(order.id) ? patternForOrder([...conflictedIds], order.id) : undefined
    const live = order.isInProgress
    const fullyAssigned = byDriver ? assigned > 0 && !hasUnassignedDays(order) : hasDispatcherAssignment(order)
    const orderClaims = assignDesk ? [] : (claimsByOrder.get(order.id) ?? [])
    // 放出去的单（公司内部、面向所有人）用虚线框：随时可能被抢。多位司导抢同一张单时右上角标红。
    const shared = order.shareLevel > 0 && (assignDesk ? !hasDispatcherAssignment(order) : hasUnassignedDays(order))
    const claimConflict = orderClaims.length > 1
    return (
      <button
        key={order.id}
        type="button"
        data-order-tile={order.id}
        className={`dispatcher-tile${drag?.id === order.id ? ' dragging' : ''}${assigned > 0 ? ' assigned' : ''}${split ? ' split' : ''}${conflicted || claimConflict ? ' conflict' : ''}${live ? ' live' : ''}${selectedOrderId === order.id ? ' open' : ''}${shared ? ' shared' : ''}${orderClaims.length ? ' claimed' : ''}`}
        style={
          focusPattern
            ? ({ ...conflictPatternStyle(focusPattern), ['--assigned-color']: assignedColor } as CSSProperties)
            : split || conflicted || claimConflict
              ? ({ ['--assigned-color']: assignedColor } as CSSProperties)
              : fullyAssigned
                ? { background: assignedColor, color: contrastText(assignedColor) }
                : undefined
        }
        onPointerDown={(event) =>
          beginPointer(event, { kind: 'order', id: order.id, from, x: event.clientX, y: event.clientY })
        }
      >
        <strong className="dispatcher-tile-label">{orderTileLabel(order)}</strong>
        <span>{formatMonthDay(order.startDate)}</span>
        <em>{from === 'driver' ? `${order.dayCount} 天` : orderStatus(order, byDriver)}</em>
        {orderClaims.length ? <em className="dispatcher-tile-claim">{orderClaims.length > 1 ? `${orderClaims.length} 人抢单待确认` : '抢单待确认'}</em> : null}
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
    <div className={`dispatcher-page${reschedulePreview ? ' rescheduling' : ''}`}>
      <header className="dispatcher-header">
        {cameFromRecords ? (
          <button
            type="button"
            className="dispatcher-back"
            aria-label="返回订单记录"
            title="返回订单记录"
            onClick={() => {
              markRecordsBack()
              const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
              if (index > 0) {
                navigate(-1)
              } else {
                navigate('/company')
              }
            }}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
        ) : null}
        <div className="dispatcher-header-title">
          <strong className="dispatcher-name">
            {assignDesk
              ? user.companies.find((item) => item.id === companyId)?.name || user.companyName || '公司'
              : user.name.trim() || '调度员'}
          </strong>
          <p>
            {assignDesk ? '派给调度' : '调度台'}
            {weatherSource ? (
              <>
                {' · '}
                <a className="dispatcher-weather-credit" href={weatherSource.url} target="_blank" rel="noreferrer">
                  天气数据：{weatherSource.name}
                </a>
              </>
            ) : null}
          </p>
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
        missingVehicleOrders={missingVehicles.orderCount}
        missingOnly={missingMode}
        onMissingToggle={() => setMissingOnly((current) => !current)}
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
            onCalendarScroll={syncDriverCalendarFromTop}
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
        aiOrder={aiOpen ? <AiOrderCard onMyDesk={!assignDesk} onClose={() => setAiOpen(false)} onCreated={(id) => void onAiOrderCreated(id)} /> : null}
        onToggleAi={aiEnabled ? toggleAiOrder : undefined}
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
          onBodyScroll: syncDriverCalendarFromTop,
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
                subtitle: reschedulePreview
                  ? rescheduleHint(reschedule.resizing)
                  : `${formatMonthDay(selectedOrder.startDate)} · ${selectedOrder.dayCount} 天 · ${assignDesk ? (selectedOrder.assignedDispatcherName || '未分配') : selectedOrder.assignedDayCount > 0 ? orderStatus(selectedOrder) : '未分配'}`,
                marks: reschedulePreview ? reschedulePreview.marks : orderMarks,
                rangeStart: reschedulePreview ? (earlierDate(orderRangeStart, reschedulePreview.plan.start) ?? orderRangeStart) : orderRangeStart,
                rangeEnd: reschedulePreview ? (laterDate(orderRangeEnd, reschedulePreview.plan.end) ?? orderRangeEnd) : orderRangeEnd,
                reschedule: reschedulePreview
                  ? {
                      from: reschedulePreview.plan.start,
                      to: reschedulePreview.plan.end,
                      footer: rescheduleFooter(),
                      save: (
                        <RescheduleSaveButton
                          tooLong={reschedule.tooLong}
                          changed={reschedule.changed}
                          busy={busy}
                          armed={armedRemove === 'dates'}
                          onSave={() => void saveReschedule()}
                        />
                      ),
                      press: reschedule.press,
                      hold: reschedule.hold,
                      enter: reschedule.enter,
                    }
                  : null,
                onStartReschedule: selectedOrder.canReschedule ? startReschedule : undefined,
                bodyRef: orderCalBodyRef,
                onBodyScroll: syncDriverCalendarFromTop,
                infoOpen: orderInfoOpen,
                onInfoOpenChange: (open) => {
                  setOrderInfoOpen(open)
                  if (open) {
                    setSelectedOrderDayId(null)
                  }
                },
                draft: orderDraft,
                action: orderClaimAction,
                onShareLevelChange: selectedOrder.canSetShareLevel
                  ? (level) => {
                      void ordersApi.setShareLevel(selectedOrder.id, level).then(
                        () => loadBoard(),
                        (error: unknown) => message.error(error instanceof Error ? error.message : '修改抢单范围失败'),
                      )
                    }
                  : undefined,
                removeLabel: !assignDesk && selectedOrder.companyId ? '退回公司' : '删除订单',
                onRemove: () => void deleteSelectedOrder(),
                removeArmed: orderRemoveArmed,
                ink: calendarInk,
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
        drop={Boolean(hoverDriverId && selectedDriverId && hoverDriverId === selectedDriverId && drag && drag.kind !== 'driver' && drag.from !== 'driver')}
        drivers={paneDrivers}
        missingDays={missingMode ? missingVehicles.byDriver : undefined}
        hiddenDrivers={hiddenDrivers}
        pinnedIds={layout.pinnedIds}
        selectedDriverId={selectedDriverId}
        hoverDriverId={hoverDriverId}
        drag={drag}
        conflictPatterns={driverPatterns}
        claimantIds={claimantIds}
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
              onNotesSave={saveDriverNotes}
              onClose={() => setSelectedDriverId(null)}
              onHide={() => requestHide(selectedDriver.id)}
              hideArmed={armedRemove === `hide:${selectedDriver.id}`}
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
              onBodyScroll={syncTopCalendarFromDriver}
              notes={driverNotes}
              onNotesChange={changeDriverNotes}
              onNotesSave={saveDriverNotes}
              onClose={() => {
                setConflictPick(null)
                setSelectedDriverId(null)
              }}
              onHide={() => requestHide(selectedDriver.id)}
              hideArmed={armedRemove === `hide:${selectedDriver.id}`}
              onCardPointerDown={driverCard.begin}
              onDayClick={openDriverCalendarDay}
              ink={calendarInk}
              dragConflict={orderPane === 'vehicles'}
              action={driverClaimAction}
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

      {claimPick && (claimsByOrder.get(claimPick.orderId)?.length ?? 0) > 1 ? (
        <ClaimPickPopover
          anchor={claimPick.anchor}
          claims={claimsByOrder.get(claimPick.orderId) ?? []}
          patterns={claimPatterns}
          onPick={(driverId) => openClaimant(driverId, claimPick.orderId)}
          onClose={() => setClaimPick(null)}
        />
      ) : null}
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
            ? orderTileLabel(draggingOrder)
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

