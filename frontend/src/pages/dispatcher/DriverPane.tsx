import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { licenseApi } from '../../api/license'
import { driverDisplayLabel, type ConflictPattern } from '../../orderFlags'
import { contactLabel } from '../../text'
import type { LicensePhoto, Order } from '../../types'
import { PinIcon, TrashIcon } from '../icons'
import { LicenseGallery } from '../LicenseGallery'
import { DeskHint, PersonAvatar } from './BoardParts'
import type { BoardPerson } from './boardLayout'
import type { DragState } from './boardDrag'
import { DispatcherCalendarCard, DispatcherDayCard, type CalendarMark } from './DispatcherCalendarCard'
import type { usePaneLift } from './paneLift'

export type PoolFilter = 'open' | 'done'

type BeginPointer = (event: ReactPointerEvent, next: DragState) => void

const HINT_ASSIGN =
  '点击调度员看他接手的本公司订单。未完成和已完成用按钮切换。可排序、置顶，也可以隐藏。名字旁可写公司给这位调度的备注，调度看不到。已隐藏的可以恢复。垃圾桶先套红框，再点一次才解除绑定，并收回未完成的订单。不能解除自己。从订单池拖回订单区即整单收回，司导一并取消。'
const HINT_DRIVERS =
  '点击司导看他的行程，已完成和进行中的日期都会显示。着色和我的行程一样：早于今天是已完成色，今天和之后是未完成色。订单没打开时，打开司导停在今天。订单日历已经打开时，订单日历不动，司导日历跟到订单日历当前的日期。名字旁的笔记图标可改备注，右侧可隐藏。置顶在图标右上角。已隐藏的可以恢复。垃圾桶先套红框，再点一次才解除绑定，并收回未完成订单里分给这位司导的日期。已结束的行程保留。'

/**
 * 调度台下半部分：司导区（派给调度里是调度员区）。
 * <ul>
 * <li>标题栏、已隐藏名单（恢复、两步解除绑定）、说明。</li>
 * <li>图标：置顶、拖动排序；订单、某一天、车辆拖到图标上是分配（data-driver-id），悬停时高亮。</li>
 * <li>打开的司导卡片（card）盖在图标上面，可以拖动顶部抬高；拖到打开的卡片上等于拖到这位司导。</li>
 * </ul>
 */
export function DriverPane({
  assignDesk,
  drop,
  drivers,
  hiddenDrivers,
  pinnedIds,
  selectedDriverId,
  hoverDriverId,
  drag,
  conflictPatterns,
  armedUnbindId,
  canUnbind,
  onHiddenToggle,
  onRestore,
  onRequestUnbind,
  onTogglePin,
  beginPointer,
  lift,
  card,
}: {
  assignDesk: boolean
  drop: boolean
  drivers: BoardPerson[]
  hiddenDrivers: BoardPerson[]
  pinnedIds: string[]
  selectedDriverId: string | null
  hoverDriverId: string | null
  drag: DragState | null
  /** 车辆冲突时，涉及的司导图标换成对应图案。 */
  conflictPatterns: Map<string, ConflictPattern>
  armedUnbindId: string | null
  canUnbind: (personId: string) => boolean
  /** 展开或收起已隐藏名单时，页面清掉待确认的解除绑定。 */
  onHiddenToggle: () => void
  onRestore: (personId: string) => void
  onRequestUnbind: (person: BoardPerson) => void
  onTogglePin: (personId: string) => void
  beginPointer: BeginPointer
  lift: ReturnType<typeof usePaneLift>
  card: ReactNode
}) {
  const [showHidden, setShowHidden] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  return (
    <section className={`dispatcher-pane drivers${drop ? ' drop' : ''}`} data-driver-pane="true">
      <div className="dispatcher-pane-bar">
        <h2>{assignDesk ? '调度员' : '司导'}</h2>
        <button
          type="button"
          className="dispatcher-chip"
          onClick={() => {
            onHiddenToggle()
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
              <button type="button" className="dispatcher-chip" onClick={() => onRestore(driver.id)}>
                恢复 {driver.name}
              </button>
              {canUnbind(driver.id) ? (
                <button
                  type="button"
                  className={`dispatcher-icon-btn danger${armedUnbindId === driver.id ? ' release' : ''}`}
                  data-unbind-driver={driver.id}
                  aria-label={armedUnbindId === driver.id ? `确认解除绑定 ${driver.name}` : `解除绑定 ${driver.name}`}
                  aria-pressed={armedUnbindId === driver.id}
                  onClick={() => onRequestUnbind(driver)}
                >
                  <TrashIcon />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <DeskHint open={hintOpen} onToggle={() => setHintOpen((current) => !current)} text={assignDesk ? HINT_ASSIGN : HINT_DRIVERS} />
      <div className="dispatcher-grid">
        {drivers.length === 0 ? <p className="dispatcher-empty">{assignDesk ? '暂无调度员' : '暂无司导'}</p> : null}
        {drivers.map((driver) => {
          const pinned = pinnedIds.includes(driver.id)
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
                  onClick={() => onTogglePin(driver.id)}
                >
                  <PinIcon filled={pinned} />
                </button>
              </div>
              <button
                type="button"
                className="dispatcher-avatar"
                aria-label={driver.name}
                title={driver.name}
                onPointerDown={(event) => beginPointer(event, { kind: 'driver', id: driver.id, x: event.clientX, y: event.clientY })}
              >
                <PersonAvatar
                  name={driver.name}
                  src={driver.hasAvatar ? (assignDesk ? `/api/company/dispatchers/${driver.id}/avatar` : `/api/drivers/${driver.id}/avatar`) : null}
                  pattern={conflictPatterns.get(driver.id)}
                />
                <span>{driverDisplayLabel(driver)}</span>
              </button>
            </div>
          )
        })}
      </div>
      {card ? (
        <div
          className={`dispatcher-overlay liftable${lift.dragging ? ' dragging' : ''}`}
          style={lift.lift > 0 || lift.settling ? { top: -lift.lift, height: `calc(100% + ${lift.lift}px)`, zIndex: 8 } : undefined}
          onTransitionEnd={(event) => {
            if (event.propertyName !== 'top' || event.target !== event.currentTarget) {
              return
            }
            lift.settle()
          }}
        >
          <div
            className="dispatcher-card-lift"
            role="separator"
            aria-orientation="horizontal"
            aria-label={assignDesk ? '拖动调整调度员详情高度' : '拖动调整司导详情高度'}
            onPointerDown={lift.begin}
          />
          {card}
        </div>
      ) : null}
    </section>
  )
}

/** 派给调度：打开的调度员卡片，列出他接手的本公司订单（未完成 / 已完成），可写公司备注。 */
export function DispatcherPoolCard({
  person,
  orders,
  filter,
  onFilterChange,
  notes,
  onNotesChange,
  onNotesSave,
  onClose,
  onHide,
  onHeadPointerDown,
  renderOrderTile,
}: {
  person: BoardPerson
  orders: Order[]
  filter: PoolFilter
  onFilterChange: (filter: PoolFilter) => void
  notes: string
  onNotesChange: (value: string) => void
  onNotesSave: () => void
  onClose: () => void
  onHide: () => void
  onHeadPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  renderOrderTile: (order: Order) => ReactNode
}) {
  return (
    <DispatcherDayCard
      title={`${person.name} 的订单`}
      onHeadPointerDown={onHeadPointerDown}
      subtitle={orders.length > 0 ? `${orders.length} 单` : filter === 'open' ? '没有未完成的单' : '没有已完成的单'}
      notes={notes}
      onNotesChange={onNotesChange}
      onNotesSave={onNotesSave}
      notesLabel="公司备注"
      notesPlaceholder="仅公司可见，调度看不到"
      onClose={onClose}
      onRemove={onHide}
      removeLabel="隐藏"
    >
      <div className="dispatcher-filters">
        <button type="button" className={`dispatcher-chip${filter === 'open' ? ' active' : ''}`} onClick={() => onFilterChange('open')}>
          未完成订单
        </button>
        <button type="button" className={`dispatcher-chip${filter === 'done' ? ' active' : ''}`} onClick={() => onFilterChange('done')}>
          已完成订单
        </button>
      </div>
      <div className="dispatcher-grid">
        {orders.length === 0 ? <p className="dispatcher-empty">暂无订单</p> : null}
        {orders.map((order) => renderOrderTile(order))}
      </div>
    </DispatcherDayCard>
  )
}

/** 司导卡片里的驾照照片：自己的卡片可以上传、更换、删除；别人的只看，没有照片时不显示。 */
function DriverLicense({ driverId, canManage, busy }: { driverId: string; canManage: boolean; busy: boolean }) {
  const [photos, setPhotos] = useState<LicensePhoto[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    licenseApi
      .listForDriver(driverId)
      .then((list) => !cancelled && setPhotos(list))
      .catch(() => !cancelled && setPhotos([]))
    return () => {
      cancelled = true
    }
  }, [driverId])

  async function reload() {
    setPhotos(await licenseApi.listForDriver(driverId))
    setTick((current) => current + 1)
  }

  if (!canManage && photos.length === 0) {
    return null
  }
  return (
    <LicenseGallery
      photos={photos}
      caption="驾照"
      urlFor={(photo) => `${licenseApi.driverUrl(driverId, photo.id)}?v=${tick}`}
      canManage={canManage}
      busy={busy}
      onUpload={async (side, file) => {
        await licenseApi.upload(side, file)
        await reload()
      }}
      onReplace={async (photoId, file) => {
        await licenseApi.replace(photoId, file)
        await reload()
      }}
      onRemove={async (photoId) => {
        await licenseApi.remove(photoId)
        await reload()
      }}
    />
  )
}

/** 调度台：打开的司导卡片，是这位司导的行程日历，带联系方式、备注和驾照。 */
export function DriverDetailCard({
  person,
  isSelf,
  busy,
  marks,
  rangeStart,
  rangeEnd,
  bodyRef,
  onBodyScroll,
  notes,
  onNotesChange,
  onNotesSave,
  onClose,
  onHide,
  onCardPointerDown,
  onDayClick,
  onDayPointerDown,
  dragConflict,
}: {
  person: BoardPerson
  /** 这张卡片是登录用户自己（可以管理驾照照片）。 */
  isSelf: boolean
  busy: boolean
  marks: CalendarMark[]
  rangeStart: string
  rangeEnd: string
  bodyRef: Ref<HTMLDivElement>
  onBodyScroll?: () => void
  notes: string
  onNotesChange: (value: string) => void
  onNotesSave: () => void
  onClose: () => void
  onHide: () => void
  onCardPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onDayClick: (mark: CalendarMark, anchor: HTMLButtonElement) => void
  onDayPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, mark: CalendarMark) => void
  dragConflict: boolean
}) {
  return (
    <DispatcherCalendarCard
      inkBar
      title={person.name}
      onCardPointerDown={onCardPointerDown}
      meta={`联系方式 ${contactLabel(person.contact)}`}
      bodyRef={bodyRef}
      bodyKey="driver"
      onBodyScroll={onBodyScroll}
      subtitle={marks.length > 0 ? `${marks.length} 天有行程` : '暂无行程'}
      marks={marks}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      notes={notes}
      onNotesChange={onNotesChange}
      onNotesSave={onNotesSave}
      notesExtra={<DriverLicense driverId={person.id} canManage={isSelf} busy={busy} />}
      onClose={onClose}
      onRemove={onHide}
      onDayClick={onDayClick}
      dragConflict={dragConflict}
      onDayPointerDown={onDayPointerDown}
    />
  )
}
