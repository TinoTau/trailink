import { useState, type PointerEvent, type ReactNode, type Ref } from 'react'
import { WEEKDAYS, formatLocalDate, monthCells, monthsBetween, orderedRange, pad, todayLocal } from '../../localDate'

export interface CalendarMark {
  date: string
  dayId: string
  orderId: string
  label?: string
  assigned?: boolean
  color?: string
  textColor?: string
}

interface DispatcherCalendarCardProps {
  title: string
  subtitle?: string
  marks: CalendarMark[]
  rangeStart: string
  rangeEnd: string
  onClose: () => void
  onCardPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onDayPointerDown?: (event: PointerEvent<HTMLButtonElement>, mark: CalendarMark) => void
  selectable?: boolean
  pickFrom?: string | null
  pickTo?: string | null
  onDatePointerDown?: (date: string) => void
  onDatePointerEnter?: (date: string) => void
  footer?: ReactNode
  infoOpen?: boolean
  onInfoOpenChange?: (open: boolean) => void
  platformOrderNo?: string
  onPlatformOrderNoChange?: (value: string) => void
  notes?: string
  onNotesChange?: (value: string) => void
  onNotesSave?: () => void
  notesExtra?: ReactNode
  onRemove?: () => void
  removeLabel?: string
  bodyRef?: Ref<HTMLDivElement>
  bodyKey?: string
  onBodyScroll?: () => void
}

export function DispatcherCalendarCard({
  title,
  subtitle,
  marks,
  rangeStart,
  rangeEnd,
  onClose,
  onCardPointerDown,
  onDayPointerDown,
  selectable,
  pickFrom,
  pickTo,
  onDatePointerDown,
  onDatePointerEnter,
  footer,
  infoOpen,
  onInfoOpenChange,
  platformOrderNo,
  onPlatformOrderNoChange,
  notes,
  onNotesChange,
  onNotesSave,
  notesExtra,
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

  function toggleNotesOpen() {
    const next = !notesOpen
    if (onInfoOpenChange) {
      onInfoOpenChange(next)
    } else {
      setLocalInfoOpen(next)
    }
  }

  return (
    <article className="dispatcher-card">
      <header className="dispatcher-card-head" onPointerDown={onCardPointerDown}>
        <div>
          <div className="dispatcher-card-title">
            <strong>{title}</strong>
            {showEditIcon ? (
              <button
                type="button"
                className={`dispatcher-icon-btn${notesOpen || notes || platformOrderNo ? ' active' : ''}`}
                aria-label={notesOpen ? '收起编辑' : canEditOrder ? '编辑订单' : '备注'}
                aria-expanded={notesOpen}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={toggleNotesOpen}
              >
                <NoteIcon />
              </button>
            ) : null}
            {onRemove ? (
              <button
                type="button"
                className="dispatcher-icon-btn danger dispatcher-card-remove"
                aria-label={removeLabel}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={onRemove}
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button
          type="button"
          className="dispatcher-icon-btn"
          aria-label="关闭"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      {showEditIcon && notesOpen ? (
        <div className="dispatcher-notes" onPointerDown={(event) => event.stopPropagation()}>
          <span>
            {canEditOrder ? '订单信息' : '备注'}
            {onNotesSave ? (
              <button
                type="button"
                className="dispatcher-chip"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onNotesSave()
                }}
              >
                保存
              </button>
            ) : null}
          </span>
          {canEditOrder ? (
            <label className="dispatcher-notes-field">
              公司订单号
              <input
                value={platformOrderNo ?? ''}
                autoFocus
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => onPlatformOrderNoChange?.(event.target.value)}
                placeholder="平台/公司订单号，可为空"
              />
            </label>
          ) : null}
          {canEditNotes ? (
            <label className="dispatcher-notes-field">
              备注
              <textarea
                value={notes ?? ''}
                rows={3}
                autoFocus={!canEditOrder}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => onNotesChange?.(event.target.value)}
                onBlur={canEditOrder ? undefined : onNotesSave}
                placeholder={canEditOrder ? '订单备注' : '给这个司导写备注'}
              />
            </label>
          ) : null}
          {notesExtra}
        </div>
      ) : null}
      <div
        ref={bodyRef}
        className="dispatcher-card-body"
        data-calendar={bodyKey}
        onScroll={onBodyScroll}
      >
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
                    className={`dispatcher-day${!cell.inMonth ? ' outside' : ''}${mark ? ' marked' : ''}${mark?.assigned === false ? ' unassigned' : ''}${inRange ? ' in-range' : ''}${rangeEdge ? ' range-edge' : ''}${date === today && cell.inMonth ? ' today' : ''}`}
                    disabled={!mark && !selectableDay}
                    style={
                      mark?.color
                        ? { background: mark.color, color: mark.textColor || undefined }
                        : undefined
                    }
                    onPointerDown={
                      mark || selectableDay
                        ? (event) => {
                            event.stopPropagation()
                            if (selectableDay) {
                              onDatePointerDown?.(date)
                              return
                            }
                            if (mark) {
                              onDayPointerDown?.(event, mark)
                            }
                          }
                        : undefined
                    }
                    onPointerEnter={selectableDay ? () => onDatePointerEnter?.(date) : undefined}
                  >
                    <b>{cell.date.getDate()}</b>
                    {mark?.label ? <em>{mark.label}</em> : null}
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
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <article className="dispatcher-card">
      <header className="dispatcher-card-head">
        <div>
          <div className="dispatcher-card-title">
            <strong>{title}</strong>
          </div>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button type="button" className="dispatcher-icon-btn" aria-label="返回日历" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="dispatcher-card-body" onPointerDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </article>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 5h10l4 4v10H5V5z" />
      <path d="M15 5v4h4M8 12h8M8 16h6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
