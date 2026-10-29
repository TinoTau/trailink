import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePageLoad } from '../../usePageLoad'
import { message } from 'antd'
import { useAuthenticatedAuth } from '../../auth/authState'
import { AccountMenu } from '../AccountMenu'
import { clearDayDriver, createOrderWithDays, ordersApi } from '../../api/orders'
import { PRESET_COLORS, contrastText, driverCalendarFill, readDriverCalendarColors, writeDriverCalendarColors, type DriverCalendarColors } from '../../calendarUi'
import {
  WEEKDAYS,
  addMonths,
  formatLocalDate,
  formatMonthDay,
  monthCells,
  monthKey,
  orderedRange,
  parseYmd,
  todayLocal,
  toDateOnly,
} from '../../localDate'
import {
  CALENDAR_DATE_ATTR,
  CALENDAR_HOLD_MS,
  CalendarDayCaption,
  type CalendarHold,
  calendarDateFromDrag,
  calendarHoldShifted,
  captureCalendarPointer,
  pointFromDragEvent,
} from '../../calendarDay'
import { conflictDateChoices, ConflictDatePopover } from '../../ConflictDatePopover'
import { dateOrderEdges, driverAssignerCaption, orderDisplayLabel, CONFLICT_RED } from '../../orderFlags'
import { placeMark } from '../../placeMark'
import type { DriverCalendarDay, DriverCalendarTrip, Order } from '../../types'
import { CalendarInkBar, useCalendarInk } from '../../calendarInk'
import { DriverDayEditor } from './DriverDayEditor'
import './driver-calendar.css'

const CALENDAR_MONTH_SPAN = 6

function monthsAroundDate(dateText: string, today: Date) {
  const earliest = monthKey(addMonths(today, -CALENDAR_MONTH_SPAN))
  const latest = monthKey(addMonths(today, CALENDAR_MONTH_SPAN))
  let center = addMonths(parseYmd(dateText), 0)
  if (monthKey(center) < earliest) {
    center = addMonths(today, -CALENDAR_MONTH_SPAN)
  } else if (monthKey(center) > latest) {
    center = addMonths(today, CALENDAR_MONTH_SPAN)
  }
  return [-2, -1, 0, 1, 2]
    .map((offset) => addMonths(center, offset))
    .filter((month) => {
      const key = monthKey(month)
      return key >= earliest && key <= latest
    })
}

function firstOrderDate(order: Order) {
  const dates = order.days.map((day) => day.serviceDate).sort()
  return dates[0] || toDateOnly(order.startDate)
}

function ordersByStart(orders: Order[]) {
  return [...orders].sort(
    (left, right) => firstOrderDate(left).localeCompare(firstOrderDate(right)) || left.id.localeCompare(right.id),
  )
}

function daysByDriver(orders: Order[], driverId: string | null): Record<string, DriverCalendarDay> {
  if (!driverId) {
    return {}
  }
  const next: Record<string, DriverCalendarDay> = {}
  for (const order of orders) {
    for (const day of order.days) {
      if (day.driverId !== driverId) {
        continue
      }
      const bucket = next[day.serviceDate] ?? { date: day.serviceDate, items: [] }
      const assignerName = driverAssignerCaption(order, day)
      bucket.items.push({
        orderId: order.id,
        label: orderDisplayLabel(order),
        itineraryDayId: day.id,
        endLocation: day.endLocation,
      })
      if (!bucket.assignerName) {
        bucket.assignerName = assignerName
      }
      next[day.serviceDate] = bucket
    }
  }
  return next
}

export function DriverCalendarPage() {
  const { user } = useAuthenticatedAuth()
  const ink = useCalendarInk()
  const driverId = user.driverId
  const today = useMemo(() => todayLocal(), [])
  const todayKey = formatLocalDate(today)
  const earliestMonth = monthKey(addMonths(today, -CALENDAR_MONTH_SPAN))
  const latestMonth = monthKey(addMonths(today, CALENDAR_MONTH_SPAN))
  const [months, setMonths] = useState(() => [-2, -1, 0, 1, 2].map((offset) => addMonths(today, offset)))
  const [orders, setOrders] = useState<Order[]>([])
  const [colors, setColors] = useState<DriverCalendarColors>(readDriverCalendarColors)
  const [colorTarget, setColorTarget] = useState<'past' | 'upcoming' | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [conflictPick, setConflictPick] = useState<{ date: string; anchor: DOMRect } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [armedRelease, setArmedRelease] = useState<{ date: string; orderId: string } | null>(null)
  const [pendingCancelTrips, setPendingCancelTrips] = useState<DriverCalendarTrip[]>([])
  const [orderNo, setOrderNo] = useState('')
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const expandingRef = useRef(false)
  const didScrollToToday = useRef(false)
  const pendingRevealDate = useRef<string | null>(null)
  const rangeDragging = useRef(false)
  const rangeHoldRef = useRef<CalendarHold | null>(null)
  const unbindLock = useRef(false)

  const daysByDate = useMemo(() => daysByDriver(orders, driverId), [orders, driverId])
  const visibleSelectedDate = selectedDate && daysByDate[selectedDate] ? selectedDate : null
  const selectedDay = visibleSelectedDate ? daysByDate[visibleSelectedDate] : undefined
  const [detailBelow, setDetailBelow] = useState(false)
  const [detailHintBox, setDetailHintBox] = useState<{ left: number; top: number } | null>(null)
  const [rangeFrom, rangeTo] = rangeStart ? orderedRange(rangeStart, rangeEnd) : [null, null]
  const addingTrip = menuOpen && !canceling

  async function loadBoard() {
    try {
      setOrders(await ordersApi.list())
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载行程失败')
    }
  }

  usePageLoad(loadBoard)

  useEffect(() => {
    const revealDate = pendingRevealDate.current
    if (revealDate) {
      const timer = window.setTimeout(() => {
        document.getElementById(`driver-day-${revealDate}`)?.scrollIntoView({ block: 'center' })
        pendingRevealDate.current = null
        didScrollToToday.current = true
      }, 80)
      return () => window.clearTimeout(timer)
    }
    if (didScrollToToday.current) {
      return
    }
    const timer = window.setTimeout(() => {
      document.getElementById(`driver-day-${todayKey}`)?.scrollIntoView({ block: 'center' })
      didScrollToToday.current = true
    }, 80)
    return () => window.clearTimeout(timer)
  }, [todayKey, months, orders, selectedDate])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) {
      return
    }
    let frame = 0
    function check() {
      const scroller = scrollRef.current
      const card = scroller?.querySelector<HTMLElement>('.driver-detail-card')
      const day = visibleSelectedDate ? document.getElementById(`driver-day-${visibleSelectedDate}`) : null
      if (!visibleSelectedDate || !scroller || !card || !day) {
        setDetailBelow(false)
        setDetailHintBox(null)
        return
      }
      const rootRect = scroller.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      const below = cardRect.top > rootRect.bottom - 48
      if (!below) {
        setDetailBelow(false)
        setDetailHintBox(null)
        return
      }
      const dayRect = day.getBoundingClientRect()
      const width = 76
      const height = 32
      let top = dayRect.bottom + 6
      if (top + height > rootRect.bottom - 8) {
        top = rootRect.bottom - height - 8
      }
      let left = dayRect.left + dayRect.width / 2 - width / 2
      left = Math.min(Math.max(left, rootRect.left + 8), rootRect.right - width - 8)
      const next = { left: Math.round(left), top: Math.round(top) }
      setDetailBelow(true)
      setDetailHintBox((current) => (current?.left === next.left && current.top === next.top ? current : next))
    }
    function schedule() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(check)
    }
    schedule()
    root.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      root.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [visibleSelectedDate, orders, months])

  useEffect(() => {
    function cancelHold() {
      const hold = rangeHoldRef.current
      if (!hold) {
        return
      }
      window.clearTimeout(hold.timer)
      rangeHoldRef.current = null
    }
    function onMove(event: PointerEvent | TouchEvent) {
      const hold = rangeHoldRef.current
      const point = pointFromDragEvent(event)
      if (hold && point && calendarHoldShifted(hold, point.x, point.y)) {
        cancelHold()
        return
      }
      if (!rangeDragging.current) {
        return
      }
      const date = calendarDateFromDrag(event, true)
      if (date) {
        setRangeEnd((current) => (current === date ? current : date))
      }
    }
    function finishHold(event: PointerEvent | TouchEvent, selectIfTap: boolean) {
      const hold = rangeHoldRef.current
      if (hold) {
        const point = pointFromDragEvent(event)
        const shifted = point ? calendarHoldShifted(hold, point.x, point.y) : false
        cancelHold()
        if (selectIfTap && !shifted) {
          setRangeStart(hold.date)
          setRangeEnd(hold.date)
          setSelectedDate(null)
        }
      }
      rangeDragging.current = false
    }
    function onFinish(event: PointerEvent | TouchEvent) {
      finishHold(event, true)
    }
    function onCancel(event: PointerEvent | TouchEvent) {
      finishHold(event, false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('pointerup', onFinish)
    window.addEventListener('touchend', onFinish)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchcancel', onCancel)
    return () => {
      cancelHold()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('pointerup', onFinish)
      window.removeEventListener('touchend', onFinish)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [])

  function persistColors(next: DriverCalendarColors) {
    setColors(next)
    writeDriverCalendarColors(next)
  }

  function prependMonth() {
    if (expandingRef.current || months.length === 0 || monthKey(months[0]) <= earliestMonth) {
      return
    }
    expandingRef.current = true
    const scroller = scrollRef.current
    const previousHeight = scroller?.scrollHeight ?? 0
    setMonths((current) => {
      const next = addMonths(current[0], -1)
      if (monthKey(next) < earliestMonth) {
        return current
      }
      return [next, ...current]
    })
    requestAnimationFrame(() => {
      if (scroller) {
        scroller.scrollTop += scroller.scrollHeight - previousHeight
      }
      expandingRef.current = false
    })
  }

  function appendMonth() {
    if (expandingRef.current || months.length === 0 || monthKey(months[months.length - 1]) >= latestMonth) {
      return
    }
    expandingRef.current = true
    setMonths((current) => {
      const next = addMonths(current[current.length - 1], 1)
      if (monthKey(next) > latestMonth) {
        return current
      }
      return [...current, next]
    })
    requestAnimationFrame(() => {
      expandingRef.current = false
    })
  }

  function revealOpenDetail() {
    const root = scrollRef.current
    const card = root?.querySelector<HTMLElement>('.driver-detail-card')
    if (!root || !card) {
      return
    }
    const top = card.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
    root.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' })
  }

  function onScroll() {
    const scroller = scrollRef.current
    if (!scroller || expandingRef.current) {
      return
    }

    if (scroller.scrollTop < 80) {
      prependMonth()
    } else if (scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 80) {
      appendMonth()
    }
  }

  function tripFill(dateText: string) {
    return driverCalendarFill(dateText, todayKey, colors)
  }

  function clearRangeHold() {
    const hold = rangeHoldRef.current
    if (!hold) {
      return
    }
    window.clearTimeout(hold.timer)
    rangeHoldRef.current = null
  }

  function beginTouchHold(dateText: string, x: number, y: number, target: HTMLElement, pointerId: number) {
    const existing = rangeHoldRef.current
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
      date: dateText,
      target,
      timer: window.setTimeout(() => {
        if (rangeHoldRef.current !== hold) {
          return
        }
        rangeHoldRef.current = null
        rangeDragging.current = true
        setRangeStart(hold.date)
        setRangeEnd(hold.date)
        setSelectedDate(null)
        if (hold.pointerId >= 0) {
          captureCalendarPointer(hold.target, hold.pointerId)
        }
      }, CALENDAR_HOLD_MS),
    }
    rangeHoldRef.current = hold
  }

  function resetMenu() {
    clearRangeHold()
    rangeDragging.current = false
    setMenuOpen(false)
    setCanceling(false)
    setArmedRelease(null)
    setPendingCancelTrips([])
    setRangeStart(null)
    setRangeEnd(null)
    setOrderNo('')
  }

  function uniqueTrips(items: DriverCalendarTrip[]) {
    const seen = new Set<string>()
    return items.filter((item) => {
      if (seen.has(item.orderId)) {
        return false
      }
      seen.add(item.orderId)
      return true
    })
  }

  function openDay(dateText: string) {
    if (!daysByDate[dateText] || selectedDate === dateText) {
      setSelectedDate(null)
      return
    }
    setSelectedDate(dateText)
  }

  function onDayPointerDown(dateText: string) {
    if (unbindLock.current || !addingTrip) {
      return
    }
    rangeDragging.current = true
    setRangeStart(dateText)
    setRangeEnd(dateText)
    setSelectedDate(null)
  }

  function onDayClick(dateText: string) {
    if (unbindLock.current) {
      return
    }
    if (armedRelease?.date === dateText) {
      void releaseArmedDay()
      return
    }
    if (armedRelease) {
      setArmedRelease(null)
    }
    if (canceling) {
      void pickDayToCancel(dateText)
      return
    }
    if (addingTrip) {
      return
    }
    if ((daysByDate[dateText]?.items.length ?? 0) > 1) {
      const anchor = document.getElementById(`driver-day-${dateText}`)?.getBoundingClientRect()
      if (anchor) {
        setSelectedDate(null)
        setConflictPick({ date: dateText, anchor })
      }
      return
    }
    setConflictPick(null)
    openDay(dateText)
  }

  async function clearAssignedDays(
    orderId: string,
    days: Array<{ id: string; serviceDate: string; description?: string | null; endLocation?: string | null }>,
  ) {
    for (const day of days) {
      await ordersApi.updateDay(orderId, day.id, clearDayDriver(day))
    }
  }

  async function releaseConflictDay(orderId: string, dayId: string) {
    if (unbindLock.current || !driverId) {
      return
    }
    const order = orders.find((item) => item.id === orderId)
    const day = order?.days.find((item) => item.id === dayId && item.driverId === driverId)
    if (!order || !day) {
      message.warning('这一天没有可解除的行程')
      return
    }
    unbindLock.current = true
    setBusy(true)
    try {
      await clearAssignedDays(order.id, [day])
      message.success('已取消该日拆单')
      setConflictPick(null)
      await loadBoard()
      setSelectedDate(null)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '解除行程失败')
    } finally {
      unbindLock.current = false
      setBusy(false)
    }
  }

  function onDayPointerEnter(dateText: string) {
    if (addingTrip && rangeDragging.current) {
      setRangeEnd(dateText)
    }
  }

  async function claimOrder() {
    const value = orderNo.trim()
    if (!value) {
      message.warning('请输入订单号')
      return
    }
    if (!driverId) {
      message.warning('还没有司机身份')
      return
    }
    setBusy(true)
    try {
      const matched = await ordersApi.list({ orderNo: value })
      const order = matched[0]
      if (!order) {
        message.error('找不到该订单号')
        return
      }
      const result = await ordersApi.assignDriver(order.id, driverId)
      if (result.warnings.length > 0) {
        message.warning(result.warnings.join('；'))
      } else {
        const label = orderDisplayLabel(order)
        message.success(label ? `已领取 ${label}，共 ${result.updatedDayCount} 天` : `已领取，共 ${result.updatedDayCount} 天`)
      }
      const focusDate = firstOrderDate(order)
      resetMenu()
      await loadBoard()
      const focusMonth = monthKey(addMonths(parseYmd(focusDate), 0))
      setMonths(monthsAroundDate(focusDate, today))
      if (focusMonth >= earliestMonth && focusMonth <= latestMonth) {
        pendingRevealDate.current = focusDate
        setSelectedDate(focusDate)
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '领取行程失败')
    } finally {
      setBusy(false)
    }
  }

  async function createRange() {
    if (!rangeFrom || !rangeTo) {
      message.warning('请先在日历上选择起止日期')
      return
    }
    if (!driverId) {
      message.warning('还没有司机身份')
      return
    }
    setBusy(true)
    try {
      const created = await createOrderWithDays({
        startDate: rangeFrom,
        endDate: rangeTo,
        driverId,
      })
      if (created.warnings.length > 0) {
        message.warning(created.warnings.join('；'))
      } else {
        message.success(`已添加 ${created.dates.length} 天行程`)
      }
      resetMenu()
      await loadBoard()
      setSelectedDate(rangeFrom)
    } catch (error) {
      if (error instanceof RangeError) {
        message.warning(error.message)
        return
      }
      message.error(error instanceof Error ? error.message : '添加行程失败')
    } finally {
      setBusy(false)
    }
  }

  async function unbindOrder(orderId: string, orderLabel: string) {
    if (unbindLock.current || !driverId) {
      return
    }
    const order = orders.find((item) => item.id === orderId)
    const days = order?.days.filter((day) => day.driverId === driverId) ?? []
    if (!order || days.length === 0) {
      message.warning('当前司导没有可取消的日期')
      return
    }
    unbindLock.current = true
    setBusy(true)
    try {
      await clearAssignedDays(orderId, days)
      message.success(`已取消 ${orderLabel} 中当前司导的 ${days.length} 天`)
      resetMenu()
      await loadBoard()
      setSelectedDate(null)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '取消行程失败')
    } finally {
      unbindLock.current = false
      setBusy(false)
    }
  }

  async function releaseArmedDay() {
    const armed = armedRelease
    if (unbindLock.current || !driverId || !armed) {
      return
    }
    const order = orders.find((item) => item.id === armed.orderId)
    const days = order?.days.filter((day) => day.driverId === driverId && day.serviceDate === armed.date) ?? []
    if (!order || days.length === 0) {
      message.warning('这一天没有可解除的行程')
      setArmedRelease(null)
      return
    }
    unbindLock.current = true
    setBusy(true)
    try {
      await clearAssignedDays(order.id, days)
      message.success('已解除这一天')
      setArmedRelease(null)
      await loadBoard()
      setSelectedDate(null)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '解除行程失败')
    } finally {
      unbindLock.current = false
      setBusy(false)
    }
  }

  function armDayRelease(date: string, orderId: string) {
    if (unbindLock.current) {
      return
    }
    setCanceling(false)
    setPendingCancelTrips([])
    setArmedRelease((current) =>
      current?.date === date && current.orderId === orderId ? null : { date, orderId },
    )
  }

  async function pickDayToCancel(dateText: string) {
    if (unbindLock.current) {
      return
    }
    const day = daysByDate[dateText]
    if (!day || day.items.length === 0) {
      message.warning('请点击已有行程的日期')
      return
    }

    const trips = uniqueTrips(day.items)
    setSelectedDate(null)
    if (trips.length === 1) {
      setPendingCancelTrips([])
      await unbindOrder(trips[0].orderId, trips[0].label)
      return
    }

    setPendingCancelTrips(trips)
  }

  return (
    <div className="driver-calendar-page" style={ink.style}>
      <header className="driver-calendar-header">
        <div>
          <h1>我的行程</h1>
          <p>{user?.name || '与调度台同一套行程日'}</p>
        </div>
        <div className="driver-header-actions">
          <AccountMenu />
        <button
          type="button"
          className={`driver-add-button${menuOpen ? ' active' : ''}`}
          disabled={busy}
          onClick={() => {
            if (unbindLock.current) {
              return
            }
            if (menuOpen) {
              resetMenu()
              return
            }
            setMenuOpen(true)
            setCanceling(false)
            setArmedRelease(null)
            setPendingCancelTrips([])
            setRangeStart(null)
            setRangeEnd(null)
            setSelectedDate(null)
          }}
        >
          行程管理
        </button>
        </div>
      </header>
      {menuOpen ? (
        <section className="driver-add-panel">
          <label className="driver-edit-field">
            订单号
            <input
              value={orderNo}
              placeholder="公司订单号"
              onChange={(event) => setOrderNo(event.target.value)}
            />
          </label>
          <div className="driver-add-actions">
            <button type="button" className="driver-primary-button" disabled={busy} onClick={() => void claimOrder()}>
              领取订单
            </button>
            <button
              type="button"
              className={`driver-ghost-button${canceling ? ' danger' : ''}`}
              disabled={busy}
              onClick={() => {
                if (unbindLock.current) {
                  return
                }
                setCanceling((current) => !current)
                setArmedRelease(null)
                setPendingCancelTrips([])
                setRangeStart(null)
                setRangeEnd(null)
                setSelectedDate(null)
              }}
            >
              取消行程
            </button>
          </div>
          <p className="driver-add-hint">
            {canceling
              ? `点击日历上已有行程的某一天，只取消${user?.name ? `「${user.name}」` : '当前司导'}在该单上的日期，其他司导不受影响。`
              : '不知道订单号时，触屏按住不动约 0.5 秒再拖选起止日期，鼠标按下即拖。点一下只选当天，短滑仍是滚动。'}
          </p>
          {canceling ? null : (
            <button
              type="button"
              className="driver-primary-button"
              disabled={busy || !rangeFrom || !rangeTo}
              style={{ visibility: rangeFrom && rangeTo ? 'visible' : 'hidden' }}
              onClick={() => void createRange()}
            >
              {rangeFrom && rangeTo
                ? `添加 ${formatMonthDay(rangeFrom)}${rangeFrom !== rangeTo ? `–${formatMonthDay(rangeTo)}` : ''} 仅日期`
                : '添加 仅日期'}
            </button>
          )}
          {pendingCancelTrips.length > 0 ? (
            <div className="driver-cancel-orders">
              <p className="driver-add-hint">当天有多笔订单，请选择要取消的订单：</p>
              {pendingCancelTrips.map((trip) => (
                <button
                  key={trip.orderId}
                  type="button"
                  className="driver-ghost-button"
                  disabled={busy}
                  onClick={() => void unbindOrder(trip.orderId, trip.label)}
                >
                  {trip.label || '未命名订单'}
                  {trip.endLocation ? ` · ${trip.endLocation}` : ''}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {conflictPick && driverId ? (
        <ConflictDatePopover
          anchor={conflictPick.anchor}
          choices={conflictDateChoices(
            ordersByStart(orders),
            driverId,
            conflictPick.date,
            [],
            (order, day) => ({
              label: driverAssignerCaption(order, day) ?? '',
              showText: true,
            }),
            { patterns: false },
          )}
          onChoose={(choice) => void releaseConflictDay(choice.orderId, choice.dayId)}
          onClose={() => setConflictPick(null)}
        />
      ) : null}
      <div className="driver-calendar-stage calendar-ink-host">
      <div className="driver-calendar-scroll" ref={scrollRef} onScroll={onScroll}>
        {months.map((month) => (
          <MonthSection
            key={monthKey(month)}
            month={month}
            todayKey={todayKey}
            selectedDate={visibleSelectedDate}
            daysByDate={daysByDate}
            orders={orders}
            tripFill={tripFill}
            addingTrip={addingTrip}
            canceling={canceling}
            releaseDate={armedRelease?.date ?? null}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            onDayPointerDown={onDayPointerDown}
            onDayPointerEnter={onDayPointerEnter}
            onDayClick={onDayClick}
            onTouchHold={beginTouchHold}
          >
            {selectedDay && visibleSelectedDate && visibleSelectedDate.startsWith(monthKey(month)) ? (
              <DriverDayEditor
                key={visibleSelectedDate}
                day={selectedDay}
                showOrderInfo
                armedOrderId={armedRelease?.date === visibleSelectedDate ? armedRelease.orderId : null}
                onArmDayRelease={(orderId) => armDayRelease(visibleSelectedDate, orderId)}
                onChanged={loadBoard}
              />
            ) : null}
          </MonthSection>
        ))}
      </div>
      <CalendarInkBar balance={ink.balance} side={ink.side} onChange={ink.setBalance} onSideChange={ink.setSide} />
      </div>
      {detailBelow && detailHintBox ? (
        <button
          type="button"
          className="driver-detail-hint"
          style={{ left: detailHintBox.left, top: detailHintBox.top }}
          aria-label="订单详情在下方"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={revealOpenDetail}
        >
          <DetailBelowIcon />
          详情
        </button>
      ) : null}
      {colorTarget && (
        <div className="driver-swatches">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`driver-swatch${colors[colorTarget] === color ? ' selected' : ''}`}
              style={{ background: color }}
              aria-label={color}
              onClick={() => persistColors({ ...colors, [colorTarget]: color })}
            />
          ))}
        </div>
      )}
      <section className="driver-calendar-colors">
        <div className="driver-color-actions">
          <button
            type="button"
            className="driver-color-chip"
            onClick={() => setColorTarget((current) => (current === 'past' ? null : 'past'))}
          >
            <i style={{ background: colors.past }} />
            已完成
          </button>
          <button
            type="button"
            className="driver-color-chip"
            onClick={() => setColorTarget((current) => (current === 'upcoming' ? null : 'upcoming'))}
          >
            <i style={{ background: colors.upcoming }} />
            未完成
          </button>
        </div>
      </section>
    </div>
  )
}

function DetailBelowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function MonthSection({
  month,
  todayKey,
  selectedDate,
  daysByDate,
  orders,
  tripFill,
  addingTrip,
  canceling,
  releaseDate,
  rangeFrom,
  rangeTo,
  onDayPointerDown,
  onDayPointerEnter,
  onDayClick,
  onTouchHold,
  children,
}: {
  month: Date
  todayKey: string
  selectedDate: string | null
  daysByDate: Record<string, DriverCalendarDay>
  orders: Order[]
  tripFill: (dateText: string) => string
  addingTrip: boolean
  canceling: boolean
  releaseDate: string | null
  rangeFrom: string | null
  rangeTo: string | null
  onDayPointerDown: (dateText: string) => void
  onDayPointerEnter: (dateText: string) => void
  onDayClick: (dateText: string) => void
  onTouchHold: (dateText: string, x: number, y: number, target: HTMLElement, pointerId: number) => void
  children?: ReactNode
}) {
  const cells = monthCells(month)

  return (
    <section className="driver-month">
      <div className="driver-month-heading">
        <h2 className="driver-month-title">
          {month.getFullYear()}年{month.getMonth() + 1}月
        </h2>
      </div>
      <div className="driver-weekdays">
        {WEEKDAYS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className={`driver-month-grid${addingTrip ? ' selecting' : ''}${canceling ? ' canceling' : ''}`}>
        {cells.map((cell) => {
          const dateText = formatLocalDate(cell.date)
          const hasTrip = Boolean(daysByDate[dateText])
          const conflict = (daysByDate[dateText]?.items.length ?? 0) > 1
          const fill = conflict ? CONFLICT_RED : hasTrip ? tripFill(dateText) : undefined
          const edges = cell.inMonth && hasTrip
            ? dateOrderEdges(orders, dateText, daysByDate[dateText].items.map((item) => item.orderId))
            : { start: false, end: false }
          const selected = selectedDate === dateText
          const inRange = Boolean(rangeFrom && rangeTo && dateText >= rangeFrom && dateText <= rangeTo)
          const rangeEdge = dateText === rangeFrom || dateText === rangeTo
          return (
            <button
              key={`${monthKey(month)}-${dateText}-${cell.inMonth ? 'in' : 'out'}`}
              type="button"
              id={cell.inMonth ? `driver-day-${dateText}` : undefined}
              className={[
                'calendar-day',
                'driver-day',
                cell.inMonth ? '' : 'outside',
                hasTrip ? 'has-trip' : '',
                conflict ? 'conflict' : '',
                edges.start ? 'order-start' : '',
                edges.end ? 'order-end' : '',
                selected ? 'selected' : '',
                releaseDate === dateText ? 'release' : '',
                inRange ? 'in-range' : '',
                rangeEdge ? 'range-edge' : '',
                dateText === todayKey && cell.inMonth ? 'today' : '',
              ].join(' ')}
              aria-label={
                releaseDate === dateText
                  ? `再点一次解除 ${dateText}`
                  : canceling
                    ? hasTrip
                      ? `取消 ${dateText} 当前司导的绑定`
                      : dateText
                    : undefined
              }
              style={
                fill
                  ? {
                      background: fill,
                      color: contrastText(fill),
                      ...(edges.start || edges.end ? { '--order-fill': fill } : {}),
                    }
                  : undefined
              }
              {...(cell.inMonth ? { [CALENDAR_DATE_ATTR]: dateText } : {})}
              onPointerDown={(event) => {
                if (!cell.inMonth) {
                  return
                }
                if (addingTrip && event.pointerType === 'touch') {
                  onTouchHold(dateText, event.clientX, event.clientY, event.currentTarget, event.pointerId)
                  return
                }
                if (addingTrip) {
                  event.preventDefault()
                  captureCalendarPointer(event.currentTarget, event.pointerId)
                }
                onDayPointerDown(dateText)
              }}
              onTouchStart={(event) => {
                if (!cell.inMonth || !addingTrip) {
                  return
                }
                const touch = event.touches[0]
                if (!touch) {
                  return
                }
                onTouchHold(dateText, touch.clientX, touch.clientY, event.currentTarget, -1)
              }}
              onContextMenu={(event) => {
                if (addingTrip) {
                  event.preventDefault()
                }
              }}
              onPointerEnter={() => {
                if (cell.inMonth) {
                  onDayPointerEnter(dateText)
                }
              }}
              onClick={() => {
                if (cell.inMonth) {
                  onDayClick(dateText)
                }
              }}
            >
              {cell.inMonth ? (
                hasTrip ? (
                  <CalendarDayCaption
                    day={cell.date.getDate()}
                    label={daysByDate[dateText].assignerName}
                    place={placeMark(daysByDate[dateText].items.find((item) => item.endLocation)?.endLocation)}
                  />
                ) : (
                  <b>{cell.date.getDate()}</b>
                )
              ) : (
                ''
              )}
            </button>
          )
        })}
      </div>
      {children}
    </section>
  )
}
