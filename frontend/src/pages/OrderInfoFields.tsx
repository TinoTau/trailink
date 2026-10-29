import { useState, type PointerEvent, type ReactNode } from 'react'
import { message } from 'antd'
import { companyApi } from '../api/auth'
import { updateOrderInfo } from '../api/orders'
import { useAuthenticatedAuth } from '../auth/authState'
import { formatMonthDay } from '../localDate'
import { orderDisplayLabel } from '../orderFlags'
import type { CompanySearch, Order } from '../types'
import { OrderFilesBlock } from './OrderFilesBlock'
import './dispatcher/dispatcher.css'

export function privateOrderNoteCopy(role: string) {
  if (role === 'driver') {
    return { label: '司导备注', placeholder: '仅自己可见，调度看不到' }
  }
  if (role === 'company') {
    return { label: '公司备注', placeholder: '仅公司可见，调度和司导看不到' }
  }
  return { label: '调度备注', placeholder: '仅调度可见，司导看不到' }
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
  extra,
  autoFocus,
  notesLabel,
  notesPlaceholder,
  companyId,
  companyName,
  onCompanyChange,
}: {
  heading?: ReactNode
  subtitle?: string
  platformOrderNo?: string
  onPlatformOrderNoChange?: (value: string) => void
  notes?: string
  onNotesChange?: (value: string) => void
  sharedNotes?: string
  onSharedNotesChange?: (value: string) => void
  onSave?: () => void
  extra?: ReactNode
  autoFocus?: boolean
  notesLabel?: string
  notesPlaceholder?: string
  companyId?: string | null
  companyName?: string | null
  onCompanyChange?: (companyId: string, companyName: string) => void
}) {
  const { user } = useAuthenticatedAuth()
  const canEditOrder = Boolean(onPlatformOrderNoChange)
  const blurSave = canEditOrder || onSharedNotesChange ? undefined : onSave
  const canBindCompany = Boolean(onCompanyChange) && user.role === 'dispatcher'
  const showCompany = canBindCompany || (canEditOrder && (user.role === 'company' || companyName))
  const privateCopy = privateOrderNoteCopy(user.role)
  const resolvedNotesLabel = notesLabel ?? (canEditOrder ? privateCopy.label : '备注')
  const resolvedNotesPlaceholder = notesPlaceholder ?? (canEditOrder ? privateCopy.placeholder : '给这个司导写备注')

  return (
    <div className="dispatcher-notes" onPointerDown={(event) => event.stopPropagation()}>
      <span>
        {heading}
        {onSave ? (
          <button
            type="button"
            className="dispatcher-chip"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onSave()
            }}
          >
            保存
          </button>
        ) : null}
      </span>
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

export function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 5h10l4 4v10H5V5z" />
      <path d="M15 5v4h4M8 12h8M8 16h6" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </svg>
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
  onHeadPointerDown,
  extraActions,
  trailing,
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
  onHeadPointerDown?: (event: PointerEvent<HTMLElement>) => void
  extraActions?: ReactNode
  trailing?: ReactNode
  children?: ReactNode
}) {
  const [localOpen, setLocalOpen] = useState(false)
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
    <header className="dispatcher-card-head" onPointerDown={onHeadPointerDown}>
      <div className="order-info-main">
        <div className="dispatcher-card-title">
          <strong>{title}</strong>
          {editable ? (
            <button
              type="button"
              className="dispatcher-icon-btn note"
              aria-label={notesOpen ? '收起编辑' : editLabel}
              aria-expanded={notesOpen}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={toggle}
            >
              <NoteIcon />
            </button>
          ) : null}
          {extraActions}
        </div>
        {meta ? <p className="dispatcher-card-meta">{meta}</p> : null}
        {editable && notesOpen ? children : <OrderNotesPreview sharedNotes={sharedNotes} notes={notes} />}
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {trailing}
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
          <label className="dispatcher-notes-field">
            订单截图
            <OrderFilesBlock
              compact
              orderId={order.id}
              files={order.files ?? []}
              onChanged={() => void onSaved()}
            />
          </label>
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
  const version = `${order.id}:${order.sharedNotes ?? ''}:${privateNotes}`
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

  async function save() {
    try {
      const saved = await updateOrderInfo(
        order,
        role === 'driver' ? { driverNotes: notes, sharedNotes } : { notes, sharedNotes },
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
      onSave={() => void save()}
    />
  )
}
