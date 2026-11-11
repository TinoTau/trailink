import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { CALENDAR_HOLD_MS, calendarHoldShifted } from './calendarDay'
import './calendarDay.css'
import { PREF_KEYS, readPref, writePref } from './localPrefs'

/** 移动时离屏幕边缘至少留这么多。 */
const EDGE_PX = 8
const PLACE_LOW = 0.7
const PLACE_HIGH = 0.06
const TEXT_LOW = 0.08
const TEXT_HIGH = 1

export const CALENDAR_INK_DEFAULT = 0.5
/** 带「车牌」挡的控制条：原来的整段（浮雕 → 日期和公司）占下面这一部分，最上面一小段是车牌挡。 */
const PLATE_STEP_AT = 0.8

export type CalendarInkSide = 'left' | 'right'
/** 控制条停在屏幕左侧或右侧的上、中、下。 */
export type CalendarInkLevel = 'top' | 'middle' | 'bottom'

export function clampCalendarInk(value: number) {
  if (!Number.isFinite(value)) {
    return CALENDAR_INK_DEFAULT
  }
  return Math.min(1, Math.max(0, value))
}

export function readCalendarInk() {
  const raw = readPref(PREF_KEYS.calendarInkBalance)
  return raw == null ? CALENDAR_INK_DEFAULT : clampCalendarInk(Number(raw))
}

export function readCalendarInkSide(): CalendarInkSide {
  return readPref(PREF_KEYS.calendarInkSide) === 'left' ? 'left' : 'right'
}

export function readCalendarInkLevel(): CalendarInkLevel {
  const raw = readPref(PREF_KEYS.calendarInkLevel)
  return raw === 'top' || raw === 'bottom' ? raw : 'middle'
}

/** 松手的位置落在屏幕哪一格：左右按屏幕中线，上中下按屏幕高度三等分。 */
function placeAt(x: number, y: number): { side: CalendarInkSide; level: CalendarInkLevel } {
  const width = window.innerWidth || 1
  const height = window.innerHeight || 1
  return {
    side: x < width / 2 ? 'left' : 'right',
    level: y < height / 3 ? 'top' : y < (height * 2) / 3 ? 'middle' : 'bottom',
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
  const [level, setLevel] = useState(readCalendarInkLevel)
  const [plate, setPlateState] = useState(() => readPref(PREF_KEYS.calendarInkPlate) === '1')
  function writePlate(on: boolean) {
    setPlateState(on)
    writePref(PREF_KEYS.calendarInkPlate, on ? '1' : '0')
  }
  function change(next: number) {
    const value = clampCalendarInk(next)
    setBalance(value)
    writePref(PREF_KEYS.calendarInkBalance, String(value))
    if (plate) {
      writePlate(false)
    }
  }
  /** 车牌挡：日期文字和最上面一样清楚，公司换成车牌。 */
  function changePlate(on: boolean) {
    if (on) {
      setBalance(1)
      writePref(PREF_KEYS.calendarInkBalance, '1')
    }
    writePlate(on)
  }
  function changePlace(nextSide: CalendarInkSide, nextLevel: CalendarInkLevel) {
    setSide(nextSide)
    setLevel(nextLevel)
    writePref(PREF_KEYS.calendarInkSide, nextSide)
    writePref(PREF_KEYS.calendarInkLevel, nextLevel)
  }
  return {
    balance,
    setBalance: change,
    /** 只有带车牌挡的控制条（我的行程）会打开它；其他页面忽略。 */
    plate,
    setPlate: changePlate,
    side,
    level,
    setPlace: changePlace,
    style: calendarInkStyle(balance),
  }
}

/** 一份透明度设置；调度台的司导卡片和订单卡片共用同一份，拖一处两边一起变。 */
export type CalendarInk = ReturnType<typeof useCalendarInk>

/**
 * 透明度控制条：固定在屏幕上（不跟着卡片），停在左侧或右侧的上、中、下，一共 6 个位置。
 * - 上下拖：调透明度（向上日期文字更明显，向下浮雕更明显）。
 * - 按住约 0.5 秒再拖，或用鼠标横着拖：拿起控制条随手指移动，松手停到最近的那一格。
 */
export function CalendarInkBar({ ink, plateStep = false }: { ink: CalendarInk; plateStep?: boolean }) {
  const { balance, side, level } = ink
  const plate = plateStep && ink.plate
  /** 滑块在条上的位置（0 底，1 顶）。带车牌挡时，原来的整段压在下面 80%，最上面是车牌挡。 */
  const position = !plateStep ? balance : plate ? 1 : balance * PLATE_STEP_AT

  function applyPosition(next: number) {
    const value = clampCalendarInk(next)
    if (!plateStep) {
      ink.setBalance(value)
      return
    }
    // 过了刻度和顶端的中点就进车牌挡（滑块吸到顶）；否则按比例换回原来的透明度。
    if (value > (PLATE_STEP_AT + 1) / 2) {
      if (!ink.plate) {
        ink.setPlate(true)
      }
      return
    }
    ink.setBalance(Math.min(1, value / PLATE_STEP_AT))
  }
  const dragRef = useRef<{
    pointerId: number
    mode: 'pending' | 'value' | 'move' | 'ignored'
    startX: number
    startY: number
    x: number
    y: number
    /** 已经按满 0.5 秒：再拖就是移动控制条（任何方向）。 */
    held: boolean
    mouse: boolean
    timer: number | null
  } | null>(null)
  const [moving, setMoving] = useState<{ left: number; top: number } | null>(null)
  const [held, setHeld] = useState(false)

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
      return position
    }
    return clampCalendarInk(1 - (event.clientY - rect.top) / rect.height)
  }

  /** 移动时控制条的中心跟着手指，不出屏幕。 */
  function followPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const bar = event.currentTarget
    const width = bar.offsetWidth
    const height = bar.offsetHeight
    const left = Math.min(window.innerWidth - width - EDGE_PX, Math.max(EDGE_PX, event.clientX - width / 2))
    const top = Math.min(window.innerHeight - height - EDGE_PX, Math.max(EDGE_PX, event.clientY - height / 2))
    setMoving({ left, top })
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
    setHeld(false)
    if (drag.mode === 'pending' && !drag.held) {
      applyPosition(valueFromPointer(event))
      return
    }
    if (drag.mode !== 'move') {
      return
    }
    setMoving(null)
    const next = placeAt(event.clientX, event.clientY)
    ink.setPlace(next.side, next.level)
  }

  const className = ['calendar-ink-bar', plate ? 'is-plate' : '', moving ? 'is-moving' : '', held ? 'is-held' : ''].filter(Boolean).join(' ')
  const bar = (
    <div
      className={className}
      style={moving ? { left: moving.left, top: moving.top } : undefined}
      data-side={side}
      data-level={level}
      role="slider"
      aria-label="浮雕字和日期文字"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position * 100)}
      aria-valuetext={
        plate
          ? '最上面一挡：日期和车牌'
          : plateStep
            ? '向上日期文字更明显，向下浮雕更明显；最上面一挡显示车牌'
            : '向上日期文字更明显，向下浮雕更明显'
      }
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
        const drag = {
          pointerId: event.pointerId,
          mode: 'pending' as 'pending' | 'value' | 'move' | 'ignored',
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          held: false,
          mouse: event.pointerType === 'mouse',
          timer: null as number | null,
        }
        drag.timer = window.setTimeout(() => {
          if (dragRef.current !== drag || drag.mode !== 'pending') {
            return
          }
          drag.held = true
          drag.timer = null
          setHeld(true)
          navigator.vibrate?.(15)
        }, CALENDAR_HOLD_MS)
        dragRef.current = drag
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId || drag.mode === 'ignored') {
          return
        }
        if (drag.mode === 'pending') {
          if (!calendarHoldShifted(drag, event.clientX, event.clientY)) {
            return
          }
          clearHoldTimer()
          const vertical = Math.abs(event.clientY - drag.startY) >= Math.abs(event.clientX - drag.startX)
          if (drag.held || (drag.mouse && !vertical)) {
            drag.mode = 'move'
            setHeld(false)
          } else if (vertical) {
            drag.mode = 'value'
          } else {
            drag.mode = 'ignored'
            return
          }
        }
        if (drag.mode === 'value') {
          applyPosition(valueFromPointer(event))
          return
        }
        followPointer(event)
      }}
      onPointerUp={finishDrag}
      onPointerCancel={(event) => {
        const drag = dragRef.current
        if (drag && drag.pointerId === event.pointerId) {
          clearHoldTimer()
          dragRef.current = null
          setHeld(false)
          setMoving(null)
        }
      }}
      onKeyDown={(event) => {
        const levels: CalendarInkLevel[] = ['top', 'middle', 'bottom']
        const index = levels.indexOf(level)
        if (event.shiftKey && event.key === 'ArrowUp') {
          event.preventDefault()
          ink.setPlace(side, levels[Math.max(0, index - 1)])
        } else if (event.shiftKey && event.key === 'ArrowDown') {
          event.preventDefault()
          ink.setPlace(side, levels[Math.min(2, index + 1)])
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          if (plateStep && balance >= 1) {
            ink.setPlate(true)
          } else {
            ink.setBalance(balance + 0.05)
          }
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          ink.setBalance(plate ? 1 : balance - 0.05)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          ink.setPlace('left', level)
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          ink.setPlace('right', level)
        }
      }}
    >
      <span className="calendar-ink-bar-fill" style={{ height: `calc((100% - 24px) * ${position})` }} />
      {plateStep ? (
        <span
          className={plate ? 'calendar-ink-bar-notch is-on' : 'calendar-ink-bar-notch'}
          style={{ top: `calc(100% - 12px - (100% - 24px) * ${PLATE_STEP_AT})` }}
          aria-hidden
        />
      ) : null}
      <span
        className="calendar-ink-bar-thumb"
        style={{ top: `calc(100% - 12px - (100% - 24px) * ${position})` }}
      />
    </div>
  )
  // 放到 body 上：不受卡片滚动、动画（transform）影响，位置按整个屏幕算。
  return typeof document === 'undefined' ? bar : createPortal(bar, document.body)
}
