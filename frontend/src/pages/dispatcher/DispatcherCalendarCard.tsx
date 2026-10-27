import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type Ref } from 'react'
import { CALENDAR_DATE_ATTR, CalendarDayCaption, captureCalendarPointer } from '../../calendarDay'
import { WEEKDAYS, formatLocalDate, monthCells, monthsBetween, orderedRange, pad, todayLocal } from '../../localDate'
import { OrderInfoFields, OrderInfoPanel, TrashIcon } from '../OrderInfoFields'

export interface CalendarMark {
  date: string
  dayId: string
  orderId: string
  label?: string
  assigned?: boolean
  owned?: boolean
  color?: string
  textColor?: string
  conflict?: boolean
}

interface DispatcherCalendarCardProps {
  title: string
  subtitle?: string
  meta?: string | null
  marks: CalendarMark[]
  rangeStart: string
  rangeEnd: string
  onClose: () => void
  onCardPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onDayPointerDown?: (event: PointerEvent<HTMLButtonElement>, mark: CalendarMark) => void
  onDayClick?: (mark: CalendarMark, anchor: HTMLButtonElement) => void
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
  onNotesSave?: () => void
  notesExtra?: ReactNode
  notesLabel?: string
  notesPlaceholder?: string
  onRemove?: () => void
  removeLabel?: string
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
  onCardPointerDown,
  onDayPointerDown,
  onDayClick,
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
  onNotesSave,
  notesExtra,
  notesLabel,
  notesPlaceholder,
  onRemove,
  removeLabel = '移除',
  bodyRef,
  bodyKey,
  onBodyScroll,
}: DispatcherCalendarCardProps) {
  const [localInfoOpen, setLocalInfoOpen] = useState(false)
  const notesOpen = onInfoOpenChange ? Boolean(infoOpen) : localInfoOpen
  const byDate = new Map(marks.map((mark) => [mark.date, mark]))
  const months = monthsBetween(rangeStart, rangeEnd)
  const [pickStart, pickEnd] = pickFrom ? orderedRange(pickFrom, pickTo) : [null, null]
  const today = formatLocalDate(todayLocal())
  const canEditOrder = Boolean(onPlatformOrderNoChange)
  const canEditNotes = Boolean(onNotesChange)
  const showEditIcon = canEditNotes || canEditOrder
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
    <article className="dispatcher-card">
      <OrderInfoPanel
        title={title}
        subtitle={subtitle}
        meta={meta}
        notes={notes}
        open={notesOpen}
        onOpenChange={(next) => {
          if (onInfoOpenChange) {
            onInfoOpenChange(next)
          } else {
            setLocalInfoOpen(next)
          }
        }}
        editable={showEditIcon}
        editLabel={canEditOrder ? '编辑订单' : '备注'}
        onHeadPointerDown={onCardPointerDown}
        extraActions={cardRemoveButton(onRemove, removeLabel)}
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
            notesLabel={notesLabel ?? (canEditOrder ? '调度备注' : '备注')}
            notesPlaceholder={notesPlaceholder ?? (canEditOrder ? '仅调度可见，司导看不到' : '给这个司导写备注')}
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
                    className={`dispatcher-day${!cell.inMonth ? ' outside' : ''}${mark ? ' marked' : ''}${mark?.assigned === false ? ' unassigned' : ''}${mark?.owned === false ? ' locked' : ''}${inRange ? ' in-range' : ''}${rangeEdge ? ' range-edge' : ''}${date === today && cell.inMonth ? ' today' : ''}`}
                    disabled={!mark && !selectableDay}
                    style={
                      mark?.color
                        ? { background: mark.color, color: mark.textColor || undefined }
                        : undefined
                    }
                    {...(cell.inMonth ? { 'data-service-date': date } : {})}
                    {...(selectableDay ? { [CALENDAR_DATE_ATTR]: date } : {})}
                    onClick={
                      mark?.conflict
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
                            if (mark?.conflict) {
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
                    <CalendarDayCaption day={cell.date.getDate()} label={mark?.label} />
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
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
  children: ReactNode
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const canEditNotes = Boolean(onNotesChange)

  return (
    <article className="dispatcher-card">
      <OrderInfoPanel
        title={title}
        subtitle={subtitle}
        notes={notes}
        open={notesOpen}
        onOpenChange={setNotesOpen}
        editable={canEditNotes}
        editLabel="备注"
        extraActions={cardRemoveButton(onRemove, removeLabel)}
        trailing={
          <button type="button" className="dispatcher-icon-btn" aria-label={closeLabel} onClick={onClose}>
            <CloseIcon />
          </button>
        }
      />
      <div className="dispatcher-card-body" onPointerDown={(event) => event.stopPropagation()}>
        {notesOpen && canEditNotes ? (
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
    </article>
  )
}

function cardRemoveButton(onRemove: (() => void) | undefined, removeLabel: string) {
  if (!onRemove) {
    return null
  }
  return (
    <button
      type="button"
      className="dispatcher-icon-btn danger dispatcher-card-remove"
      aria-label={removeLabel}
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
