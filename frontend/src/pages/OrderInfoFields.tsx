import { createContext, useCallback, useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { message } from 'antd'
import { companyApi } from '../api/auth'
import { updateOrderInfo } from '../api/orders'
import { useAuthenticatedAuth } from '../auth/authState'
import { formatMonthDay } from '../localDate'
import { ORDER_ISLANDS, orderDisplayLabel } from '../orderFlags'
import type { CompanySearch, Order } from '../types'
import { OrderFilesBlock } from './OrderFilesBlock'
import './dispatcher/dispatcher.css'
import { NoteIcon } from './icons'

export function privateOrderNoteCopy(role: string) {
  if (role === 'driver') {
    return { label: '司导备注', placeholder: '仅自己可见，调度看不到' }
  }
  if (role === 'company') {
    return { label: '公司备注', placeholder: '仅公司可见，调度和司导看不到' }
  }
  return { label: '调度备注', placeholder: '仅调度可见，司导看不到' }
}

/**
 * 卡片头上「保存」的位置：所有创建、修改的「保存」都放在关闭按钮左边。
 * 卡片（订单卡、司导卡、车辆卡、当日卡片、公司信息订单弹框）在头上关闭按钮左边留一个空位，通过这个 context 交给里面的编辑区；
 * 编辑区的「保存」就画到这个空位里。没有空位时（不在卡片里）照旧画在「订单信息」标题那一行。
 */
export const SaveSlotContext = createContext<HTMLElement | null>(null)

/** 卡片头上关闭按钮左边的空位：先渲染这个，再渲染关闭按钮。 */
export function SaveSlot({ onSlot }: { onSlot: (element: HTMLElement | null) => void }) {
  return <span className="card-save-slot" ref={onSlot} />
}

const sharedOrderNoteLabel = '共用备注'
const sharedOrderNotePlaceholder = '公司、调度员和司导都能看到'

export function OrderInfoFields({
  heading = '订单信息',
  subtitle,
  platformOrderNo,
  onPlatformOrderNoChange,
  notes,
  onNotesChange,
  sharedNotes,
  onSharedNotesChange,
  onSave,
  afterSave,
  saveDisabled,
  extra,
  className,
  autoFocus,
  notesLabel,
  notesPlaceholder,
  companyId,
  companyName,
  onCompanyChange,
  basics,
}: {
  heading?: ReactNode
  subtitle?: string
  platformOrderNo?: string
  onPlatformOrderNoChange?: (value: string) => void
  notes?: string
  onNotesChange?: (value: string) => void
  sharedNotes?: string
  onSharedNotesChange?: (value: string) => void
  /** 返回 false 表示没保存成功。失焦时也会调用。 */
  onSave?: () => void | boolean | Promise<boolean | void>
  /** 点「保存」且保存成功后调用（例如收起编辑、回到详情）。失焦保存不调用。 */
  afterSave?: () => void
  saveDisabled?: boolean
  extra?: ReactNode
  className?: string
  autoFocus?: boolean
  notesLabel?: string
  notesPlaceholder?: string
  companyId?: string | null
  companyName?: string | null
  onCompanyChange?: (companyId: string, companyName: string) => void
  /** 人数、车型、南/北岛（订单记录里用来区分订单）；不传就不显示。 */
  basics?: OrderBasicsValue & { onChange: (next: OrderBasicsValue) => void }
}) {
  const { user } = useAuthenticatedAuth()
  const canEditOrder = Boolean(onPlatformOrderNoChange)
  const blurSave = canEditOrder || onSharedNotesChange ? undefined : onSave
  const canBindCompany = Boolean(onCompanyChange) && user.role === 'dispatcher'
  const showCompany = canBindCompany || (canEditOrder && (user.role === 'company' || companyName))
  const privateCopy = privateOrderNoteCopy(user.role)
  const resolvedNotesLabel = notesLabel ?? (canEditOrder ? privateCopy.label : '备注')
  const resolvedNotesPlaceholder = notesPlaceholder ?? (canEditOrder ? privateCopy.placeholder : '给这个司导写备注')

  const saveSlot = useContext(SaveSlotContext)
  const saveButton = onSave ? (
    <button
      type="button"
      className="dispatcher-chip card-save"
      disabled={saveDisabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        void Promise.resolve(onSave()).then((saved) => {
          if (saved !== false) {
            afterSave?.()
          }
        })
      }}
    >
      保存
    </button>
  ) : null

  return (
    <div className={`dispatcher-notes${className ? ` ${className}` : ''}`} onPointerDown={(event) => event.stopPropagation()}>
      {saveButton && saveSlot ? createPortal(saveButton, saveSlot) : null}
      {heading || (saveButton && !saveSlot) ? (
        <span>
          {heading}
          {saveSlot ? null : saveButton}
        </span>
      ) : null}
      {subtitle ? <p className="dispatcher-notes-sub">{subtitle}</p> : null}
      {showCompany ? (
        <OrderCompanyField
          companyId={companyId}
          companyName={companyName}
          editable={canBindCompany}
          onCompanyChange={onCompanyChange}
        />
      ) : null}
      {canEditOrder ? (
        <label className="dispatcher-notes-field">
          公司订单号
          <input
            value={platformOrderNo ?? ''}
            autoFocus={autoFocus}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onPlatformOrderNoChange?.(event.target.value)}
            placeholder="平台/公司订单号，可为空"
          />
        </label>
      ) : null}
      {basics ? <OrderBasicsFields {...basics} /> : null}
      {onSharedNotesChange ? (
        <NoteBox
          label={sharedOrderNoteLabel}
          value={sharedNotes ?? ''}
          placeholder={sharedOrderNotePlaceholder}
          autoFocus={autoFocus && !canEditOrder}
          onChange={onSharedNotesChange}
          onBlur={blurSave}
        />
      ) : null}
      {onNotesChange ? (
        <NoteBox
          label={resolvedNotesLabel}
          value={notes ?? ''}
          placeholder={resolvedNotesPlaceholder}
          autoFocus={autoFocus && !canEditOrder && !onSharedNotesChange}
          onChange={onNotesChange}
          onBlur={blurSave}
        />
      ) : null}
      {extra}
    </div>
  )
}

export interface OrderBasicsValue {
  /** 输入框里的文字，空表示 0。 */
  guestCount: string
  vehicleType: string
  island: string | null
}

export function orderBasicsOf(order: { guestCount?: number | null; vehicleType?: string | null; island?: string | null }): OrderBasicsValue {
  return {
    guestCount: order.guestCount ? String(order.guestCount) : '',
    vehicleType: order.vehicleType ?? '',
    island: order.island ?? null,
  }
}

/** 写回接口时的值：人数空为 0。 */
export function orderBasicsFields(value: OrderBasicsValue) {
  return {
    guestCount: /^\d+$/.test(value.guestCount.trim()) ? Number(value.guestCount.trim()) : 0,
    vehicleType: value.vehicleType,
    island: value.island,
  }
}

/** 人数下拉框的常用选项；其他人数选「…」再输入。 */
const GUEST_CHOICES = ['2', '3', '4', '5', '6'] as const
/** 车型下拉框的常用选项；其他车型（如「7座阿尔法」）选「…」再输入。 */
const VEHICLE_CHOICES = ['5座', '7座', '12座'] as const

function OrderBasicsFields({ guestCount, vehicleType, island, onChange }: OrderBasicsValue & { onChange: (next: OrderBasicsValue) => void }) {
  const value = { guestCount, vehicleType, island }
  return (
    <div className="order-basics">
      <label className="dispatcher-notes-field order-basics-guests">
        人数
        <ChoiceField
          label="人数"
          value={guestCount}
          choices={GUEST_CHOICES}
          numeric
          maxLength={3}
          onChange={(next) => onChange({ ...value, guestCount: next.replace(/\D/g, '') })}
        />
      </label>
      <label className="dispatcher-notes-field order-basics-vehicle">
        车型
        <ChoiceField
          label="车型"
          value={vehicleType}
          choices={VEHICLE_CHOICES}
          maxLength={50}
          placeholder="如 7座阿尔法"
          onChange={(next) => onChange({ ...value, vehicleType: next })}
        />
      </label>
      <label className="dispatcher-notes-field order-basics-island">
        南/北岛
        <IslandToggle island={island} onChange={(next) => onChange({ ...value, island: next })} />
      </label>
    </div>
  )
}

const OTHER = '…'

/**
 * 下拉框选常用值，最后一项「…」改成输入框自己填。
 * 已有的值不在选项里（例如「7座阿尔法」「1」）时直接显示输入框；输入框右边的小箭头回到下拉框。
 */
export function ChoiceField({
  label,
  value,
  choices,
  numeric = false,
  maxLength,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  choices: readonly string[]
  numeric?: boolean
  maxLength?: number
  placeholder?: string
  onChange: (next: string) => void
}) {
  const [typing, setTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // 值不在选项里（已有的「7座阿尔法」，或换了一张单）就一定显示输入框，不会显示成「—」把原值藏起来。
  const custom = value.trim() !== '' && !choices.includes(value.trim())

  if (typing || custom) {
    return (
      <span className="choice-field typing">
        <input
          ref={inputRef}
          value={value}
          inputMode={numeric ? 'numeric' : undefined}
          maxLength={maxLength}
          placeholder={placeholder ?? (numeric ? '输入人数' : '')}
          aria-label={label}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="choice-field-back"
          aria-label={`改回从列表里选${label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            setTyping(false)
            if (!choices.includes(value.trim())) {
              onChange('')
            }
          }}
        >
          ▾
        </button>
      </span>
    )
  }

  return (
    <select
      className="choice-field-select"
      aria-label={label}
      value={choices.includes(value.trim()) ? value.trim() : ''}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        if (event.target.value === OTHER) {
          setTyping(true)
          onChange('')
          // 换成输入框后直接可以打字。
          window.requestAnimationFrame(() => inputRef.current?.focus())
          return
        }
        onChange(event.target.value)
      }}
    >
      <option value="">—</option>
      {choices.map((choice) => (
        <option key={choice} value={choice}>
          {choice}
        </option>
      ))}
      <option value={OTHER}>{OTHER}</option>
    </select>
  )
}

/** 南/北岛：不是主要信息，一个按钮，按一下换一个（南岛 → 北岛 → 南北岛 → 南岛）。没填按南岛。 */
export function IslandToggle({ island, onChange }: { island: string | null | undefined; onChange: (next: string) => void }) {
  const index = Math.max(0, ORDER_ISLANDS.findIndex((item) => item.value === island))
  const next = ORDER_ISLANDS[(index + 1) % ORDER_ISLANDS.length]
  return (
    <button
      type="button"
      className="island-toggle"
      aria-label={`南/北岛：${ORDER_ISLANDS[index].label}，点一下换成${next.label}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => onChange(next.value)}
    >
      {ORDER_ISLANDS[index].label}
    </button>
  )
}

function NoteBox({
  label,
  value,
  placeholder,
  autoFocus,
  onChange,
  onBlur,
}: {
  label: string
  value: string
  placeholder?: string
  autoFocus?: boolean
  onChange: (value: string) => void
  onBlur?: () => void
}) {
  return (
    <label className="dispatcher-notes-field">
      {label}
      <textarea
        className="note-line"
        value={value}
        rows={1}
        autoFocus={autoFocus}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
      />
    </label>
  )
}

function OrderCompanyField({
  companyId,
  companyName,
  editable,
  onCompanyChange,
}: {
  companyId?: string | null
  companyName?: string | null
  editable: boolean
  onCompanyChange?: (companyId: string, companyName: string) => void
}) {
  const [keyword, setKeyword] = useState('')
  const [hits, setHits] = useState<CompanySearch[]>([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)

  async function search() {
    const name = keyword.trim()
    if (!name) {
      return
    }
    setBusy(true)
    try {
      setSearched(true)
      setHits(await companyApi.search(name))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '搜索公司失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dispatcher-notes-field">
      所属公司
      <p className="dispatcher-notes-sub">{companyName || (companyId ? '已绑定' : '尚未绑定公司')}</p>
      {editable ? (
        <>
          <div className="dispatcher-company-search">
            <input
              value={keyword}
              placeholder="搜索公司名称"
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => {
                setKeyword(event.target.value)
                setSearched(false)
                setHits([])
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void search()
                }
              }}
            />
            <button type="button" className="dispatcher-chip" disabled={busy} onClick={() => void search()}>
              搜索
            </button>
          </div>
          {hits.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dispatcher-chip${item.id === companyId ? ' active' : ''}`}
              onClick={() => {
                onCompanyChange?.(item.id, item.name)
                setHits([])
                setKeyword('')
                setSearched(false)
              }}
            >
              {item.name}
            </button>
          ))}
          {searched && hits.length === 0 && !busy ? <p className="dispatcher-notes-sub">没有匹配的公司</p> : null}
        </>
      ) : null}
    </div>
  )
}


function OrderNotesPreview({ sharedNotes, notes }: { sharedNotes?: string | null; notes?: string | null }) {
  if (!sharedNotes && !notes) {
    return null
  }
  return (
    <>
      {sharedNotes ? <p className="dispatcher-notes-preview">{sharedNotes}</p> : null}
      {notes ? <p className="dispatcher-notes-preview">{notes}</p> : null}
    </>
  )
}

export function OrderInfoPanel({
  title,
  subtitle,
  meta,
  notes,
  sharedNotes,
  open,
  onOpenChange,
  editable,
  editLabel = '编辑订单',
  onEdit,
  onHeadPointerDown,
  extraActions,
  trailing,
  onSaveSlot,
  children,
}: {
  title: ReactNode
  subtitle?: string
  meta?: string | null
  notes?: string | null
  sharedNotes?: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  editable?: boolean
  editLabel?: string
  onEdit?: () => void
  onHeadPointerDown?: (event: PointerEvent<HTMLElement>) => void
  extraActions?: ReactNode
  trailing?: ReactNode
  /** 头上关闭按钮左边「保存」的空位；卡片把它交给卡片里的编辑区（`SaveSlotContext`）。 */
  onSaveSlot?: (element: HTMLElement | null) => void
  children?: ReactNode
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null)
  const onSaveSlotRef = useRef(onSaveSlot)
  useEffect(() => {
    onSaveSlotRef.current = onSaveSlot
  })
  // 回调要稳定：每次渲染换一个新函数，React 会反复先传 null 再传元素。
  const slotRef = useCallback((element: HTMLElement | null) => {
    setSaveSlot(element)
    onSaveSlotRef.current?.(element)
  }, [])
  const notesOpen = onOpenChange ? Boolean(open) : localOpen

  function toggle() {
    const next = !notesOpen
    if (onOpenChange) {
      onOpenChange(next)
    } else {
      setLocalOpen(next)
    }
  }

  return (
    <header className={`dispatcher-card-head${onHeadPointerDown ? ' draggable' : ''}`} onPointerDown={onHeadPointerDown}>
      <div className="order-info-main">
        <div className="dispatcher-card-title">
          <strong>{title}</strong>
          {editable ? (
            <button
              type="button"
              className="dispatcher-icon-btn note"
              aria-label={onEdit ? editLabel : notesOpen ? '收起编辑' : editLabel}
              aria-expanded={onEdit ? undefined : notesOpen}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onEdit ?? toggle}
            >
              <NoteIcon />
            </button>
          ) : null}
          {extraActions}
        </div>
        {meta ? <p className="dispatcher-card-meta">{meta}</p> : null}
        {editable && notesOpen ? (
          <SaveSlotContext.Provider value={saveSlot}>{children}</SaveSlotContext.Provider>
        ) : (
          <OrderNotesPreview sharedNotes={sharedNotes} notes={notes} />
        )}
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="card-head-actions">
        <SaveSlot onSlot={slotRef} />
        {trailing}
      </div>
    </header>
  )
}

interface OrderInfoEditorProps {
  order: Order
  onSaved: () => void | Promise<void>
  extraActions?: ReactNode
  meta?: string | null
}

export function OrderInfoEditor(props: OrderInfoEditorProps) {
  const { order } = props
  const version = `${order.id}:${order.platformOrderNo ?? ''}:${order.sharedNotes ?? ''}:${order.driverNotes ?? ''}:${order.files.length}`
  return <OrderInfoEditorState key={version} {...props} />
}

function OrderInfoEditorState({ order, onSaved, extraActions, meta }: OrderInfoEditorProps) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(order.driverNotes ?? '')
  const [sharedNotes, setSharedNotes] = useState(order.sharedNotes ?? '')

  async function save() {
    try {
      const saved = await updateOrderInfo(order, { driverNotes: notes, sharedNotes })
      setNotes(saved.driverNotes ?? '')
      setSharedNotes(saved.sharedNotes ?? '')
      message.success('订单已保存')
      setOpen(false)
      await onSaved()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存订单失败')
    }
  }

  return (
    <OrderInfoPanel
      title={orderDisplayLabel(order)}
      meta={meta}
      subtitle={`${formatMonthDay(order.startDate)}${order.endDate ? ` 至 ${formatMonthDay(order.endDate)}` : ''} · ${order.dayCount} 天`}
      notes={notes}
      sharedNotes={sharedNotes}
      open={open}
      onOpenChange={setOpen}
      editable
      extraActions={extraActions}
    >
      <OrderInfoFields
        heading="订单信息"
        notes={notes}
        onNotesChange={setNotes}
        sharedNotes={sharedNotes}
        onSharedNotesChange={setSharedNotes}
        notesLabel={privateOrderNoteCopy('driver').label}
        notesPlaceholder={privateOrderNoteCopy('driver').placeholder}
        onSave={() => void save()}
        extra={
          <>
          <label className="dispatcher-notes-field">
            订单截图
            <OrderFilesBlock
              compact
              orderId={order.id}
              files={order.files ?? []}
              onChanged={() => void onSaved()}
            />
          </label>
          </>
        }
      />
    </OrderInfoPanel>
  )
}

export function OrderDetailNotes({
  order,
  role,
  onSaved,
}: {
  order: Order
  role: string
  onSaved: (order: Order) => void | Promise<void>
}) {
  const privateNotes = role === 'driver' ? order.driverNotes ?? '' : order.notes ?? ''
  const version = `${order.id}:${order.sharedNotes ?? ''}:${privateNotes}:${JSON.stringify(orderBasicsOf(order))}`
  return <OrderDetailNotesState key={version} order={order} role={role} privateNotes={privateNotes} onSaved={onSaved} />
}

function OrderDetailNotesState({
  order,
  role,
  privateNotes,
  onSaved,
}: {
  order: Order
  role: string
  privateNotes: string
  onSaved: (order: Order) => void | Promise<void>
}) {
  const copy = privateOrderNoteCopy(role)
  const [sharedNotes, setSharedNotes] = useState(order.sharedNotes ?? '')
  const [notes, setNotes] = useState(privateNotes)
  // 人数、车型、南/北岛只有调度员和公司账户能改。
  const [basics, setBasics] = useState(() => orderBasicsOf(order))
  const editsBasics = role !== 'driver'

  async function save() {
    try {
      const saved = await updateOrderInfo(
        order,
        role === 'driver'
          ? { driverNotes: notes, sharedNotes }
          : { notes, sharedNotes, ...orderBasicsFields(basics) },
      )
      message.success('订单已保存')
      await onSaved(saved)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存订单失败')
    }
  }

  return (
    <OrderInfoFields
      heading="订单信息"
      sharedNotes={sharedNotes}
      onSharedNotesChange={setSharedNotes}
      notes={notes}
      onNotesChange={setNotes}
      notesLabel={copy.label}
      notesPlaceholder={copy.placeholder}
      basics={editsBasics ? { ...basics, onChange: setBasics } : undefined}
      onSave={() => void save()}
    />
  )
}
