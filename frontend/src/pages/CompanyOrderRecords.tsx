import { message } from 'antd'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { companyApi } from '../api/auth'
import { ordersApi } from '../api/orders'
import { CALENDAR_HOLD_MS } from '../calendarDay'
import { formatLocalDate, parseYmd, todayLocal } from '../localDate'
import { islandLabel } from '../orderFlags'
import type { CompanyOrderRecord, CompanyOrderScope, ShareLevel } from '../types'
import { useDisarmOnOutside } from '../useDisarmOnOutside'
import { useLockPageScroll } from '../useLockPageScroll'
import { ShareLevelBar } from './dispatcher/DispatcherCalendarCard'
import { dispatcherJumpState, rememberRecordsReturn, takeRecordsReturn, type DispatcherJump } from './dispatcher/dispatcherJump'
import { OrderRecordsExport } from './OrderRecordsExport'
import './order-records.css'

/** 行程路线只显示前 10 个字，够区分订单。 */
const ROUTE_CHARS = 10
/** 按住多久算长按。 */
const HOLD_MS = CALENDAR_HOLD_MS
/** 按住时手指移动超过这么多就是在滑动表格，不算长按。 */
const HOLD_SLOP_PX = 8
/** 公司账户上次选的范围，记在本机。 */
const SCOPE_KEY = 'trailink.company.recordsScope'
const SCOPE_LABELS: Record<CompanyOrderScope, string> = { all: '全部', desk: '调度中', driver: '已接单' }
const EMPTY_TEXT: Record<CompanyOrderScope, string> = {
  all: '暂无订单',
  desk: '自己的调度台上还没有这家公司的订单',
  driver: '这家公司还没有派给自己跑的订单',
}

function monthDay(date: string) {
  const value = parseYmd(date)
  return `${value.getMonth() + 1}.${value.getDate()}`
}

function dateRange(record: CompanyOrderRecord) {
  return record.startDate === record.endDate
    ? monthDay(record.startDate)
    : `${monthDay(record.startDate)}–${monthDay(record.endDate)}`
}

function shortRoute(route: string | null | undefined) {
  const text = (route ?? '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  return chars.length > ROUTE_CHARS ? `${chars.slice(0, ROUTE_CHARS).join('')}…` : text
}

/** 司导、车牌的名字：选中的行里能跳的单，带上 id，点哪个名字就打开哪个。 */
function linkNames(names: string[], ids: string[] | undefined, linked: boolean) {
  // 后端还是旧版本（没带 id）时照常显示名字，只是不能跳。
  const idOf = (index: number) => ids?.[index]
  return names.map((name, index) => (
    <span key={idOf(index) ?? `${name}-${index}`}>
      {index > 0 ? '、' : null}
      <span
        data-jump-id={linked ? idOf(index) : undefined}
      >
        {name}
      </span>
    </span>
  ))
}

function driversCell(record: CompanyOrderRecord, linked: boolean) {
  if (record.unassignedDays >= record.dayCount) {
    return <span className="record-missing">未派单</span>
  }
  return (
    <>
      {linkNames(record.drivers, record.driverIds, linked)}
      {record.unassignedDays > 0 ? <span className="record-missing"> · {record.unassignedDays}天未派</span> : null}
    </>
  )
}

function platesCell(record: CompanyOrderRecord, linked: boolean) {
  if (record.noVehicleDays >= record.dayCount) {
    return <span className="record-missing soft">未配车</span>
  }
  return (
    <>
      {linkNames(record.plates, record.vehicleIds, linked)}
      {record.noVehicleDays > 0 ? <span className="record-missing soft"> · {record.noVehicleDays}天未配</span> : null}
    </>
  )
}

/**
 * 能不能从这一行跳过去：自己调度台上的单跳调度台；公司账户管的其他单（`canEdit` 但不在自己调度台上）跳「派给调度」打开订单。
 * 只是自己跑的单不跳。不管订单有没有开始、结束。
 */
function canJump(record: CompanyOrderRecord) {
  return Boolean(record.onDesk || record.canEdit)
}

/** 点的是哪一格、哪个名字，决定跳过去打开什么。 */
function jumpOf(record: CompanyOrderRecord, isDriver: boolean, id: string | undefined): DispatcherJump {
  if (id) {
    return isDriver
      ? { kind: 'driver', orderId: record.id, driverId: id }
      : { kind: 'vehicle', orderId: record.id, vehicleId: id }
  }
  // 派了司导、没配车：点「未配车」到车辆管理打开司导。
  const driverId = record.driverIds?.[0]
  if (!isDriver && driverId) {
    return { kind: 'missingVehicle', orderId: record.id, driverId }
  }
  // 整单还没派司导：只打开这张订单。
  return { kind: 'order', orderId: record.id }
}

interface Hold {
  id: string
  pointerId: number
  x: number
  y: number
  timer: number
}

interface Menu {
  record: CompanyOrderRecord
  x: number
  y: number
}

/**
 * 公司信息页的订单记录：表格最多同时显示 10 行，上下滑看更早、更晚的单，手机上左右滑看完整的列。
 * 打开时停在今天：第一行是还没结束（结束日期不早于今天）的第一张单，往上滑是已经过去的单。
 * 长按一行弹出操作：编辑订单、抢单状态、退回公司（同调度台上的删除，两步确认）。
 */
export function CompanyOrderRecords({
  companyId,
  version,
  scopes,
  onEdit,
}: {
  companyId: string
  /** 这个账号在这家公司能选的范围，第一项是默认；不止一项时标题旁边显示下拉框。 */
  scopes: CompanyOrderScope[]
  /** 外面改了订单（例如编辑订单保存后）加一，重新读取。 */
  version: number
  onEdit: (orderId: string) => void
}) {
  const navigate = useNavigate()
  const [records, setRecords] = useState<CompanyOrderRecord[] | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  /** 点过或长按过的那一行：浅灰底，让人知道正在看哪一单（编辑完回来也还在，点表格外面取消）。 */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [picked, setPicked] = useState<CompanyOrderScope | null>(() => {
    try {
      const saved = window.localStorage.getItem(SCOPE_KEY)
      return saved === 'all' || saved === 'desk' || saved === 'driver' ? saved : null
    } catch {
      return null
    }
  })
  // 选过的不在这个角色的范围里（例如换了账号）就用默认。
  const scope: CompanyOrderScope = picked && scopes.includes(picked) ? picked : scopes[0]
  const [returnArmed, setReturnArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const holdRef = useRef<Hold | null>(null)
  /** 长按刚弹出操作框：松手时的点击不算「再点一下」。 */
  const heldRef = useRef(false)
  const placedFor = useRef<string | null>(null)
  const today = formatLocalDate(todayLocal())

  const load = useCallback(async () => {
    try {
      setRecords(await companyApi.orders(companyId, scope))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载订单记录失败')
      setRecords([])
    }
  }, [companyId, scope])

  useEffect(() => {
    // 读取接口数据：换公司或外面改了订单时重新读。
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load, version])

  // 第一次读到这家公司的记录时，滚到今天：还没结束的第一张单放在表头下面第一行。
  useLayoutEffect(() => {
    const body = scrollRef.current
    const placeKey = `${companyId}:${scope}`
    if (!body || !records || placedFor.current === placeKey) {
      return
    }
    placedFor.current = placeKey
    // 从调度台点返回回来：选中跳过去的那一行，滚回原来的位置。
    const back = takeRecordsReturn(companyId, scope)
    if (back && records.some((record) => record.id === back.orderId)) {
      // 返回时恢复选中只发生一次（读的是本标签页记下的位置）。
      // oxlint-disable-next-line react/set-state-in-effect
      setSelectedId(back.orderId)
      body.scrollTop = back.scrollTop
      // 整个页面也滚到这一行（放在屏幕中间），不是停在公司信息最上面。
      // 上面的公司资料可能比订单记录晚一点出来、把表格往下推，过一会再对一次。
      const center = () => {
        const row = body.querySelector<HTMLElement>(`[data-record-id="${back.orderId}"]`)
        // 已经离开公司信息页（表格不在页面上）就不滚。
        if (!row?.isConnected) {
          return
        }
        const rect = row.getBoundingClientRect()
        window.scrollTo({ top: Math.max(0, window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2) })
      }
      center()
      window.requestAnimationFrame(center)
      window.setTimeout(center, 400)
      return
    }
    const first = records.find((record) => record.endDate >= today)
    const row = first ? body.querySelector<HTMLElement>(`[data-record-id="${first.id}"]`) : null
    const head = body.querySelector<HTMLElement>('thead')
    if (row) {
      // 这一行前面紧挨着年份分隔行时，连年份一起露出来。
      const previous = row.previousElementSibling as HTMLElement | null
      const top = previous?.classList.contains('record-year') ? previous.offsetTop : row.offsetTop
      body.scrollTop = Math.max(0, top - (head?.offsetHeight ?? 0))
    } else {
      body.scrollTop = body.scrollHeight
    }
  }, [companyId, records, scope, today])

  // 点订单记录表格外面就取消选中。弹框（编辑订单、改日期、长按操作框）开着时不算，编辑完回来还选着。
  useEffect(() => {
    if (!selectedId) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element) || !target.isConnected) {
        return
      }
      if (
        target.closest(
          '.order-records tbody tr[data-record-id], .order-record-backdrop, .account-overlay, .reschedule-dialog-overlay, .ant-modal-root, .ant-message, .ant-select-dropdown',
        )
      ) {
        return
      }
      setSelectedId(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [selectedId])

  const closeMenu = useCallback(() => {
    setMenu(null)
    setReturnArmed(false)
  }, [])
  useDisarmOnOutside(returnArmed, '[data-record-return]', useCallback(() => setReturnArmed(false), []))
  // 操作框开着时后面的页面不跟着滑。
  useLockPageScroll(menu !== null)

  function cancelHold() {
    const hold = holdRef.current
    if (hold) {
      window.clearTimeout(hold.timer)
      holdRef.current = null
    }
  }

  function startHold(event: ReactPointerEvent<HTMLTableRowElement>, record: CompanyOrderRecord) {
    if (!record.canEdit && !record.canSetShareLevel && !record.canReturn) {
      return
    }
    cancelHold()
    const x = event.clientX
    const y = event.clientY
    holdRef.current = {
      id: record.id,
      pointerId: event.pointerId,
      x,
      y,
      timer: window.setTimeout(() => {
        holdRef.current = null
        heldRef.current = true
        navigator.vibrate?.(15)
        setReturnArmed(false)
        setSelectedId(record.id)
        setMenu({ record, x, y })
      }, HOLD_MS),
    }
  }

  function moveHold(event: ReactPointerEvent<HTMLTableRowElement>) {
    const hold = holdRef.current
    if (!hold || hold.pointerId !== event.pointerId) {
      return
    }
    const dx = event.clientX - hold.x
    const dy = event.clientY - hold.y
    if (dx * dx + dy * dy > HOLD_SLOP_PX * HOLD_SLOP_PX) {
      cancelHold()
    }
  }

  /**
   * 点一行：先选中；已经选中的行再点司导或车牌，跳到调度台打开对应的卡片。
   * 点在几位司导中的某一位上就打开他，点在格子空白处打开第一位。
   */
  function clickRow(event: ReactMouseEvent<HTMLTableRowElement>, record: CompanyOrderRecord) {
    if (heldRef.current) {
      heldRef.current = false
      return
    }
    const wasSelected = selectedId === record.id
    setSelectedId(record.id)
    if (!wasSelected || !canJump(record) || !(event.target instanceof Element)) {
      return
    }
    const cell = event.target.closest<HTMLElement>('[data-jump-cell]')
    if (!cell) {
      return
    }
    const target =
      event.target.closest<HTMLElement>('[data-jump-id]') ?? cell.querySelector<HTMLElement>('[data-jump-id]')
    const id = target?.dataset.jumpId
    const isDriver = cell.dataset.jumpCell === 'driver'
    const none = isDriver ? record.drivers.length === 0 : record.plates.length === 0
    if (!id && !none && record.onDesk) {
      // 名字有、但后端没给 id（旧版本）：不跳。
      return
    }
    rememberRecordsReturn({ companyId, scope, orderId: record.id, scrollTop: scrollRef.current?.scrollTop ?? 0 })
    if (!record.onDesk) {
      // 公司账户看「全部」里不在自己调度台上的单（公司池里没人派、或分给了调度员）：到「派给调度」打开这张订单。
      navigate('/company/assign', { state: dispatcherJumpState({ kind: 'order', orderId: record.id }) })
      return
    }
    navigate('/dispatcher', { state: dispatcherJumpState(jumpOf(record, isDriver, id)) })
  }

  async function changeShareLevel(record: CompanyOrderRecord, level: ShareLevel) {
    setBusy(true)
    try {
      await ordersApi.setShareLevel(record.id, level)
      setMenu((current) => (current ? { ...current, record: { ...current.record, shareLevel: level } } : current))
      message.success('已更新抢单状态')
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新抢单状态失败')
    } finally {
      setBusy(false)
    }
  }

  async function returnToCompany(record: CompanyOrderRecord) {
    if (!returnArmed) {
      setReturnArmed(true)
      return
    }
    setBusy(true)
    try {
      await ordersApi.remove(record.id, true)
      message.success('已退回公司订单池')
      closeMenu()
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '退回失败')
    } finally {
      setBusy(false)
    }
  }

  const head = (
    <div className="order-records-head">
      <h2>订单记录</h2>
      <div className="order-records-tools">
      {records && records.length > 0 ? (
        <OrderRecordsExport companyId={companyId} scope={scope} scopeLabel={SCOPE_LABELS[scope]} />
      ) : null}
      {scopes.length > 1 ? (
        <select
          className="order-records-scope"
          aria-label="订单范围"
          value={scope}
          onChange={(event) => {
            const next = event.target.value as CompanyOrderScope
            if (next === scope) {
              return
            }
            setPicked(next)
            // 换了范围：清空等新数据（load 跟着 scope 变化重新读取）。
            setRecords(null)
            setMenu(null)
            try {
              window.localStorage.setItem(SCOPE_KEY, next)
            } catch {
              // 隐私模式下存不了，不影响使用。
            }
          }}
        >
          {scopes.map((item) => (
            <option key={item} value={item}>
              {SCOPE_LABELS[item]}
            </option>
          ))}
        </select>
      ) : null}
      </div>
    </div>
  )

  if (records === null) {
    return (
      <>
        {head}
        <p className="account-empty">正在加载…</p>
      </>
    )
  }
  if (records.length === 0) {
    return (
      <>
        {head}
        <p className="account-empty">{EMPTY_TEXT[scope]}</p>
      </>
    )
  }

  return (
    <>
      {head}
      <div className="order-records" ref={scrollRef} onScroll={cancelHold}>
        <table>
          <thead>
            <tr>
              <th>人数</th>
              <th>车型</th>
              <th>起止时间</th>
              <th>南/北岛</th>
              <th>行程路线</th>
              <th>司导</th>
              <th>车牌</th>
            </tr>
          </thead>
          <tbody>
            {records.flatMap((record, index) => {
              const year = record.startDate.slice(0, 4)
              const rows = []
              // 年份变了（或第一行）先插一行年份，像纸质表格一样分隔。
              if (index === 0 || records[index - 1].startDate.slice(0, 4) !== year) {
                rows.push(
                  <tr className="record-year" key={`year-${year}`}>
                    <td colSpan={7}>{year}年</td>
                  </tr>,
                )
              }
              const past = record.endDate < today
              // 选中的行、自己调度台上的单：司导、车牌显示成可以点的样子。
              const linked = selectedId === record.id && canJump(record)
              rows.push(
                <tr
                  key={record.id}
                  data-record-id={record.id}
                  className={[past ? 'past' : '', selectedId === record.id ? 'selected' : ''].filter(Boolean).join(' ')}
                  aria-selected={selectedId === record.id}
                  onClick={(event) => clickRow(event, record)}
                  onPointerDown={(event) => startHold(event, record)}
                  onPointerMove={moveHold}
                  onPointerUp={cancelHold}
                  onPointerCancel={cancelHold}
                  onPointerLeave={cancelHold}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <td>{record.guestCount > 0 ? `${record.guestCount}人` : '—'}</td>
                  <td>{record.vehicleType || '—'}</td>
                  <td className="record-dates">{dateRange(record)}</td>
                  <td>{islandLabel(record.island)}</td>
                  <td className="record-route" title={record.route ?? undefined}>
                    {shortRoute(record.route) || '—'}
                  </td>
                  <td data-jump-cell="driver" className={linked ? 'record-jump' : undefined}>
                    <span className="record-jump-face">{driversCell(record, linked)}</span>
                  </td>
                  <td data-jump-cell="vehicle" className={linked ? 'record-jump' : undefined}>
                    <span className="record-jump-face">{platesCell(record, linked)}</span>
                  </td>
                </tr>,
              )
              return rows
            })}
          </tbody>
        </table>
      </div>
      <p className="order-records-hint">
        点一行选中（点表格外面取消）{records.some(canJump) ? '，再点司导或车牌跳到调度台' : ''}
        ；长按可编辑订单、调整日期、改抢单状态或退回公司。表格比屏幕宽时左右滑看完整信息。
      </p>

      {menu ? (
        <div
          className="order-record-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMenu()
            }
          }}
        >
          <div
            className="order-record-menu"
            role="dialog"
            aria-label="订单操作"
            style={{
              left: Math.min(Math.max(12, menu.x - 140), window.innerWidth - 292),
              top: Math.min(Math.max(12, menu.y + 12), window.innerHeight - 260),
            }}
          >
            <p className="order-record-menu-title">
              {dateRange(menu.record)} · {shortRoute(menu.record.route) || '没有行程路线'}
            </p>
            {menu.record.canEdit ? (
              <button
                type="button"
                className="account-chip"
                onClick={() => {
                  const id = menu.record.id
                  closeMenu()
                  onEdit(id)
                }}
              >
                编辑订单
              </button>
            ) : null}
            {menu.record.canSetShareLevel ? (
              <div className="order-record-share">
                <span>抢单状态</span>
                <ShareLevelBar
                  level={menu.record.shareLevel}
                  locked={false}
                  onChange={(level) => {
                    if (!busy) {
                      void changeShareLevel(menu.record, level)
                    }
                  }}
                />
              </div>
            ) : null}
            {menu.record.canReturn ? (
              <button
                type="button"
                data-record-return
                className={`account-chip order-record-return${returnArmed ? ' armed' : ''}`}
                disabled={busy}
                onClick={() => void returnToCompany(menu.record)}
              >
                {returnArmed ? '再点一次退回公司' : '退回公司'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
