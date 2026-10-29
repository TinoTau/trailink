import { useEffect, useRef, useState } from 'react'
import { isStoredFile, itineraryDayWrite, ordersApi } from '../../api/orders'
import { useAuthenticatedAuth } from '../../auth/authState'
import { FileField } from '../FileField'
import { OrderInfoEditor, TrashIcon } from '../OrderInfoFields'
import { formatLocalTime } from '../../localDate'
import { splitOrderHint } from '../../orderFlags'
import { PLACE_PRESETS, placeMark, presetForLocation } from '../../placeMark'
import { contactLabel } from '../../text'
import type { DriverCalendarDay, ItineraryDay, Order, OrderActivity, OrderActivityWrite } from '../../types'

export function DriverDayEditor({
  day,
  onChanged,
  showOrderInfo = false,
  armedOrderId = null,
  onArmDayRelease,
}: {
  day: DriverCalendarDay
  onChanged: () => Promise<void>
  showOrderInfo?: boolean
  armedOrderId?: string | null
  onArmDayRelease?: (orderId: string) => void
}) {
  const { user } = useAuthenticatedAuth()
  const [trips, setTrips] = useState<ItineraryDay[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [splitHint, setSplitHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const orderIds = [...new Set(day.items.map((trip) => trip.orderId))]
        const orders = await Promise.all(orderIds.map((orderId) => ordersApi.get(orderId)))
        if (!active) return
        const daysById = new Map(orders.flatMap((order) => order.days).map((item) => [item.id, item]))
        setOrders(orders)
        setTrips(day.items
          .map((trip) => daysById.get(trip.itineraryDayId))
          .filter((item): item is ItineraryDay => Boolean(item)))
        setSplitHint(splitOrderHint(orders))
        setError(null)
      } catch (item) {
        if (active) setError(item instanceof Error ? item.message : '加载当日行程失败')
      }
    }
    void load()
    return () => { active = false }
  }, [day])

  const visibleTrips = trips.filter((trip, index) => {
    if (trip.activities.length > 0) {
      return true
    }
    if (trips.some((item) => item.activities.length > 0)) {
      return false
    }
    return index === 0
  })

  const orderById = new Map(orders.map((item) => [item.id, item]))
  const groups: { orderId: string; trips: ItineraryDay[] }[] = []
  for (const trip of visibleTrips) {
    const last = groups.at(-1)
    if (last?.orderId === trip.orderId) {
      last.trips.push(trip)
    } else {
      groups.push({ orderId: trip.orderId, trips: [trip] })
    }
  }

  return (
    <div className="driver-detail-card">
      {error ? <p className="driver-edit-error">{error}</p> : null}
      {splitHint ? <p className="driver-add-hint">{splitHint}</p> : null}
      {groups.map((group) => {
        const order = orderById.get(group.orderId)
        return (
          <div key={group.orderId}>
            {showOrderInfo && order ? (
              <OrderInfoEditor
                order={order}
                meta={dispatcherContactLine(order, group.trips[0], user.id)}
                onSaved={onChanged}
                extraActions={
                  <button
                    type="button"
                    className="dispatcher-icon-btn danger"
                    aria-label="解除这一天"
                    aria-pressed={armedOrderId === group.orderId}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onArmDayRelease?.(group.orderId)}
                  >
                    <TrashIcon />
                  </button>
                }
              />
            ) : null}
            {group.trips.map((trip) => (
              <TripEditor
                key={trip.id}
                date={day.date}
                trip={trip}
                onChanged={onChanged}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

interface TripEditorProps {
  date: string
  trip: ItineraryDay
  onChanged: () => Promise<void>
}

function TripEditor(props: TripEditorProps) {
  const version = `${props.trip.id}:${props.trip.activities.map((activity) => `${activity.id}:${activity.sortOrder}`).join(',')}`
  return <TripEditorState key={version} {...props} />
}

function TripEditorState({ date, trip, onChanged }: TripEditorProps) {
  const [activities, setActivities] = useState(trip.activities)
  const [composing, setComposing] = useState(false)
  const [savingPlace, setSavingPlace] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const startIdsRef = useRef<string[]>([])

  function moveActivity(overId: string) {
    const currentId = dragIdRef.current
    if (!currentId || currentId === overId) {
      return
    }
    setActivities((current) => {
      const from = current.findIndex((item) => item.id === currentId)
      const to = current.findIndex((item) => item.id === overId)
      if (from < 0 || to < 0 || from === to) {
        return current
      }
      const next = [...current]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  async function persistOrder() {
    if (!dragIdRef.current) {
      return
    }
    const ids = activities.map((item) => item.id)
    const changed = ids.some((id, index) => id !== startIdsRef.current[index])
    dragIdRef.current = null
    setDragId(null)
    if (!changed) {
      return
    }
    try {
      await ordersApi.reorderActivities(trip.orderId, trip.id, ids)
      void onChanged()
    } catch {
      await onChanged()
    }
  }

  async function savePlace(endLocation: string) {
    if ((trip.endLocation ?? '') === endLocation) {
      return
    }
    setSavingPlace(true)
    setPlaceError(null)
    try {
      await ordersApi.updateDay(trip.orderId, trip.id, itineraryDayWrite({
        serviceDate: trip.serviceDate,
        description: trip.description,
        endLocation,
      }, trip.driverId))
      await onChanged()
    } catch (item) {
      setPlaceError(item instanceof Error ? item.message : '无法保存住宿位置')
    } finally {
      setSavingPlace(false)
    }
  }

  return (
    <article className="driver-detail-trip">
      <PlaceMarkBar value={trip.endLocation} disabled={savingPlace} onSelect={savePlace} />
      {placeError ? <p className="driver-edit-error">{placeError}</p> : null}
      {activities.map((activity) => (
        <SavedActivity
          key={activity.id}
          orderId={trip.orderId}
          dayId={trip.id}
          activity={activity}
          dragging={dragId === activity.id}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) {
              return
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            dragIdRef.current = activity.id
            startIdsRef.current = activities.map((item) => item.id)
            setDragId(activity.id)
          }}
          onPointerMove={(event) => {
            if (!dragIdRef.current) {
              return
            }
            const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-activity-id]')
            const overId = over?.getAttribute('data-activity-id')
            if (overId) {
              moveActivity(overId)
            }
          }}
          onPointerUp={() => void persistOrder()}
          onUpdated={() => void onChanged()}
          onRemoved={() => {
            setActivities((current) => current.filter((item) => item.id !== activity.id))
            void onChanged()
          }}
        />
      ))}
      {composing ? (
        <ActivityComposer
          date={date}
          orderId={trip.orderId}
          dayId={trip.id}
          onCreated={(created) => {
            setActivities((current) => [...current, created])
            setComposing(false)
            void onChanged()
          }}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <div className="driver-activity-actions">
          <button type="button" onClick={() => setComposing(true)}>
            添加活动
          </button>
        </div>
      )}
    </article>
  )
}

function PlaceMarkBar({
  value,
  disabled,
  onSelect,
}: {
  value?: string | null
  disabled?: boolean
  onSelect: (value: string) => Promise<void>
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const preset = presetForLocation(value)
  const customMark = value && !preset ? placeMark(value) : undefined

  return (
    <div className="place-mark-bar" aria-label="住宿位置">
      {PLACE_PRESETS.map((item) => (
        <button
          key={item.mark}
          type="button"
          aria-pressed={preset?.mark === item.mark}
          disabled={disabled}
          onClick={() => void onSelect(preset?.mark === item.mark ? '' : item.name)}
        >
          {item.mark}
        </button>
      ))}
      {customOpen ? (
        <form
          className="place-mark-custom"
          onSubmit={(event) => {
            event.preventDefault()
            const text = draft.trim()
            if (!text) {
              return
            }
            setCustomOpen(false)
            void onSelect(text)
          }}
        >
          <input
            aria-label="其他住宿位置"
            placeholder="住宿位置"
            maxLength={200}
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={disabled || !draft.trim()}>
            确定
          </button>
        </form>
      ) : (
        <button
          type="button"
          aria-pressed={Boolean(customMark)}
          aria-label={customMark ? `住宿位置 ${value}` : '其他住宿位置'}
          disabled={disabled}
          onClick={() => {
            if (customMark) {
              void onSelect('')
              return
            }
            setDraft(preset ? '' : (value ?? ''))
            setCustomOpen(true)
          }}
        >
          {customMark ?? '...'}
        </button>
      )}
    </div>
  )
}

function SavedActivity({
  orderId,
  dayId,
  activity,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onUpdated,
  onRemoved,
}: {
  orderId: string
  dayId: string
  activity: OrderActivity
  dragging: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: () => void
  onUpdated: () => void
  onRemoved: () => void
}) {
  const details = [activity.provider, formatLocalTime(activity.bookingTime), formatLocalTime(activity.checkinTime)]
    .filter(Boolean)
    .join(' · ')

  async function uploadTicket(file: File) {
    await ordersApi.uploadTicket(orderId, dayId, activity.id, file)
    onUpdated()
  }

  return (
    <div
      className={`driver-saved-activity${dragging ? ' dragging' : ''}`}
      data-activity-id={activity.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="driver-drag-handle" aria-hidden>
        ⋮⋮
      </span>
      <div className="driver-activity-main">
        {activity.content}
        {details ? <span className="driver-activity-meta">{details}</span> : null}
      </div>
      <div className="driver-saved-activity-side">
        {isStoredFile(activity.ticketPath) ? (
          <a className="driver-ticket" href={ordersApi.ticketUrl(orderId, dayId, activity.id)} target="_blank" rel="noreferrer">
            电子票
          </a>
        ) : activity.ticketPath ? (
          <span className="driver-ticket">电子票</span>
        ) : null}
        <FileField
          label={activity.ticketPath ? '更换' : '上传电子票'}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="driver-ticket-btn"
          onPick={(file) => void uploadTicket(file)}
        />
        <button
          type="button"
          className="danger"
          onClick={async () => {
            await ordersApi.removeActivity(orderId, dayId, activity.id)
            onRemoved()
          }}
        >
          删除
        </button>
      </div>
    </div>
  )
}

function ActivityComposer({
  date,
  orderId,
  dayId,
  onCreated,
  onCancel,
}: {
  date: string
  orderId: string
  dayId: string
  onCreated: (activity: OrderActivity) => void
  onCancel: () => void
}) {
  const [content, setContent] = useState('')
  const [provider, setProvider] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [checkinTime, setCheckinTime] = useState('')
  const [ticket, setTicket] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const body: OrderActivityWrite = {
      content: content.trim(),
      provider: provider.trim() || undefined,
      bookingTime: fromTimeInput(date, bookingTime),
      checkinTime: fromTimeInput(date, checkinTime),
    }
    if (!body.content) {
      setError('请填写活动内容')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const created = await ordersApi.createActivity(orderId, dayId, body)
      const withTicket = ticket ? await ordersApi.uploadTicket(orderId, dayId, created.id, ticket) : created
      onCreated(withTicket)
    } catch (item) {
      setError(item instanceof Error ? item.message : '添加活动失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="driver-activity-form">
      <input placeholder="活动内容" value={content} onChange={(event) => setContent(event.target.value)} />
      <input placeholder="承办方" value={provider} onChange={(event) => setProvider(event.target.value)} />
      <div className="driver-time-row">
        <label>
          预订
          <input type="time" value={bookingTime} onChange={(event) => setBookingTime(event.target.value)} />
        </label>
        <label>
          签到
          <input type="time" value={checkinTime} onChange={(event) => setCheckinTime(event.target.value)} />
        </label>
      </div>
      <FileField
        label={ticket ? `已选 ${ticket.name}` : '上传电子票'}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="driver-ticket-btn"
        onPick={setTicket}
      />
      {error ? <p className="driver-edit-error">{error}</p> : null}
      <div className="driver-activity-actions">
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? '添加中…' : '添加活动'}
        </button>
        <button type="button" disabled={saving} onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}

function fromTimeInput(date: string, time: string) {
  return time ? `${date}T${time}:00` : null
}

function dispatcherContactLine(order: Order, trip: ItineraryDay | undefined, viewerId?: string | null) {
  const dayName = trip?.assignedByName?.trim()
  if (trip?.assignedByUserId && dayName && trip.assignedByUserId !== viewerId) {
    return `调度员 ${dayName} ${contactLabel(trip.assignedByContact)}`
  }
  const orderName = order.assignedDispatcherName?.trim()
  if (order.assignedDispatcherUserId && orderName && order.assignedDispatcherUserId !== viewerId) {
    return `调度员 ${orderName} ${contactLabel(order.assignedDispatcherContact)}`
  }
  return null
}
