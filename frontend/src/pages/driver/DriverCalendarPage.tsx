import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { message } from 'antd'
import { useAuth } from '../../auth/AuthContext'
import { AccountMenu } from '../AccountMenu'
import { createOrderWithDays, ordersApi } from '../../api/orders'
import { PRESET_COLORS, contrastText } from '../../calendarUi'
import {
  WEEKDAYS,
  addMonths,
  formatLocalDate,
  formatMonthDay,
  monthCells,
  monthKey,
  orderedRange,
  todayLocal,
} from '../../localDate'
import type { DriverCalendarDay, DriverCalendarTrip, Order } from '../../types'
import { DriverDayEditor } from './DriverDayEditor'
import './driver-calendar.css'

const COLOR_STORAGE_KEY = 'trailink.driverCalendar.colors.v2'

interface CalendarColors {
  past: string
  upcoming: string
}

const DEFAULT_COLORS: CalendarColors = {
  past: '#C6F0E0',
  upcoming: '#D6E4FF',
}

function readColors(): CalendarColors {
  try {
    const raw = localStorage.getItem(COLOR_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_COLORS
    }
    const parsed = JSON.parse(raw) as CalendarColors
    return {
      past: parsed.past || DEFAULT_COLORS.past,
      upcoming: parsed.upcoming || DEFAULT_COLORS.upcoming,
    }
  } catch {
    return DEFAULT_COLORS
  }
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
      bucket.items.push({
        orderId: order.id,
        orderNo: order.orderNo,
        itineraryDayId: day.id,
        endLocation: day.endLocation,
        description: day.description,
        activities: [],
      })
      next[day.serviceDate] = bucket
    }
  }
  return next
}

export function DriverCalendarPage() {
  const { user } = useAuth()
  const driverId = user?.driverId ?? null
  const today = useMemo(() => todayLocal(), [])
  const todayKey = formatLocalDate(today)
  const [months, setMonths] = useState(() => [-2, -1, 0, 1, 2].map((offset) => addMonths(today, offset)))
  const [orders, setOrders] = useState<Order[]>([])
  const [colors, setColors] = useState<CalendarColors>(readColors)
  const [colorTarget, setColorTarget] = useState<'past' | 'upcoming' | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [pendingCancelTrips, setPendingCancelTrips] = useState<DriverCalendarTrip[]>([])
  const [orderNo, setOrderNo] = useState('')
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const expandingRef = useRef(false)
  const didScrollToToday = useRef(false)
  const rangeDragging = useRef(false)
  const unbindLock = useRef(false)

  const daysByDate = useMemo(() => daysByDriver(orders, driverId), [orders, driverId])
  const selectedDay = selectedDate ? daysByDate[selectedDate] : undefined
  const [rangeFrom, rangeTo] = rangeStart ? orderedRange(rangeStart, rangeEnd) : [null, null]
  const addingTrip = menuOpen && !canceling

  async function loadBoard() {
    try {
      setOrders(await ordersApi.list())
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载行程失败')
    }
  }

  useEffect(() => {
    void loadBoard()
  }, [])

  useEffect(() => {
    if (selectedDate && !daysByDate[selectedDate]) {
      setSelectedDate(null)
    }
  }, [daysByDate, selectedDate])

  useEffect(() => {
    if (didScrollToToday.current) {
      return
    }
    const timer = window.setTimeout(() => {
      document.getElementById(`driver-day-${todayKey}`)?.scrollIntoView({ block: 'center' })
      didScrollToToday.current = true
    }, 80)
    return () => window.clearTimeout(timer)
  }, [todayKey])

  useEffect(() => {
    function stopDrag() {
      rangeDragging.current = false
    }
    window.addEventListener('pointerup', stopDrag)
    return () => window.removeEventListener('pointerup', stopDrag)
  }, [])

  function persistColors(next: CalendarColors) {
    setColors(next)
    localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(next))
  }

  function prependMonth() {
    if (expandingRef.current) {
      return
    }
    expandingRef.current = true
    const scroller = scrollRef.current
    const previousHeight = scroller?.scrollHeight ?? 0
    setMonths((current) => [addMonths(current[0], -1), ...current])
    requestAnimationFrame(() => {
      if (scroller) {
        scroller.scrollTop += scroller.scrollHeight - previousHeight
      }
      expandingRef.current = false
    })
  }

  function appendMonth() {
    if (expandingRef.current) {
      return
    }
    expandingRef.current = true
    setMonths((current) => [...current, addMonths(current[current.length - 1], 1)])
    requestAnimationFrame(() => {
      expandingRef.current = false
    })
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
    return dateText < todayKey ? colors.past : colors.upcoming
  }

  function resetMenu() {
    setMenuOpen(false)
    setCanceling(false)
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
    if (canceling) {
      void pickDayToCancel(dateText)
      return
    }
    if (addingTrip) {
      return
    }
    openDay(dateText)
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
        message.success(`已领取 ${order.orderNo}，共 ${result.updatedDayCount} 天`)
      }
      resetMenu()
      await loadBoard()
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
      for (const day of days) {
        await ordersApi.updateDay(orderId, day.id, {
          serviceDate: day.serviceDate,
          description: day.description,
          endLocation: day.endLocation,
          driverId: null,
        })
      }
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
      await unbindOrder(trips[0].orderId, trips[0].orderNo)
      return
    }

    setPendingCancelTrips(trips)
  }

  return (
    <div className="driver-calendar-page">
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
              placeholder="系统订单号或平台订单号"
              onChange={(event) => setOrderNo(event.target.value)}
            />
          </label>
          <button type="button" className="driver-primary-button" disabled={busy} onClick={() => void claimOrder()}>
            领取订单
          </button>
          <p className="driver-add-hint">
            {canceling
              ? `点击日历上已有行程的某一天，只取消${user?.name ? `「${user.name}」` : '当前司导'}在该单上的日期，其他司导不受影响。`
              : '不知道订单号时，在日历上按住并拖选起止日期。'}
          </p>
          {rangeFrom && rangeTo && !canceling ? (
            <button type="button" className="driver-primary-button" disabled={busy} onClick={() => void createRange()}>
              添加 {formatMonthDay(rangeFrom)}
              {rangeFrom !== rangeTo ? `–${formatMonthDay(rangeTo)}` : ''} 仅日期
            </button>
          ) : null}
          <button
            type="button"
            className={`driver-ghost-button${canceling ? ' danger' : ''}`}
            disabled={busy}
            onClick={() => {
              if (unbindLock.current) {
                return
              }
              setCanceling((current) => !current)
              setPendingCancelTrips([])
              setRangeStart(null)
              setRangeEnd(null)
              setSelectedDate(null)
            }}
          >
            取消行程
          </button>
          {pendingCancelTrips.length > 0 ? (
            <div className="driver-cancel-orders">
              <p className="driver-add-hint">当天有多笔订单，请选择要取消的订单：</p>
              {pendingCancelTrips.map((trip) => (
                <button
                  key={trip.orderId}
                  type="button"
                  className="driver-ghost-button"
                  disabled={busy}
                  onClick={() => void unbindOrder(trip.orderId, trip.orderNo)}
                >
                  {trip.orderNo}
                  {trip.endLocation ? ` · ${trip.endLocation}` : ''}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="driver-calendar-scroll" ref={scrollRef} onScroll={onScroll}>
        {months.map((month) => (
          <MonthSection
            key={monthKey(month)}
            month={month}
            todayKey={todayKey}
            selectedDate={selectedDate}
            daysByDate={daysByDate}
            tripFill={tripFill}
            addingTrip={addingTrip}
            canceling={canceling}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            onDayPointerDown={onDayPointerDown}
            onDayPointerEnter={onDayPointerEnter}
            onDayClick={onDayClick}
          >
            {selectedDay && selectedDate && selectedDate.startsWith(monthKey(month)) ? (
              <DriverDayEditor
                key={selectedDate}
                day={selectedDay}
                onChanged={loadBoard}
              />
            ) : null}
          </MonthSection>
        ))}
      </div>
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

function MonthSection({
  month,
  todayKey,
  selectedDate,
  daysByDate,
  tripFill,
  addingTrip,
  canceling,
  rangeFrom,
  rangeTo,
  onDayPointerDown,
  onDayPointerEnter,
  onDayClick,
  children,
}: {
  month: Date
  todayKey: string
  selectedDate: string | null
  daysByDate: Record<string, DriverCalendarDay>
  tripFill: (dateText: string) => string
  addingTrip: boolean
  canceling: boolean
  rangeFrom: string | null
  rangeTo: string | null
  onDayPointerDown: (dateText: string) => void
  onDayPointerEnter: (dateText: string) => void
  onDayClick: (dateText: string) => void
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
          const fill = hasTrip ? tripFill(dateText) : undefined
          const selected = selectedDate === dateText
          const inRange = Boolean(rangeFrom && rangeTo && dateText >= rangeFrom && dateText <= rangeTo)
          const rangeEdge = dateText === rangeFrom || dateText === rangeTo
          return (
            <button
              key={`${monthKey(month)}-${dateText}-${cell.inMonth ? 'in' : 'out'}`}
              type="button"
              id={dateText === todayKey && cell.inMonth ? `driver-day-${todayKey}` : undefined}
              className={[
                'driver-day',
                cell.inMonth ? '' : 'outside',
                hasTrip ? 'has-trip' : '',
                selected ? 'selected' : '',
                inRange ? 'in-range' : '',
                rangeEdge ? 'range-edge' : '',
                dateText === todayKey && cell.inMonth ? 'today' : '',
              ].join(' ')}
              aria-label={
                canceling
                  ? hasTrip
                    ? `取消 ${dateText} 当前司导的绑定`
                    : dateText
                  : undefined
              }
              style={
                fill
                  ? { background: fill, color: contrastText(fill) }
                  : undefined
              }
              onPointerDown={() => {
                if (cell.inMonth) {
                  onDayPointerDown(dateText)
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
              {cell.inMonth ? cell.date.getDate() : ''}
            </button>
          )
        })}
      </div>
      {children}
    </section>
  )
}
