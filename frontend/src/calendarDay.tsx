import './calendarDay.css'

export const CALENDAR_DATE_ATTR = 'data-calendar-date'
export const CALENDAR_HOLD_MS = 500
const HOLD_SLOP_PX = 10

export type CalendarHold = {
  pointerId: number
  x: number
  y: number
  date: string
  target: HTMLElement
  timer: number
}

export function calendarDateAtPoint(x: number, y: number) {
  const cells = document.querySelectorAll<HTMLElement>(`[${CALENDAR_DATE_ATTR}]`)
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect()
    if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
      return cell.getAttribute(CALENDAR_DATE_ATTR)
    }
  }
  return null
}

function dragPointer(event: PointerEvent | TouchEvent) {
  if (window.TouchEvent && event instanceof TouchEvent) {
    return null
  }
  return event as PointerEvent
}

export function pointFromDragEvent(event: PointerEvent | TouchEvent) {
  if (window.TouchEvent && event instanceof TouchEvent) {
    const touch = event.touches[0] || event.changedTouches[0]
    if (!touch) {
      return null
    }
    return { x: touch.clientX, y: touch.clientY }
  }
  const pointer = dragPointer(event)
  return pointer ? { x: pointer.clientX, y: pointer.clientY } : null
}

export function calendarHoldShifted(hold: { x: number; y: number }, x: number, y: number) {
  const dx = x - hold.x
  const dy = y - hold.y
  return dx * dx + dy * dy > HOLD_SLOP_PX * HOLD_SLOP_PX
}

const DRAG_SCROLL_EDGE = 28

function dateInsideScroller(scroller: HTMLElement, x: number, y: number, allowNearest: boolean) {
  const bounds = scroller.getBoundingClientRect()
  const cells = scroller.querySelectorAll<HTMLElement>(`[${CALENDAR_DATE_ATTR}]`)
  let nearest: { date: string; dist: number } | null = null
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect()
    if (rect.bottom <= bounds.top + 1 || rect.top >= bounds.bottom - 1) {
      continue
    }
    const date = cell.getAttribute(CALENDAR_DATE_ATTR)
    if (!date) {
      continue
    }
    if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
      return date
    }
    if (!allowNearest) {
      continue
    }
    const cx = (rect.left + rect.right) / 2
    const cy = Math.min(rect.bottom, Math.max(rect.top, y))
    const dist = (cx - x) * (cx - x) + (cy - y) * (cy - y)
    if (!nearest || dist < nearest.dist) {
      nearest = { date, dist }
    }
  }
  return nearest?.date ?? null
}

export function followCalendarDrag(scroller: HTMLElement | null, x: number, y: number) {
  if (!scroller) {
    return null
  }
  const bounds = scroller.getBoundingClientRect()
  const overX = x >= bounds.left && x < bounds.right
  const below = y - (bounds.bottom - DRAG_SCROLL_EDGE)
  const above = bounds.top + DRAG_SCROLL_EDGE - y
  if (overX && below > 0) {
    scroller.scrollTop += Math.min(14, 3 + below * 0.12)
  } else if (overX && above > 0) {
    scroller.scrollTop -= Math.min(14, 3 + above * 0.12)
  }
  return dateInsideScroller(scroller, x, y, overX && (below > 0 || above > 0))
}

export function calendarDateFromDrag(event: PointerEvent | TouchEvent, lockScroll = false) {
  if (window.TouchEvent && event instanceof TouchEvent) {
    if (lockScroll && event.cancelable) {
      event.preventDefault()
    }
    const touch = event.touches[0]
    if (!touch) {
      return null
    }
    return calendarDateAtPoint(touch.clientX, touch.clientY)
  }
  const pointer = dragPointer(event)
  return pointer ? calendarDateAtPoint(pointer.clientX, pointer.clientY) : null
}

export function captureCalendarPointer(target: HTMLElement, pointerId: number) {
  try {
    target.setPointerCapture(pointerId)
  } catch {
    // 触点已经结束时，浏览器会拒绝捕获。
  }
}

export function CalendarDayCaption({ day, label, place }: { day?: number | string; label?: string; place?: string }) {
  if (day === undefined && !label && !place) {
    return null
  }
  return (
    <span className="calendar-day-caption">
      {place ? <i className="calendar-day-place" aria-hidden>{place}</i> : null}
      {day !== undefined ? <b>{day}</b> : null}
      {label ? <em>{label}</em> : null}
    </span>
  )
}
