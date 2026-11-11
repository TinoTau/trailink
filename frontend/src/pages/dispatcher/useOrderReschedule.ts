import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  CALENDAR_HOLD_MS,
  calendarHoldShifted,
  captureCalendarPointer,
  followCalendarDrag,
  pointFromDragEvent,
} from '../../calendarDay'
import { formatLocalDate, parseYmd } from '../../localDate'

/** 拖整段是平移（行程跟着走）；长按开头或末尾那天再拖是拉长缩短（原来的日期不动）。 */
type RescheduleMode = 'move' | 'resize'

/** 改日期的方案：新的起止日期，以及原来每一天平移多少天。 */
export interface ReschedulePlan {
  start: string
  end: string
  shift: number
}

interface Drag {
  from: string
  cur: string
  base: ReschedulePlan
  mode: RescheduleMode
  /** 拉长缩短时拖的是哪一头；只有一天时为 null，等拖动方向再定。 */
  edge: 'start' | 'end' | null
}

export const RESCHEDULE_MAX_DAYS = 93

export function addDays(date: string, days: number) {
  const value = parseYmd(date)
  value.setDate(value.getDate() + days)
  return formatLocalDate(value)
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000)
}

/** 拖动中，按手指所在的日期算出新的方案。 */
function planFor(drag: Drag): ReschedulePlan {
  const { base, from, cur } = drag
  if (drag.mode === 'move') {
    const delta = daysBetween(from, cur)
    return { start: addDays(base.start, delta), end: addDays(base.end, delta), shift: base.shift + delta }
  }
  // 只有一天时，看往哪边拖：往前拖是开头，往后拖是末尾。
  const edge = drag.edge ?? (cur < from ? 'start' : 'end')
  if (edge === 'start') {
    return { start: cur < base.end ? cur : base.end, end: base.end, shift: base.shift }
  }
  return { start: base.start, end: cur > base.start ? cur : base.start, shift: base.shift }
}

/** 按下的是不是开头或末尾那天：是的话长按约 0.5 秒拉长缩短，没等够就拖是整段平移。只有一天时等拖动方向再定。 */
function edgeOf(base: ReschedulePlan, date: string): 'start' | 'end' | 'single' | null {
  if (base.start === base.end && date === base.start) {
    return 'single'
  }
  if (date === base.start) {
    return 'start'
  }
  return date === base.end ? 'end' : null
}

interface Pending {
  date: string
  edge: 'start' | 'end' | 'single'
  x: number | null
  y: number | null
  target: HTMLElement | null
  pointerId: number
  timer: number
}

/**
 * 调度台订单日历上拖动改日期，不用切换：
 * - 按住行程里的任意一天直接拖：整段平移，行程、活动、司导跟着走。
 * - 长按开头或末尾那天约 0.5 秒（不动）再拖：拉长或缩短，原来的日期不动。没等够就拖，仍是整段平移。
 * 鼠标、触屏一样；改日期时行程上的格子不滚动日历（滚动在别的格子上）。拖到上下边缘时日历跟着滚动。
 * 松手后方案留在页面上，点「保存」才写入。
 */
export function useOrderReschedule(scrollRef: RefObject<HTMLElement | null>) {
  const [orderId, setOrderId] = useState<string | null>(null)
  const [original, setOriginal] = useState<ReschedulePlan | null>(null)
  const [plan, setPlan] = useState<ReschedulePlan | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  /** 长按开头 / 末尾已经满 0.5 秒、进入拉长缩短（给界面一个提示）。 */
  const [resizing, setResizing] = useState(false)
  const dragRef = useRef<Drag | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const planRef = useRef(plan)

  useEffect(() => {
    planRef.current = plan
  })

  function beginDrag(date: string, mode: RescheduleMode, edge: 'start' | 'end' | null) {
    const base = planRef.current
    if (!base) {
      return
    }
    const next: Drag = { from: date, cur: date, base, mode, edge }
    dragRef.current = next
    setDrag(next)
    setResizing(mode === 'resize')
  }
  const beginDragRef = useRef(beginDrag)
  useEffect(() => {
    beginDragRef.current = beginDrag
  })

  useEffect(() => {
    function clearPending() {
      const pending = pendingRef.current
      if (pending) {
        window.clearTimeout(pending.timer)
        pendingRef.current = null
      }
    }
    let followFrame = 0
    let followPoint: { x: number; y: number } | null = null
    function stopFollow() {
      if (followFrame) {
        window.cancelAnimationFrame(followFrame)
        followFrame = 0
      }
      followPoint = null
    }
    function tickFollow() {
      followFrame = 0
      const current = dragRef.current
      if (!current || !followPoint) {
        return
      }
      const date = followCalendarDrag(scrollRef.current, followPoint.x, followPoint.y)
      if (date && date !== current.cur) {
        const next = { ...current, cur: date }
        dragRef.current = next
        setDrag(next)
      }
      followFrame = window.requestAnimationFrame(tickFollow)
    }
    function onMove(event: PointerEvent | TouchEvent) {
      const point = pointFromDragEvent(event)
      if (!point) {
        return
      }
      const pending = pendingRef.current
      if (pending) {
        if (pending.x === null || pending.y === null) {
          pending.x = point.x
          pending.y = point.y
          return
        }
        // 开头 / 末尾还没按满 0.5 秒就动了：当作整段平移。
        if (calendarHoldShifted({ x: pending.x, y: pending.y }, point.x, point.y)) {
          clearPending()
          beginDragRef.current(pending.date, 'move', null)
        } else {
          return
        }
      }
      if (!dragRef.current) {
        return
      }
      if (window.TouchEvent && event instanceof TouchEvent && event.cancelable) {
        event.preventDefault()
      }
      followPoint = point
      if (!followFrame) {
        followFrame = window.requestAnimationFrame(tickFollow)
      }
    }
    function onFinish() {
      clearPending()
      stopFollow()
      setResizing(false)
      const current = dragRef.current
      if (!current) {
        return
      }
      dragRef.current = null
      setDrag(null)
      setPlan(planFor(current))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('pointerup', onFinish)
    window.addEventListener('touchend', onFinish)
    window.addEventListener('pointercancel', onFinish)
    window.addEventListener('touchcancel', onFinish)
    return () => {
      clearPending()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('pointerup', onFinish)
      window.removeEventListener('touchend', onFinish)
      window.removeEventListener('pointercancel', onFinish)
      window.removeEventListener('touchcancel', onFinish)
      stopFollow()
    }
  }, [scrollRef])

  /** 按下某一天：中间的日子立即开始整段平移；开头 / 末尾先等 0.5 秒，看是长按还是直接拖。 */
  function start(date: string, x: number | null, y: number | null, target: HTMLElement | null, pointerId: number) {
    const base = planRef.current
    if (!base || dragRef.current) {
      return
    }
    const existing = pendingRef.current
    if (existing) {
      // 同一次触摸里 pointerdown 和 touchstart 都会进来，只补上坐标和指针。
      if (x !== null && y !== null) {
        existing.x = x
        existing.y = y
      }
      if (target) {
        existing.target = target
      }
      if (pointerId >= 0) {
        existing.pointerId = pointerId
      }
      return
    }
    if (date < base.start || date > base.end) {
      return
    }
    const edge = edgeOf(base, date)
    if (!edge) {
      beginDrag(date, 'move', null)
      if (target && pointerId >= 0) {
        captureCalendarPointer(target, pointerId)
      }
      return
    }
    const pending: Pending = {
      date,
      edge,
      x,
      y,
      target,
      pointerId,
      timer: window.setTimeout(() => {
        if (pendingRef.current !== pending) {
          return
        }
        pendingRef.current = null
        beginDragRef.current(pending.date, 'resize', pending.edge === 'single' ? null : pending.edge)
        if (pending.target && pending.pointerId >= 0) {
          captureCalendarPointer(pending.target, pending.pointerId)
        }
        navigator.vibrate?.(15)
      }, CALENDAR_HOLD_MS),
    }
    pendingRef.current = pending
  }

  const preview = drag ? planFor(drag) : plan
  const changed = Boolean(
    preview && original && (preview.start !== original.start || preview.end !== original.end || preview.shift !== original.shift),
  )

  return {
    orderId,
    active: orderId !== null,
    original,
    preview,
    dragging: drag !== null,
    resizing,
    changed,
    tooLong: preview ? daysBetween(preview.start, preview.end) + 1 > RESCHEDULE_MAX_DAYS : false,
    /** 开始给某张订单改日期。 */
    open(id: string, startDate: string, endDate: string) {
      const base = { start: startDate, end: endDate, shift: 0 }
      setOrderId(id)
      setOriginal(base)
      setPlan(base)
    },
    close() {
      dragRef.current = null
      setDrag(null)
      setOrderId(null)
      setOriginal(null)
      setPlan(null)
    },
    /** 还原成打开时的样子。 */
    reset() {
      setPlan(original)
    },
    /** 鼠标按下（日历卡片已经抓住了指针）。 */
    press(date: string) {
      start(date, null, null, null, -1)
    },
    /** 触屏按下。 */
    hold(date: string, x: number, y: number, target: HTMLElement, pointerId: number) {
      start(date, x, y, target, pointerId)
    },
    /** 鼠标拖动经过某一天。 */
    enter(date: string) {
      const current = dragRef.current
      if (current && current.cur !== date) {
        const next = { ...current, cur: date }
        dragRef.current = next
        setDrag(next)
      }
    },
  }
}
