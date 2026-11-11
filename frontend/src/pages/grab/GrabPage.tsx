import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { useAuthenticatedAuth } from '../../auth/authState'
import { grabApi, SHARE_LEVEL_LABELS } from '../../api/grab'
import { formatMonthDay, parseYmd, WEEKDAYS } from '../../localDate'
import { placeMark } from '../../placeMark'
import type { GrabActivity, GrabOrder, ShareLevel } from '../../types'
import { usePageLoad } from '../../usePageLoad'
import { AccountMenu } from '../AccountMenu'
import { DeskHint } from '../dispatcher/BoardParts'
import '../account.css'
import '../dispatcher/dispatcher.css'
import { useDisarmOnOutside } from '../../useDisarmOnOutside'
import './grab.css'

type Filter = 'all' | ShareLevel

const HINT =
  '这里是调度员放出来的单：公司内部的给公司的司导看，面向所有人的谁都能抢；调度员自留的单不会出现在这里。一次抢这张单里还没派的全部日期，不能只抢其中几天。这些日期里只要有一天你已经有行程就不能抢，先在我的行程里处理掉那一天再回来。抢单后要等调度员确认，一张单可能有几个人抢，调度员确认谁就派给谁；确认前可以撤回。确认后行程出现在我的行程里；公司内部的单会让你成为这位调度员的司导，面向所有人的单会让你同时成为这位调度员和这家公司的司导。公司订单号、备注和联系方式派给你之后在我的行程里看。'

function weekday(date: string) {
  return WEEKDAYS[(parseYmd(date).getDay() + 6) % 7]
}

function timeText(value: string | null) {
  return value ? value.slice(11, 16) : null
}

function activityText(activity: GrabActivity) {
  const times = [timeText(activity.checkinTime) && `签到 ${timeText(activity.checkinTime)}`, timeText(activity.bookingTime) && `预订 ${timeText(activity.bookingTime)}`]
    .filter(Boolean)
    .join(' ')
  return times ? `${activity.content}（${times}）` : activity.content
}

/**
 * 抢单：列出调度员放出来的单（公司内部、面向所有人；调度自留不出现），整段抢下，等调度员确认。
 * 有冲突的单标出冲突日期，不能抢；已抢的单显示等待确认，可以撤回。
 */
export function GrabPage() {
  const { user } = useAuthenticatedAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<GrabOrder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [hintOpen, setHintOpen] = useState(false)
  const [armedId, setArmedId] = useState<string | null>(null)
  const clearArmed = useCallback(() => setArmedId(null), [])
  useDisarmOnOutside(armedId !== null, '[data-grab-confirm]', clearArmed)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      setOrders(await grabApi.list())
    } catch (error) {
      message.error(error instanceof Error ? error.message : '读取抢单失败')
    } finally {
      setLoaded(true)
    }
  }

  usePageLoad(load)

  async function take(order: GrabOrder) {
    setBusyId(order.orderId)
    try {
      await grabApi.take(order.orderId, order.days.map((day) => day.id))
      setArmedId(null)
      setOrders((current) => current.map((item) => (item.orderId === order.orderId ? { ...item, claimedByMe: true } : item)))
      message.success('已抢单，等调度员确认')
    } catch (error) {
      setArmedId(null)
      message.error(error instanceof Error ? error.message : '抢单失败')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function withdraw(order: GrabOrder) {
    setBusyId(order.orderId)
    try {
      await grabApi.withdraw(order.orderId)
      setOrders((current) => current.map((item) => (item.orderId === order.orderId ? { ...item, claimedByMe: false } : item)))
      message.success('已撤回')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '撤回失败')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const claimedCount = orders.filter((order) => order.claimedByMe).length
  const counts = [0, 1, 2].map((level) => orders.filter((order) => order.shareLevel === level).length)
  const shown = filter === 'all' ? orders : orders.filter((order) => order.shareLevel === filter)

  return (
    <div className="account-page grab-page">
      <header className="account-header">
        <div>
          <h1>抢单</h1>
          <p>{user.name || '调度员放出来的单'}</p>
        </div>
        <div className="account-header-actions">
          <AccountMenu />
        </div>
      </header>

      <main className="grab-main">
        <div className="grab-filters" role="tablist" aria-label="筛选">
          <button type="button" role="tab" aria-selected={filter === 'all'} className={`dispatcher-chip${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            全部 {orders.length}
          </button>
          {SHARE_LEVEL_LABELS.map((label, level) =>
            counts[level] > 0 ? (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={filter === level}
                className={`dispatcher-chip${filter === level ? ' active' : ''}`}
                onClick={() => setFilter(level as ShareLevel)}
              >
                {label} {counts[level]}
              </button>
            ) : null,
          )}
          <button type="button" className="dispatcher-chip grab-refresh" onClick={() => void load()}>
            刷新
          </button>
        </div>
        <DeskHint open={hintOpen} onToggle={() => setHintOpen((current) => !current)} text={HINT} />

        {claimedCount ? (
          <div className="grab-taken" role="status">
            <span>已抢 {claimedCount} 张单，等调度员确认。确认后行程会出现在我的行程里。</span>
            <button type="button" className="dispatcher-chip" onClick={() => navigate(calendarLink(orders.filter((order) => order.claimedByMe)))}>
              在我的行程里看
            </button>
          </div>
        ) : null}

        {loaded && shown.length === 0 ? (
          <p className="grab-empty">
            {orders.length === 0 ? '暂时没有可以接的单。调度员把订单放出来后会出现在这里。' : '这一类暂时没有单。'}
          </p>
        ) : null}

        <div className="grab-list">
          {shown.map((order) => {
            const first = order.days[0].serviceDate
            const last = order.days[order.days.length - 1].serviceDate
            const conflictDates = [...new Set(order.conflicts.map((item) => item.serviceDate))]
            const armed = armedId === order.orderId
            return (
              <article key={order.orderId} className={`grab-card${conflictDates.length ? ' blocked' : ''}${order.claimedByMe ? ' claimed' : ''}`}>
                <header className="grab-card-head">
                  <Link className="grab-title" to={calendarLink([order])} title="在我的行程里用橙色标出这几天">
                    <strong>
                      {formatMonthDay(first)}
                      {first !== last ? ` – ${formatMonthDay(last)}` : ''}
                    </strong>
                    <span className="grab-days">{order.days.length} 天 ›</span>
                  </Link>
                  <span className={`grab-level level-${order.shareLevel}`}>{SHARE_LEVEL_LABELS[order.shareLevel]}</span>
                </header>
                <p className="grab-meta">
                  {[order.companyName, order.dispatcherName && `调度 ${order.dispatcherName}`, order.guestCount > 0 ? `${order.guestCount} 位游客` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {order.totalDayCount > order.days.length ? (
                  <p className="grab-split">拆单：整张订单 {order.totalDayCount} 天，其余已派，这 {order.days.length} 天一起抢</p>
                ) : null}
                <ol className="grab-day-list">
                  {order.days.map((day) => {
                    const conflict = order.conflicts.find((item) => item.serviceDate === day.serviceDate)
                    return (
                      <li key={day.id} className={conflict ? 'conflict' : undefined}>
                        <span className="grab-date">
                          <b>{Number(day.serviceDate.slice(8))}</b>
                          <small>周{weekday(day.serviceDate)}</small>
                        </span>
                        <span className="grab-place" aria-hidden="true">
                          {placeMark(day.endLocation) ?? ''}
                        </span>
                        <span className="grab-day-body">
                          <span className="grab-location">{day.endLocation || '未写住宿'}</span>
                          {day.activities.length ? <span className="grab-activities">{day.activities.map(activityText).join(' - ')}</span> : null}
                          {day.description ? <span className="grab-description">{day.description}</span> : null}
                          {conflict ? (
                            <span className="grab-conflict-note">你这天已有行程{conflict.orderLabel ? `（${conflict.orderLabel}）` : ''}</span>
                          ) : null}
                        </span>
                      </li>
                    )
                  })}
                </ol>
                <footer className="grab-card-foot">
                  {order.claimedByMe ? (
                    <>
                      <p className="grab-waiting">已抢单，等调度员确认</p>
                      <button type="button" className="dispatcher-chip" disabled={busyId !== null} onClick={() => void withdraw(order)}>
                        {busyId === order.orderId ? '正在撤回…' : '撤回'}
                      </button>
                    </>
                  ) : conflictDates.length ? (
                    <>
                      <p className="grab-blocked">
                        {conflictDates.map(formatMonthDay).join('、')}你已经有行程。先在我的行程里取消那{conflictDates.length > 1 ? '几' : '一'}天，再回来抢。
                      </p>
                      <Link className="dispatcher-chip" to={calendarLink([order], conflictDates[0])}>
                        去处理
                      </Link>
                    </>
                  ) : armed ? (
                    <>
                      <button type="button" className="dispatcher-chip" disabled={busyId !== null} onClick={() => setArmedId(null)}>
                        取消
                      </button>
                      <button type="button" className="grab-take armed" data-grab-confirm="true" disabled={busyId !== null} onClick={() => void take(order)}>
                        {busyId === order.orderId ? '正在抢单…' : `确认抢这 ${order.days.length} 天`}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="grab-take" disabled={busyId !== null} onClick={() => setArmedId(order.orderId)}>
                      抢这 {order.days.length} 天
                    </button>
                  )}
                </footer>
              </article>
            )
          })}
        </div>
      </main>
    </div>
  )
}

/** 跳到我的行程：停在第一天（或指定日期），并把这些单的日期用橙色虚线框标出来。 */
function calendarLink(orders: GrabOrder[], focus?: string) {
  const dates = [...new Set(orders.flatMap((order) => order.days.map((day) => day.serviceDate)))].sort()
  if (dates.length === 0) {
    return '/driver/calendar'
  }
  return `/driver/calendar?date=${focus ?? dates[0]}&grab=${dates.join(',')}`
}
