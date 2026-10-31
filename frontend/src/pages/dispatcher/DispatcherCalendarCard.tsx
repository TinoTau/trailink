import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type Ref } from 'react'
import { CalendarInkBar, useCalendarInk } from '../../calendarInk'
import { CALENDAR_DATE_ATTR, CalendarDayCaption, captureCalendarPointer } from '../../calendarDay'
import { WEEKDAYS, formatLocalDate, monthCells, monthsBetween, orderedRange, pad, todayLocal } from '../../localDate'
import { OrderInfoFields, OrderInfoPanel, TrashIcon } from '../OrderInfoFields'

export interface CalendarMark {
  date: string
  dayId: string
  orderId: string
  label?: string
  place?: string
  assigned?: boolean
  owned?: boolean
  color?: string
  textColor?: string
  conflict?: boolean
  orderStart?: boolean
  orderEnd?: boolean
}

interface DispatcherCalendarCardProps {
  title: string
  subtitle?: string
  meta?: string | null
  marks: CalendarMark[]
  rangeStart: string
  rangeEnd: string
  onClose: () => void
  inkBar?: boolean
  onEdit?: () => void
  editLabel?: string
  onCardPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onFramePointerDown?: (event: PointerEvent<HTMLElement>) => void
  dragConflict?: boolean
  onDayPointerDown?: (event: PointerEvent<HTMLButtonElement>, mark: CalendarMark) => void
  onDayClick?: (mark: CalendarMark, anchor: HTMLButtonElement) => void
  dayClicks?: boolean
  selectable?: boolean
  pickFrom?: string | null
  pickTo?: string | null
  onDatePointerDown?: (date: string) => void
  onDatePointerEnter?: (date: string) => void
  onDateTouchHold?: (date: string, x: number, y: number, target: HTMLElement, pointerId: number) => void
  footer?: ReactNode
  infoOpen?: boolean
  onInfoOpenChange?: (open: boolean) => void
  platformOrderNo?: string
  onPlatformOrderNoChange?: (value: string) => void
  companyId?: string | null
  companyName?: string | null
  onCompanyChange?: (companyId: string, companyName: string) => void
  notes?: string
  onNotesChange?: (value: string) => void
  sharedNotes?: string
  onSharedNotesChange?: (value: string) => void
  onNotesSave?: () => void
  notesExtra?: ReactNode
  notesLabel?: string
  notesPlaceholder?: string
  onRemove?: () => void
  removeLabel?: string
  removeArmed?: boolean
  bodyRef?: Ref<HTMLDivElement>
  bodyKey?: string
  onBodyScroll?: () => void
}

export function DispatcherCalendarCard({
  title,
  subtitle,
  meta,
  marks,
  rangeStart,
  rangeEnd,
  onClose,
  inkBar = false,
  onEdit,
  editLabel,
  onCardPointerDown,
  onFramePointerDown,
  dragConflict = false,
  onDayPointerDown,
  onDayClick,
  dayClicks = false,
  selectable,
  pickFrom,
  pickTo,
  onDatePointerDown,
  onDatePointerEnter,
  onDateTouchHold,
  footer,
  infoOpen,
  onInfoOpenChange,
  platformOrderNo,
  onPlatformOrderNoChange,
  companyId,
  companyName,
  onCompanyChange,
  notes,
  onNotesChange,
  sharedNotes,
  onSharedNotesChange,
  onNotesSave,
  notesExtra,
  notesLabel,
  notesPlaceholder,
  onRemove,
  removeLabel = '移除',
  removeArmed = false,
  bodyRef,
  bodyKey,
  onBodyScroll,
}: DispatcherCalendarCardProps) {
  const ink = useCalendarInk()
  const [localInfoOpen, setLocalInfoOpen] = useState(false)
  const notesOpen = onInfoOpenChange ? Boolean(infoOpen) : localInfoOpen
  const byDate = new Map(marks.map((mark) => [mark.date, mark]))
  const months = monthsBetween(rangeStart, rangeEnd)
  const [pickStart, pickEnd] = pickFrom ? orderedRange(pickFrom, pickTo) : [null, null]
  const today = formatLocalDate(todayLocal())
  const canEditOrder = Boolean(onPlatformOrderNoChange)
  const canEditNotes = Boolean(onNotesChange)
  const showEditIcon = Boolean(onEdit) || canEditNotes || canEditOrder
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (notesOpen) {
      scrollRef.current?.scrollTo({ top: 0 })
    }
  }, [notesOpen])

  function setBody(node: HTMLDivElement | null) {
    scrollRef.current = node
    if (typeof bodyRef === 'function') {
      bodyRef(node)
    } else if (bodyRef) {
      bodyRef.current = node
    }
  }

  return (
    <article
      className={`dispatcher-card${inkBar ? ' calendar-ink-host' : ''}`}
      style={inkBar ? ink.style : undefined}
      onPointerDown={onFramePointerDown}
    >
      <OrderInfoPanel
        title={title}
        subtitle={subtitle}
        meta={meta}
        notes={notes}
        sharedNotes={sharedNotes}
        open={notesOpen}
        onOpenChange={(next) => {
          if (onInfoOpenChange) {
            onInfoOpenChange(next)
          } else {
            setLocalInfoOpen(next)
          }
        }}
        editable={showEditIcon}
        editLabel={onEdit ? (editLabel ?? '编辑') : canEditOrder ? '编辑订单' : '备注'}
        onEdit={onEdit}
        onHeadPointerDown={onCardPointerDown}
        extraActions={cardRemoveButton(onRemove, removeLabel, removeArmed)}
        trailing={
          <button
            type="button"
            className="dispatcher-icon-btn"
            aria-label="关闭"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        }
      />
      <div
        ref={setBody}
        className="dispatcher-card-body"
        data-calendar={bodyKey}
        onScroll={onBodyScroll}
      >
        {notesOpen ? (
          <OrderInfoFields
            heading={canEditOrder ? '订单信息' : '备注'}
            platformOrderNo={platformOrderNo}
            onPlatformOrderNoChange={onPlatformOrderNoChange}
            companyId={companyId}
            companyName={companyName}
            onCompanyChange={onCompanyChange}
            notes={notes}
            onNotesChange={onNotesChange}
            sharedNotes={sharedNotes}
            onSharedNotesChange={onSharedNotesChange}
            notesLabel={notesLabel}
            notesPlaceholder={notesPlaceholder}
            onSave={onNotesSave}
            extra={notesExtra}
            autoFocus
          />
        ) : null}
        {months.map((month) => (
          <section
            key={`${month.getFullYear()}-${month.getMonth()}`}
            data-month={`${month.getFullYear()}-${pad(month.getMonth() + 1)}`}
          >
            <h3>
              {month.getFullYear()}年{month.getMonth() + 1}月
            </h3>
            <div className="dispatcher-weekdays">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className={`dispatcher-month-grid${selectable ? ' selecting' : ''}`}>
              {monthCells(month).map((cell) => {
                const date = formatLocalDate(cell.date)
                const mark = byDate.get(date)
                const selectableDay = Boolean(selectable && cell.inMonth)
                const inRange = Boolean(pickStart && pickEnd && date >= pickStart && date <= pickEnd)
                const rangeEdge = date === pickStart || date === pickEnd
                return (
                  <button
                    key={date + String(cell.inMonth)}
                    type="button"
                    className={`calendar-day dispatcher-day${!cell.inMonth ? ' outside' : ''}${mark ? ' marked' : ''}${mark?.conflict ? ' conflict' : ''}${mark?.assigned === false ? ' unassigned' : ''}${mark?.owned === false ? ' locked' : ''}${cell.inMonth && mark?.orderStart ? ' order-start' : ''}${cell.inMonth && mark?.orderEnd ? ' order-end' : ''}${inRange ? ' in-range' : ''}${rangeEdge ? ' range-edge' : ''}${date === today && cell.inMonth ? ' today' : ''}`}
                    disabled={!mark && !selectableDay}
                    style={
                      mark?.color
                        ? {
                            background: mark.color,
                            color: mark.textColor || undefined,
                            ...(cell.inMonth && (mark.orderStart || mark.orderEnd)
                              ? { '--order-fill': mark.color }
                              : {}),
                          }
                        : undefined
                    }
                    {...(cell.inMonth ? { 'data-service-date': date } : {})}
                    {...(selectableDay ? { [CALENDAR_DATE_ATTR]: date } : {})}
                    onClick={
                      mark && (dayClicks || mark.conflict || mark.owned === false)
                        ? (event) => {
                            event.stopPropagation()
                            onDayClick?.(mark, event.currentTarget)
                          }
                        : undefined
                    }
                    onPointerDown={
                      mark || selectableDay
                        ? (event) => {
                            event.stopPropagation()
                            if (mark?.conflict && !dragConflict) {
                              return
                            }
                            if (selectableDay) {
                              if (event.pointerType === 'touch') {
                                onDateTouchHold?.(date, event.clientX, event.clientY, event.currentTarget, event.pointerId)
                                return
                              }
                              event.preventDefault()
                              captureCalendarPointer(event.currentTarget, event.pointerId)
                              onDatePointerDown?.(date)
                              return
                            }
                            if (mark) {
                              onDayPointerDown?.(event, mark)
                            }
                          }
                        : undefined
                    }
                    onTouchStart={
                      selectableDay
                        ? (event) => {
                            const touch = event.touches[0]
                            if (!touch) {
                              return
                            }
                            event.stopPropagation()
                            onDateTouchHold?.(date, touch.clientX, touch.clientY, event.currentTarget, -1)
                          }
                        : undefined
                    }
                    onContextMenu={
                      selectableDay
                        ? (event) => {
                            event.preventDefault()
                          }
                        : undefined
                    }
                    onPointerEnter={selectableDay ? () => onDatePointerEnter?.(date) : undefined}
                  >
                    <CalendarDayCaption day={cell.date.getDate()} label={mark?.label} place={mark?.place} />
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      {inkBar ? (
        <CalendarInkBar balance={ink.balance} side={ink.side} onChange={ink.setBalance} onSideChange={ink.setSide} />
      ) : null}
      {footer ? <div className="dispatcher-card-footer">{footer}</div> : null}
    </article>
  )
}

export function DispatcherDayCard({
  title,
  subtitle,
  onClose,
  closeLabel = '关闭',
  notes,
  onNotesChange,
  onNotesSave,
  notesLabel,
  notesPlaceholder,
  onRemove,
  removeLabel = '移除',
  removeArmed = false,
  editOpen = false,
  onEditOpenChange,
  editLabel = '备注',
  onHeadPointerDown,
  footer,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  closeLabel?: string
  notes?: string
  onNotesChange?: (value: string) => void
  onNotesSave?: () => void
  notesLabel?: string
  notesPlaceholder?: string
  onRemove?: () => void
  removeLabel?: string
  removeArmed?: boolean
  editOpen?: boolean
  onEditOpenChange?: (open: boolean) => void
  editLabel?: string
  onHeadPointerDown?: (event: PointerEvent<HTMLElement>) => void
  footer?: ReactNode
  children: ReactNode
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const noteEditor = Boolean(onNotesChange)
  const customEditor = Boolean(onEditOpenChange)

  return (
    <article className="dispatcher-card">
      <OrderInfoPanel
        title={title}
        subtitle={subtitle}
        notes={notes}
        open={customEditor ? editOpen : notesOpen}
        onOpenChange={customEditor ? onEditOpenChange : setNotesOpen}
        editable={noteEditor || customEditor}
        editLabel={editLabel}
        onHeadPointerDown={onHeadPointerDown}
        extraActions={cardRemoveButton(onRemove, removeLabel, removeArmed)}
        trailing={
          <button type="button" className="dispatcher-icon-btn" aria-label={closeLabel} onClick={onClose}>
            <CloseIcon />
          </button>
        }
      />
      <div className="dispatcher-card-body" onPointerDown={(event) => event.stopPropagation()}>
        {notesOpen && noteEditor ? (
          <OrderInfoFields
            heading="备注"
            notes={notes}
            onNotesChange={onNotesChange}
            notesLabel={notesLabel ?? '备注'}
            notesPlaceholder={notesPlaceholder}
            onSave={onNotesSave}
            autoFocus
          />
        ) : null}
        {children}
      </div>
      {footer}
    </article>
  )
}

function cardRemoveButton(onRemove: (() => void) | undefined, removeLabel: string, armed = false) {
  if (!onRemove) {
    return null
  }
  return (
    <button
      type="button"
      className={`dispatcher-icon-btn danger dispatcher-card-remove${armed ? ' release' : ''}`}
      aria-label={armed ? `确认${removeLabel}` : removeLabel}
      aria-pressed={armed}
      data-vehicle-delete={armed ? 'true' : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onRemove}
    >
      <TrashIcon />
    </button>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
