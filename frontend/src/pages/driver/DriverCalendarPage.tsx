import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { message } from 'antd'
import { driverCalendarApi } from '../../api/driverCalendar'
import { ordersApi } from '../../api/orders'
import type { DriverCalendarDay, DriverCalendarTrip } from '../../types'
import { DriverDayEditor } from './DriverDayEditor'
import './driver-calendar.css'
import {
  addMonths,
  formatLocalDate,
  monthEnd,
  monthKey,
  monthStart,
  todayLocal,
} from './localDate'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const PRESET_COLORS = ['#C6F0E0', '#D6E4FF', '#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#8c8c8c', '#262626']
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

function contrastText(background: string) {
  const hex = background.replace('#', '')
  const value = hex.length === 3 ? hex.split('').map((item) => item + item).join('') : hex
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance < 0.55 ? '#fff' : '#1f1f1f'
}

function monthCells(month: Date) {
  const start = monthStart(month)
  const end = monthEnd(month)
  const leading = (start.getDay() + 6) % 7
  const cells: Array<{ date: Date; inMonth: boolean }> = []

  for (let index = 0; index < leading; index += 1) {
    cells.push({ date: new Date(start.getFullYear(), start.getMonth(), index - leading + 1), inMonth: false })
  }

  for (let day = 1; day <= end.getDate(); day += 1) {
    cells.push({ date: new Date(start.getFullYear(), start.getMonth(), day), inMonth: true })
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false })
  }

  return cells
}

function orderedRange(start: string, end?: string | null) {
  const finish = end || start
  return start <= finish ? [start, finish] : [finish, start]
}

function formatMonthDay(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}月${Number(day)}日`
}

export function DriverCalendarPage() {
  const today = useMemo(() => todayLocal(), [])
  const todayKey = formatLocalDate(today)
  const [months, setMonths] = useState(() => [-2, -1, 0, 1, 2].map((offset) => addMonths(today, offset)))
  const [daysByDate, setDaysByDate] = useState<Record<string, DriverCalendarDay>>({})
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
  const loadedMonths = useRef<string[]>([])
  const monthRequests = useRef(new Map<string, number>())
  const expandingRef = useRef(false)
  const didScrollToToday = useRef(false)
  const rangeDragging = useRef(false)
  const unbindLock = useRef(false)

  const selectedDay = selectedDate ? daysByDate[selectedDate] : undefined
  const [rangeFrom, rangeTo] = rangeStart ? orderedRange(rangeStart, rangeEnd) : [null, null]
  const addingTrip = menuOpen && !canceling

  const loadMonth = useCallback(async (month: Date, force = false) => {
    const key = monthKey(month)
    if (!force && loadedMonths.current.includes(key)) {
      return
    }

    if (force) {
      loadedMonths.current = loadedMonths.current.filter((item) => item !== key)
    }
    loadedMonths.current.push(key)
    const request = (monthRequests.current.get(key) ?? 0) + 1
    monthRequests.current.set(key, request)
    try {
      const start = formatLocalDate(monthStart(month))
      const end = formatLocalDate(monthEnd(month))
      const preview = await driverCalendarApi.preview(start, end)
      setDaysByDate((current) => {
        if (monthRequests.current.get(key) !== request) {
          return current
        }
        const next = { ...current }
        for (const key of Object.keys(next)) {
          if (key >= start && key <= end) {
            delete next[key]
          }
        }
        for (const day of preview.days) {
          next[day.date] = day
        }
        return next
      })
    } catch (error) {
      if (monthRequests.current.get(key) !== request) {
        return
      }
      loadedMonths.current = loadedMonths.current.filter((item) => item !== key)
      message.error(error instanceof Error ? error.message : '加载行程失败')
    }
  }, [])

  async function reloadCalendar() {
    loadedMonths.current = []
    await Promise.all(months.map((month) => loadMonth(month, true)))
  }

  useEffect(() => {
    months.forEach((month) => {
      void loadMonth(month)
    })
  }, [loadMonth, months])

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
    setBusy(true)
    try {
      const result = await driverCalendarApi.claim(value)
      if (result.warnings.length > 0) {
        message.warning(result.warnings.join('；'))
      } else {
        message.success(`已领取 ${result.orderNo}，共 ${result.updatedDayCount} 天`)
      }
      resetMenu()
      await reloadCalendar()
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
    setBusy(true)
    try {
      const result = await driverCalendarApi.createRange(rangeFrom, rangeTo)
      if (result.warnings.length > 0) {
        message.warning(result.warnings.join('；'))
      } else {
        message.success(`已添加 ${result.updatedDayCount} 天行程`)
      }
      resetMenu()
      await reloadCalendar()
      setSelectedDate(rangeFrom)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '添加行程失败')
    } finally {
      setBusy(false)
    }
  }

  async function unbindOrder(orderId: string, orderLabel: string) {
    if (unbindLock.current) {
      return
    }
    unbindLock.current = true
    setBusy(true)
    try {
      const result = await ordersApi.assignDriver(orderId, null)
      message.success(`已取消 ${orderLabel} 的绑定，共 ${result.updatedDayCount} 天`)
      resetMenu()
      await reloadCalendar()
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
          <p>连续月份日历 · 开发预览</p>
        </div>
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
              ? '点击日历上已有行程的某一天，取消该订单全部日期的绑定。'
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
                onChanged={reloadCalendar}
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
              ].join(' ')}
              aria-label={
                canceling
                  ? hasTrip
                    ? `取消 ${dateText} 的整单绑定`
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
