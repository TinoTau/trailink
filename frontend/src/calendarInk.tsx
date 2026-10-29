import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { CALENDAR_HOLD_MS, calendarHoldShifted } from './calendarDay'
import './calendarDay.css'

const STORAGE_KEY = 'trailink.calendar.inkBalance'
const SIDE_KEY = 'trailink.calendar.inkSide'
const EDGE_PX = 20
const SIDE_COMMIT_PX = 48
const PLACE_LOW = 0.62
const PLACE_HIGH = 0.06
const TEXT_LOW = 0.45
const TEXT_HIGH = 1

export const CALENDAR_INK_DEFAULT = 0.5

export type CalendarInkSide = 'left' | 'right'

export function clampCalendarInk(value: number) {
  if (!Number.isFinite(value)) {
    return CALENDAR_INK_DEFAULT
  }
  return Math.min(1, Math.max(0, value))
}

export function readCalendarInk() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw == null ? CALENDAR_INK_DEFAULT : clampCalendarInk(Number(raw))
  } catch {
    return CALENDAR_INK_DEFAULT
  }
}

export function readCalendarInkSide(): CalendarInkSide {
  try {
    return localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}

export function calendarInkOpacities(balance: number) {
  const t = clampCalendarInk(balance)
  return {
    place: PLACE_LOW + (PLACE_HIGH - PLACE_LOW) * t,
    text: TEXT_LOW + (TEXT_HIGH - TEXT_LOW) * t,
  }
}

export function calendarInkStyle(balance: number): CSSProperties {
  const ink = calendarInkOpacities(balance)
  return {
    '--calendar-place-opacity': String(ink.place),
    '--calendar-text-opacity': String(ink.text),
  } as CSSProperties
}

export function useCalendarInk() {
  const [balance, setBalance] = useState(readCalendarInk)
  const [side, setSide] = useState(readCalendarInkSide)
  function change(next: number) {
    const value = clampCalendarInk(next)
    setBalance(value)
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      // 浏览器拒绝写入时，这次拖动仍然改当前页面。
    }
  }
  function changeSide(next: CalendarInkSide) {
    setSide(next)
    try {
      localStorage.setItem(SIDE_KEY, next)
    } catch {
      // 浏览器拒绝写入时，这次拖动仍然改当前页面。
    }
  }
  return { balance, setBalance: change, side, setSide: changeSide, style: calendarInkStyle(balance) }
}

export function CalendarInkBar({
  balance,
  side,
  onChange,
  onSideChange,
}: {
  balance: number
  side: CalendarInkSide
  onChange: (value: number) => void
  onSideChange: (side: CalendarInkSide) => void
}) {
  const dragRef = useRef<{
    pointerId: number
    mode: 'pending' | 'value' | 'side' | 'ignored'
    startX: number
    startY: number
    x: number
    y: number
    sideReady: boolean
    originSide: CalendarInkSide
    lastX: number
    timer: number | null
  } | null>(null)
  const [movingLeft, setMovingLeft] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      const drag = dragRef.current
      if (drag?.timer != null) {
        window.clearTimeout(drag.timer)
      }
    }
  }, [])

  function clearHoldTimer() {
    const drag = dragRef.current
    if (drag?.timer != null) {
      window.clearTimeout(drag.timer)
      drag.timer = null
    }
  }

  function valueFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.height <= 0) {
      return balance
    }
    return clampCalendarInk(1 - (event.clientY - rect.top) / rect.height)
  }

  function followPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const host = event.currentTarget.closest('.calendar-ink-host')
    if (!host) {
      return
    }
    const hostRect = host.getBoundingClientRect()
    const barWidth = event.currentTarget.offsetWidth
    const raw = event.clientX - hostRect.left - barWidth / 2
    const max = Math.max(EDGE_PX, hostRect.width - barWidth - EDGE_PX)
    setMovingLeft(Math.min(max, Math.max(EDGE_PX, raw)))
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    if (drag.timer != null) {
      window.clearTimeout(drag.timer)
    }
    dragRef.current = null
    if (drag.mode === 'pending') {
      onChange(valueFromPointer(event))
      return
    }
    if (drag.mode !== 'side') {
      return
    }
    setMovingLeft(null)
    const traveled = drag.lastX - drag.startX
    const next = traveled <= -SIDE_COMMIT_PX ? 'left' : traveled >= SIDE_COMMIT_PX ? 'right' : drag.originSide
    onSideChange(next)
  }

  return (
    <div
      className={movingLeft == null ? 'calendar-ink-bar' : 'calendar-ink-bar is-moving'}
      style={
        movingLeft == null
          ? side === 'left'
            ? { left: EDGE_PX, right: 'auto' }
            : { left: 'auto', right: EDGE_PX }
          : { left: movingLeft, right: 'auto' }
      }
      data-side={side}
      role="slider"
      aria-label="浮雕字和日期文字"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(balance * 100)}
      aria-valuetext="向上日期文字更明显，向下浮雕更明显"
      tabIndex={0}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.focus()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // 触点已经结束时，浏览器会拒绝捕获。
        }
        clearHoldTimer()
        const touch = event.pointerType === 'touch'
        const drag = {
          pointerId: event.pointerId,
          mode: 'pending' as const,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          sideReady: !touch,
          originSide: side,
          lastX: event.clientX,
          timer: null as number | null,
        }
        if (touch) {
          drag.timer = window.setTimeout(() => {
            if (dragRef.current !== drag) {
              return
            }
            drag.sideReady = true
            drag.timer = null
          }, CALENDAR_HOLD_MS)
        }
        dragRef.current = drag
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId || drag.mode === 'ignored') {
          return
        }
        drag.lastX = event.clientX
        if (drag.mode === 'pending') {
          if (!calendarHoldShifted(drag, event.clientX, event.clientY)) {
            return
          }
          const vertical = Math.abs(event.clientY - drag.startY) >= Math.abs(event.clientX - drag.startX)
          if (vertical) {
            clearHoldTimer()
            drag.mode = 'value'
          } else if (drag.sideReady) {
            clearHoldTimer()
            drag.mode = 'side'
          } else {
            clearHoldTimer()
            drag.mode = 'ignored'
            return
          }
        }
        if (drag.mode === 'value') {
          onChange(valueFromPointer(event))
          return
        }
        followPointer(event)
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          onChange(balance + 0.05)
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          onChange(balance - 0.05)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onSideChange('left')
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          onSideChange('right')
        }
      }}
    >
      <span className="calendar-ink-bar-fill" style={{ height: `calc((100% - 24px) * ${balance})` }} />
      <span
        className="calendar-ink-bar-thumb"
        style={{ top: `calc(100% - 12px - (100% - 24px) * ${balance})` }}
      />
    </div>
  )
}
