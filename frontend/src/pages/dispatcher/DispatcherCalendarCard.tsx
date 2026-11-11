import { useLayoutEffect, useRef, useState, type ComponentProps, type PointerEvent, type ReactNode, type Ref } from 'react'
import { CalendarInkBar, useCalendarInk, type CalendarInk } from '../../calendarInk'
import { CALENDAR_DATE_ATTR, CalendarDayCaption, captureCalendarPointer } from '../../calendarDay'
import { WEEKDAYS, formatLocalDate, monthCells, monthsBetween, orderedRange, pad, todayLocal } from '../../localDate'
import { CloseIcon, DeleteIcon } from '../icons'
import { OrderInfoFields, OrderInfoPanel, SaveSlotContext } from '../OrderInfoFields'
import type { ShareLevel } from '../../types'
import { SHARE_LEVEL_LABELS } from '../../api/grab'

export interface CalendarMark {
  date: string
  dayId: string
  orderId: string
  label?: string
  place?: string
  /** 这一天的天气（和司导日历同一份数据），和背景字放在一起。 */
  weather?: string | null
  assigned?: boolean
  owned?: boolean
  color?: string
  textColor?: string
  conflict?: boolean
  orderStart?: boolean
  orderEnd?: boolean
  /** 抢单待确认的日期：橙色虚线框（抢单专用色）。 */
  grab?: boolean
  /** 只用来标出日期，不能点也不能拖（例如司导日历上标出他抢的单）。 */
  inert?: boolean
}

interface DispatcherCalendarCardProps {
  title: string
  /** 抢单范围；有 onShareLevelChange 时在编辑订单里显示三个互斥按钮。 */
  shareLevel?: ShareLevel
  onShareLevelChange?: (level: ShareLevel) => void
  /** 没绑公司：只能调度自留。 */
  shareLevelLocked?: boolean
  /** 编辑订单里的「行程日期」（重新选择起止日期）。 */
  datesField?: ReactNode
  subtitle?: string
  meta?: string | null
  marks: CalendarMark[]
  rangeStart: string
  rangeEnd: string
  onClose: () => void
  inkBar?: boolean
  /** 外面传进来的透明度设置（和别的卡片共用）；不传就用自己的。 */
  ink?: CalendarInk
  /** 不显示控制条，只跟着 `ink` 改日期文字和背景字的透明度（调度台的订单卡片跟着司导卡片）。 */
  inkFollow?: boolean
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
  /** 头上关闭按钮左边的主按钮（创建订单的「创建订单」、改日期的「保存」）。 */
  headAction?: ReactNode
  /** 编辑订单里的人数、车型、南/北岛。 */
  orderBasics?: ComponentProps<typeof OrderInfoFields>['basics']
  companyId?: string | null
  companyName?: string | null
  onCompanyChange?: (companyId: string, companyName: string) => void
  notes?: string
  onNotesChange?: (value: string) => void
  sharedNotes?: string
  onSharedNotesChange?: (value: string) => void
  onNotesSave?: () => void | boolean | Promise<boolean | void>
  /** 放在日期天数（司导卡片是备注）下方的一条，例如抢单确认。编辑时不显示。 */
  action?: ReactNode
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
  ink: sharedInk,
  inkFollow = false,
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
  orderBasics,
  headAction,
  companyId,
  companyName,
  onCompanyChange,
  notes,
  onNotesChange,
  sharedNotes,
  onSharedNotesChange,
  onNotesSave,
  action,
  notesExtra,
  notesLabel,
  notesPlaceholder,
  onRemove,
  removeLabel = '移除',
  removeArmed = false,
  bodyRef,
  bodyKey,
  onBodyScroll,
  shareLevel,
  onShareLevelChange,
  shareLevelLocked = false,
  datesField,
}: DispatcherCalendarCardProps) {
  const localInk = useCalendarInk()
  const ink = sharedInk ?? localInk
  const inkHost = inkBar || inkFollow
  /** 头上关闭按钮左边「保存」的空位，交给编辑订单区。 */
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null)
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
  /** 打开编辑前日历滚到的位置，收起编辑后回到这里。 */
  const calendarScroll = useRef(0)
  const wasEditing = useRef(notesOpen)

  // 编辑订单信息 / 备注时，卡片里只显示编辑内容，不接着显示日历；收起后日历回到原来的位置。
  useLayoutEffect(() => {
    const body = scrollRef.current
    if (body && notesOpen) {
      body.scrollTop = 0
    } else if (body && wasEditing.current) {
      body.scrollTop = calendarScroll.current
    }
    wasEditing.current = notesOpen
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
    <SaveSlotContext.Provider value={saveSlot}>
    <article
      className={`dispatcher-card${inkHost ? ' calendar-ink-host' : ''}`}
      style={inkHost ? ink.style : undefined}
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
        onSaveSlot={setSaveSlot}
        trailing={
          <>
            {headAction}
            <button
              type="button"
              className="dispatcher-icon-btn"
              aria-label="关闭"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </>
        }
      />
      {action && !notesOpen ? action : null}
      <div
        ref={setBody}
        className="dispatcher-card-body"
        data-calendar={bodyKey}
        onScroll={(event) => {
          if (notesOpen) {
            return
          }
          calendarScroll.current = event.currentTarget.scrollTop
          onBodyScroll?.()
        }}
      >
        {notesOpen && onShareLevelChange && shareLevel !== undefined ? (
          <ShareLevelBar level={shareLevel} locked={shareLevelLocked} onChange={onShareLevelChange} />
        ) : null}
        {notesOpen && datesField ? <div className="dispatcher-dates-slot">{datesField}</div> : null}
        {notesOpen ? (
          <OrderInfoFields
            heading={canEditOrder ? '订单信息' : '备注'}
            platformOrderNo={platformOrderNo}
            onPlatformOrderNoChange={onPlatformOrderNoChange}
            basics={orderBasics}
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
            afterSave={() => {
              if (onInfoOpenChange) {
                onInfoOpenChange(false)
              } else {
                setLocalInfoOpen(false)
              }
            }}
            extra={notesExtra}
            autoFocus
          />
        ) : null}
        {notesOpen ? null : months.map((month) => (
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
                    className={`calendar-day dispatcher-day${!cell.inMonth ? ' outside' : ''}${mark ? ' marked' : ''}${mark?.conflict ? ' conflict' : ''}${mark?.assigned === false ? ' unassigned' : ''}${mark?.owned === false ? ' locked' : ''}${cell.inMonth && mark?.orderStart ? ' order-start' : ''}${cell.inMonth && mark?.orderEnd ? ' order-end' : ''}${inRange ? ' in-range' : ''}${rangeEdge ? ' range-edge' : ''}${date === today && cell.inMonth ? ' today' : ''}${mark?.grab ? ' grab' : ''}`}
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
                      mark && !mark.inert && (dayClicks || mark.conflict || mark.owned === false)
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
                            if (mark?.inert || (mark?.conflict && !dragConflict)) {
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
                    <CalendarDayCaption day={cell.date.getDate()} label={mark?.label} place={mark?.place} weather={mark?.weather} />
                    {mark?.grab && cell.inMonth ? <span className="grab-mark" aria-hidden="true" /> : null}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      {inkBar && !notesOpen ? (
        <CalendarInkBar ink={ink} />
      ) : null}
      {footer ? <div className="dispatcher-card-footer">{footer}</div> : null}
    </article>
    </SaveSlotContext.Provider>
  )
}

/**
 * 编辑订单里的抢单范围：调度自留、公司内部、面向所有人，三个互斥，必须选一个（再点已选的不变）。
 * 样式和当日详情的住宿位置按钮一样。没绑公司时只能调度自留。
 */
export function ShareLevelBar({ level, locked, onChange }: { level: ShareLevel; locked: boolean; onChange: (level: ShareLevel) => void }) {
  return (
    <div className="share-level">
      <div className="place-mark-bar share-level-bar" role="radiogroup" aria-label="抢单范围">
        {SHARE_LEVEL_LABELS.map((label, index) => {
          const value = index as ShareLevel
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={level === value}
              aria-pressed={level === value}
              disabled={locked && value !== 0}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                if (value !== level) {
                  onChange(value)
                }
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
      {locked ? <p className="share-level-hint">绑定所属公司后，才能放给公司内部或所有人</p> : null}
    </div>
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
  onNotesSave?: () => void | boolean | Promise<boolean | void>
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
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null)
  const noteEditor = Boolean(onNotesChange)
  const customEditor = Boolean(onEditOpenChange)

  return (
    <SaveSlotContext.Provider value={saveSlot}>
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
        onSaveSlot={setSaveSlot}
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
            afterSave={() => setNotesOpen(false)}
            autoFocus
          />
        ) : null}
        {children}
      </div>
      {footer}
    </article>
    </SaveSlotContext.Provider>
  )
}

function cardRemoveButton(onRemove: (() => void) | undefined, removeLabel: string, armed = false) {
  if (!onRemove) {
    return null
  }
  // 调度台上公司的单是退回，不是删除：按钮直接写「退回公司」，不用垃圾桶。同样先套红框，再点一次才执行。
  if (removeLabel === '退回公司') {
    return (
      <button
        type="button"
        className={`dispatcher-chip dispatcher-card-return${armed ? ' release' : ''}`}
        aria-label={armed ? '确认退回公司' : '退回公司'}
        aria-pressed={armed}
        data-card-remove={armed ? 'true' : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onRemove}
      >
        退回公司
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`dispatcher-icon-btn danger dispatcher-card-remove${armed ? ' release' : ''}`}
      aria-label={armed ? `确认${removeLabel}` : removeLabel}
      aria-pressed={armed}
      data-vehicle-delete={armed ? 'true' : undefined}
      data-card-remove={armed ? 'true' : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onRemove}
    >
      <DeleteIcon />
    </button>
  )
}

