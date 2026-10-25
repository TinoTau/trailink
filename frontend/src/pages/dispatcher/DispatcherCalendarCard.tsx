import { useState, type PointerEvent, type ReactNode, type Ref } from 'react'
import { CalendarDayCaption } from '../../calendarDay'
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
        extraActions={
          onRemove ? (
            <button
              type="button"
              className="dispatcher-icon-btn danger dispatcher-card-remove"
              aria-label={removeLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onRemove}
            >
              <TrashIcon />
            </button>
          ) : null
        }
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
      >
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
      </OrderInfoPanel>
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
                    className={`dispatcher-day${!cell.inMonth ? ' outside' : ''}${mark ? ' marked' : ''}${mark?.assigned === false ? ' unassigned' : ''}${mark?.owned === false ? ' locked' : ''}${inRange ? ' in-range' : ''}${rangeEdge ? ' range-edge' : ''}${date === today && cell.inMonth ? ' today' : ''}`}
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
        trailing={
          <button type="button" className="dispatcher-icon-btn" aria-label={closeLabel} onClick={onClose}>
            <CloseIcon />
          </button>
        }
      >
        {canEditNotes ? (
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
      </OrderInfoPanel>
      <div className="dispatcher-card-body" onPointerDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </article>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
