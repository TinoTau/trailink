import { useEffect, useRef, useState } from 'react'
import { isStoredFile, ordersApi } from '../../api/orders'
import { FileField } from '../FileField'
import { formatLocalTime } from '../../localDate'
import { splitOrderHint } from '../../orderFlags'
import type { DriverCalendarDay, ItineraryDay, OrderActivity, OrderActivityWrite } from '../../types'

export function DriverDayEditor({
  day,
  onChanged,
}: {
  day: DriverCalendarDay
  onChanged: () => Promise<void>
}) {
  const [trips, setTrips] = useState<ItineraryDay[]>([])
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

  return (
    <div className="driver-detail-card">
      {error ? <p className="driver-edit-error">{error}</p> : null}
      {splitHint ? <p className="driver-add-hint">{splitHint}</p> : null}
      {visibleTrips.map((trip) => (
        <TripEditor
          key={trip.id}
          date={day.date}
          trip={trip}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}

function TripEditor({
  date,
  trip,
  onChanged,
}: {
  date: string
  trip: ItineraryDay
  onChanged: () => Promise<void>
}) {
  const [activities, setActivities] = useState(trip.activities)
  const [composing, setComposing] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const startIdsRef = useRef<string[]>([])
  const activitiesRef = useRef(activities)
  activitiesRef.current = activities

  useEffect(() => {
    setActivities(trip.activities)
  }, [trip])

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
    const ids = activitiesRef.current.map((item) => item.id)
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

  return (
    <article className="driver-detail-trip">
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
            startIdsRef.current = activitiesRef.current.map((item) => item.id)
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
