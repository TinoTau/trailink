import { useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { message } from 'antd'
import { PRESET_COLORS } from '../../calendarUi'
import { formatMonthDay } from '../../localDate'
import { orderDisplayLabel } from '../../orderFlags'
import type { ItineraryDay, Order } from '../../types'
import { DriverDayEditor } from '../driver/DriverDayEditor'
import { OrderFilesBlock } from '../OrderFilesBlock'
import { DeskHint } from './BoardParts'
import type { DragState } from './boardDrag'
import { DispatcherCalendarCard, DispatcherDayCard, type CalendarMark } from './DispatcherCalendarCard'
import type { useOrderInfoDraft } from './useOrderInfoDraft'

export type OrderFilter = 'unassigned' | 'all'
export type VehicleFilter = 'available' | 'all'
export type OrderPaneTab = 'orders' | 'vehicles'

type BeginPointer = (event: ReactPointerEvent, next: DragState) => void

/** 订单区里的「创建订单」日历。 */
export interface CreateOrderProps {
  from: string | null
  to: string | null
  rangeStart: string
  rangeEnd: string
  bodyRef: Ref<HTMLDivElement>
  busy: boolean
  onClose: () => void
  onDatePointerDown: (date: string) => void
  onDateTouchHold: (date: string, x: number, y: number, target: HTMLElement, pointerId: number) => void
  onDatePointerEnter: (date: string) => void
  onSubmit: () => void
}

/** 订单区里打开的那张订单：订单日历，或点某一天后的当日卡片。 */
export interface SelectedOrderProps {
  order: Order
  day: ItineraryDay | null
  editorDay: Parameters<typeof DriverDayEditor>[0]['day'] | null
  assignDesk: boolean
  subtitle: string
  marks: CalendarMark[]
  rangeStart: string
  rangeEnd: string
  bodyRef: Ref<HTMLDivElement>
  onBodyScroll: () => void
  infoOpen: boolean
  onInfoOpenChange: (open: boolean) => void
  draft: ReturnType<typeof useOrderInfoDraft>
  removeLabel: string
  onRemove: () => void
  onClose: () => void
  onBackToCalendar: () => void
  onChanged: () => Promise<void>
  beginPointer: BeginPointer
}

function CreateOrderCard({ from, to, rangeStart, rangeEnd, bodyRef, busy, onClose, onDatePointerDown, onDateTouchHold, onDatePointerEnter, onSubmit }: CreateOrderProps) {
  return (
    <DispatcherCalendarCard
      title="创建订单"
      subtitle="触屏按住不动约 0.5 秒再拖选，鼠标按下即拖。拖到上下边缘时日历跟着滚动。"
      marks={[]}
      selectable
      pickFrom={from}
      pickTo={to}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      bodyRef={bodyRef}
      onClose={onClose}
      onDatePointerDown={onDatePointerDown}
      onDateTouchHold={onDateTouchHold}
      onDatePointerEnter={onDatePointerEnter}
      footer={
        from && to ? (
          <button type="button" className="driver-primary-button" disabled={busy} onClick={onSubmit}>
            添加 {formatMonthDay(from)}
            {from !== to ? `–${formatMonthDay(to)}` : ''} 仅日期
          </button>
        ) : (
          <p className="dispatcher-hint">不知道订单号时，触屏按住不动约 0.5 秒再拖选起止日期，鼠标按下即拖。拖到上下边缘时日历跟着滚动。</p>
        )
      }
    />
  )
}

function SelectedOrderCard({
  order,
  day,
  editorDay,
  assignDesk,
  subtitle,
  marks,
  rangeStart,
  rangeEnd,
  bodyRef,
  onBodyScroll,
  infoOpen,
  onInfoOpenChange,
  draft,
  removeLabel,
  onRemove,
  onClose,
  onBackToCalendar,
  onChanged,
  beginPointer,
}: SelectedOrderProps) {
  if (editorDay && day) {
    return (
      <DispatcherDayCard
        title={[orderDisplayLabel(order), formatMonthDay(day.serviceDate)].filter(Boolean).join(' · ')}
        subtitle={day.driverName ? `${day.driverName} · 当日行程` : '当日行程'}
        onClose={onBackToCalendar}
        closeLabel="返回日历"
      >
        <DriverDayEditor key={editorDay.items[0].itineraryDayId} day={editorDay} onChanged={onChanged} />
      </DispatcherDayCard>
    )
  }
  return (
    <DispatcherCalendarCard
      title={orderDisplayLabel(order)}
      bodyRef={bodyRef}
      bodyKey="order"
      onBodyScroll={onBodyScroll}
      subtitle={subtitle}
      marks={marks}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      infoOpen={infoOpen}
      onInfoOpenChange={onInfoOpenChange}
      platformOrderNo={draft.platformNo}
      onPlatformOrderNoChange={draft.changePlatformNo}
      companyId={draft.companyId}
      companyName={draft.companyName}
      onCompanyChange={assignDesk ? undefined : (id, name) => void draft.changeCompany(id, name)}
      notes={draft.notes}
      onNotesChange={draft.changeNotes}
      sharedNotes={draft.sharedNotes}
      onSharedNotesChange={draft.changeSharedNotes}
      onNotesSave={() => {
        void draft.save()
      }}
      notesExtra={
        <label className="dispatcher-notes-field">
          订单截图
          <OrderFilesBlock compact orderId={order.id} files={order.files ?? []} onChanged={() => void onChanged()} />
        </label>
      }
      onRemove={onRemove}
      removeLabel={removeLabel}
      onClose={onClose}
      onCardPointerDown={(event) => beginPointer(event, { kind: 'order', id: order.id, x: event.clientX, y: event.clientY })}
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
  )
}

/**
 * 调度台上半部分：订单区（派给调度只有订单）。
 * <ul>
 * <li>调度台可切换「订单 / 车辆」。车辆区由页面传入（vehicleBoard）。</li>
 * <li>订单：创建订单、未分配 / 所有订单、已分配颜色；订单图标；打开的订单或创建订单日历盖在图标上面。</li>
 * <li>从司导卡片拖回这里是取消分配（data-order-pane），悬停时高亮（drop）。</li>
 * </ul>
 */
const HINT_ASSIGN =
  '这里把本公司订单整单分给一位调度员。同一时间只能分给一个人。触屏拖动订单或调度员前先按住约 0.5 秒，否则上下滑动是在滚动区域；鼠标按下即可拖。订单详情里，没有订单的日期直接拖动是滑动日历；有订单的日期直接拖动是整单交给调度员。按住约 0.5 秒再拖这一天，松在调度员上仍是整单，调度分配不按天。从调度员订单池拖回订单区即整单收回，已经派给司导的日期也会取消。未分配是还没派给调度员的单。点开订单看日历，日期上标的是司导。点开调度员可看他未完成和已完成的单，并写公司备注。'
const HINT_VEHICLES =
  '没有置顶的车辆按车牌字母顺序排列，置顶的保持置顶顺序。添加车辆后点图标打开车辆日历，左上角是车牌。编辑打开车辆详情，垃圾桶先套红框再点一次才删除。照片、停用和详情高度都在编辑里。点小图时详情撑到页面底部再看大图。已绑定的日期用订单里选的已分配颜色填上，并写司导名字。打开时今天这一行垂直居中。日历从半年前画到半年后。司导日历也开着时，滑动司导日历会带动车辆日历，车辆日历自己滑动不会带动司导。点车辆日历的日期打开该司导并跳到这一天；点司导日历里已绑车辆的日期打开该车并跳到这一天。同一天两张订单用了同一辆车时，车辆日历这一天标红。点开后弹出和订单冲突一样的图案选择，司导日历收起，涉及的司导图标换成对应图案。再点一次才解除这一天该车和这张订单的绑定。触屏拖动车辆图标或车辆日历前先按住约 0.5 秒，鼠标按下即可拖。司导日历没打开时，拖到司导图标上先打开日历。日历已经打开时，拖到该司导的订单上：整单绑定还没有车的日期，拆单只绑定这一段还没有车的日期。这些日期都已经有车时不分配，并提示该订单已经绑定了其他车辆。车辆管理时，司导日历只做车辆操作。直接拖回车辆区解除这张订单的车辆，按住约 0.5 秒再拖只解除当天。只能改自己分配的日期。还没有车时日期上写未配车，绑上车后改成车牌。别人的日期不写字，也不能拖。'
const HINT_ORDERS =
  '创建订单与司导界面相同：触屏按住不动约 0.5 秒再拖选起止日期，鼠标按下即拖。拖到日历上下边缘时，日历跟着滚动。日历从半年前画到半年后，打开时停在今天或这张订单的日期。触屏拖动订单或司导前先按住约 0.5 秒，否则上下滑动是在滚动区域。订单和司导详情里，没有订单的日期直接拖动是滑动日历；有订单的日期直接拖动是整单，按住约 0.5 秒再拖是这一天。鼠标按下即可拖某一天。新建单不自动绑定所属公司，点开后搜索绑定。未分配是还有空日期的单，以及同一司导日期重叠的冲突单，过期未派完也在这里。点击订单看日历，可改所属公司、公司订单号和备注。已派给司导的订单会同时打开该司导，并跳到对应日期；拆单打开第一个已派日期的司导。改绑后新公司能在派给调度里看到。点击某一天编辑行程。从司导卡片拖回订单区：鼠标按是否拆单决定，拆单只取消那天，未拆单取消整单。触屏直接拖有订单的日期取消整单，按住约 0.5 秒再拖只取消当天。其他人分配的日期也会显示，但不写公司或调度员的名字，不能拖动，也不能移除。已派完且结束的单不出现在这里，只在公司信息里查看。'

export function OrderPane({
  assignDesk,
  tab,
  onTabChange,
  drop,
  addingVehicle,
  onAddVehicle,
  vehicleFilter,
  onVehicleFilterChange,
  vehicleBoard,
  creatingOrder,
  onToggleCreate,
  filter,
  onFilterChange,
  assignedColor,
  onAssignedColorChange,
  orders,
  renderOrderTile,
  create,
  selected,
}: {
  assignDesk: boolean
  tab: OrderPaneTab
  onTabChange: (tab: OrderPaneTab) => void
  drop: boolean
  addingVehicle: boolean
  onAddVehicle: () => void
  vehicleFilter: VehicleFilter
  onVehicleFilterChange: (filter: VehicleFilter) => void
  vehicleBoard: ReactNode
  creatingOrder: boolean
  onToggleCreate: () => void
  filter: OrderFilter
  onFilterChange: (filter: OrderFilter) => void
  assignedColor: string
  onAssignedColorChange: (color: string) => void
  orders: Order[]
  renderOrderTile: (order: Order) => ReactNode
  create: CreateOrderProps
  selected: SelectedOrderProps | null
}) {
  const [showColors, setShowColors] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  const vehicles = tab === 'vehicles' && !assignDesk
  return (
    <section className={`dispatcher-pane${drop ? ' drop' : ''}`} data-order-pane="true">
      <div className={`dispatcher-pane-bar${assignDesk ? ' assign' : ''}`}>
        {assignDesk ? <h2>订单</h2> : (
          <div className="dispatcher-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'orders'}
              className={`dispatcher-tab${tab === 'orders' ? ' active' : ''}`}
              onClick={() => onTabChange('orders')}
            >
              订单
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'vehicles'}
              className={`dispatcher-tab${tab === 'vehicles' ? ' active' : ''}`}
              onClick={() => onTabChange('vehicles')}
            >
              车辆
            </button>
          </div>
        )}
        <div className="dispatcher-filters">
          {vehicles ? (
            <>
              <button type="button" className={`dispatcher-chip${addingVehicle ? ' active' : ''}`} onClick={onAddVehicle}>
                添加车辆
              </button>
              <button
                type="button"
                className={`dispatcher-chip${vehicleFilter === 'available' ? ' active' : ''}`}
                onClick={() => onVehicleFilterChange('available')}
              >
                可用车辆
              </button>
              <button
                type="button"
                className={`dispatcher-chip${vehicleFilter === 'all' ? ' active' : ''}`}
                onClick={() => onVehicleFilterChange('all')}
              >
                所有车辆
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`dispatcher-chip${creatingOrder ? ' active' : ''}`} onClick={onToggleCreate}>
                创建订单
              </button>
              <button
                type="button"
                className={`dispatcher-chip${filter === 'unassigned' ? ' active' : ''}`}
                onClick={() => {
                  onFilterChange('unassigned')
                  setShowColors(false)
                }}
              >
                未分配订单
              </button>
              <button
                type="button"
                className={`dispatcher-chip${filter === 'all' ? ' active' : ''}`}
                onClick={() => onFilterChange('all')}
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
      {tab !== 'vehicles' && filter === 'all' && showColors ? (
        <div className="dispatcher-swatches">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`dispatcher-swatch${assignedColor === color ? ' selected' : ''}`}
              style={{ background: color }}
              aria-label={color}
              onClick={() => onAssignedColorChange(color)}
            />
          ))}
        </div>
      ) : null}
      <DeskHint
        open={hintOpen}
        onToggle={() => setHintOpen((current) => !current)}
        text={assignDesk ? HINT_ASSIGN : tab === 'vehicles' ? HINT_VEHICLES : HINT_ORDERS}
      />
      {vehicles ? (
        vehicleBoard
      ) : (
        <>
          <div className="dispatcher-grid">
            {orders.length === 0 ? <p className="dispatcher-empty">暂无订单</p> : null}
            {orders.map((order) => renderOrderTile(order))}
          </div>
          {creatingOrder ? (
            <div className="dispatcher-overlay">
              <CreateOrderCard {...create} />
            </div>
          ) : selected ? (
            <div className="dispatcher-overlay">
              <SelectedOrderCard {...selected} />
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
