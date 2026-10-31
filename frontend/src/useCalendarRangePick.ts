import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  CALENDAR_HOLD_MS,
  type CalendarHold,
  calendarHoldShifted,
  captureCalendarPointer,
  followCalendarDrag,
  pointFromDragEvent,
} from './calendarDay'
import { orderedRange } from './localDate'

/**
 * 在日历上框选起止日期（我的行程「行程管理」和调度台「创建订单」共用）。
 * 鼠标按下即拖；触屏先按住约 0.5 秒才开始拖，未满时滑动仍是滚动，点一下只选中当天。
 * 拖到上下边缘时日历跟着滚动。
 *
 * @param scrollRef 日历的滚动容器。
 * @param onPick 开始选择时调用（例如收起已经展开的当日卡片）。
 */
export function useCalendarRangePick(scrollRef: RefObject<HTMLElement | null>, onPick?: () => void) {
  const [start, setStart] = useState<string | null>(null)
  const [end, setEnd] = useState<string | null>(null)
  const dragging = useRef(false)
  const holdRef = useRef<CalendarHold | null>(null)
  const onPickRef = useRef(onPick)

  useEffect(() => {
    onPickRef.current = onPick
  })

  useEffect(() => {
    function cancelHold() {
      const hold = holdRef.current
      if (hold) {
        window.clearTimeout(hold.timer)
        holdRef.current = null
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
      if (!dragging.current || !followPoint) {
        return
      }
      const date = followCalendarDrag(scrollRef.current, followPoint.x, followPoint.y)
      if (date) {
        setEnd((current) => (current === date ? current : date))
      }
      followFrame = window.requestAnimationFrame(tickFollow)
    }
    function onMove(event: PointerEvent | TouchEvent) {
      const hold = holdRef.current
      const point = pointFromDragEvent(event)
      if (hold && point && calendarHoldShifted(hold, point.x, point.y)) {
        cancelHold()
        return
      }
      if (!dragging.current || !point) {
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
    function finish(event: PointerEvent | TouchEvent, selectIfTap: boolean) {
      const hold = holdRef.current
      if (hold) {
        const point = pointFromDragEvent(event)
        const shifted = point ? calendarHoldShifted(hold, point.x, point.y) : false
        cancelHold()
        if (selectIfTap && !shifted) {
          setStart(hold.date)
          setEnd(hold.date)
          onPickRef.current?.()
        }
      }
      dragging.current = false
      stopFollow()
    }
    const onFinish = (event: PointerEvent | TouchEvent) => finish(event, true)
    const onCancel = (event: PointerEvent | TouchEvent) => finish(event, false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('pointerup', onFinish)
    window.addEventListener('touchend', onFinish)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchcancel', onCancel)
    return () => {
      cancelHold()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('pointerup', onFinish)
      window.removeEventListener('touchend', onFinish)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('touchcancel', onCancel)
      stopFollow()
    }
  }, [scrollRef])

  function begin(date: string) {
    dragging.current = true
    setStart(date)
    setEnd(date)
    onPickRef.current?.()
  }

  const [from, to] = start ? orderedRange(start, end) : [null, null]
  return {
    from,
    to,
    /** 鼠标按下：立即开始拖选。 */
    press: begin,
    /** 触屏按下：按住约 0.5 秒后才开始拖选。 */
    hold(date: string, x: number, y: number, target: HTMLElement, pointerId: number) {
      const existing = holdRef.current
      if (existing) {
        existing.x = x
        existing.y = y
        existing.target = target
        if (pointerId >= 0) {
          existing.pointerId = pointerId
        }
        return
      }
      const hold: CalendarHold = {
        pointerId,
        x,
        y,
        date,
        target,
        timer: window.setTimeout(() => {
          if (holdRef.current !== hold) {
            return
          }
          holdRef.current = null
          begin(hold.date)
          if (hold.pointerId >= 0) {
            captureCalendarPointer(hold.target, hold.pointerId)
          }
        }, CALENDAR_HOLD_MS),
      }
      holdRef.current = hold
    },
    /** 拖选中经过某一天。 */
    enter(date: string) {
      if (dragging.current) {
        setEnd(date)
      }
    },
    clear() {
      const hold = holdRef.current
      if (hold) {
        window.clearTimeout(hold.timer)
        holdRef.current = null
      }
      dragging.current = false
      setStart(null)
      setEnd(null)
    },
  }
}
