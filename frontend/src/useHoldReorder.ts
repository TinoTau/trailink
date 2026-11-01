import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CALENDAR_HOLD_MS, calendarHoldShifted, pointFromDragEvent } from './calendarDay'

const REORDER_ATTR = 'data-reorder-id'
const IGNORE = 'button, a, input, textarea, select, label'

type Hold = { id: string; pointerId: number; x: number; y: number; timer: number; target: HTMLElement }

/**
 * 拖动重新排序（活动选择框、当日详情的活动共用）。手机上滑动屏幕优先：
 * <ul>
 * <li>选项其他位置：长按约 0.5 秒后才开始拖动；按住期间手指一动就当作滚动。</li>
 * <li>拖动把手（⋮⋮，handleProps）：按下立即拖动，这一小块不滚动页面。</li>
 * </ul>
 * 拖动中页面不滚动。松手后顺序有变化才调用 onCommit。拖动结束后紧跟着的那次点击会被吞掉，免得顺手勾选或打开。
 *
 * @param ids 当前顺序；拖动中不跟随外部变化。
 */
export function useHoldReorder(ids: string[], onCommit: (ids: string[]) => void) {
  const [order, setOrder] = useState(ids)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const holdRef = useRef<Hold | null>(null)
  const dragRef = useRef<{ id: string; start: string[]; lastOver: string | null } | null>(null)
  const orderRef = useRef(order)
  const commitRef = useRef(onCommit)
  const swallowClickUntil = useRef(0)
  const idsKey = ids.join('|')

  useEffect(() => {
    commitRef.current = onCommit
    orderRef.current = order
  })

  useEffect(() => {
    if (!dragRef.current) {
      // oxlint-disable-next-line react/set-state-in-effect
      setOrder(idsKey ? idsKey.split('|') : [])
    }
  }, [idsKey])

  useEffect(() => {
    function cancelHold() {
      const hold = holdRef.current
      if (hold) {
        window.clearTimeout(hold.timer)
        holdRef.current = null
      }
    }

    function onMove(event: PointerEvent | TouchEvent) {
      const point = pointFromDragEvent(event)
      const hold = holdRef.current
      if (hold && point && calendarHoldShifted(hold, point.x, point.y)) {
        cancelHold()
        return
      }
      if (!dragRef.current || !point) {
        return
      }
      if (window.TouchEvent && event instanceof TouchEvent && event.cancelable) {
        event.preventDefault()
      }
      const overId = document.elementFromPoint(point.x, point.y)?.closest(`[${REORDER_ATTR}]`)?.getAttribute(REORDER_ATTR)
      const drag = dragRef.current
      if (!overId || overId === drag.id) {
        drag.lastOver = null
        return
      }
      // 同一次手指移动会同时收到 pointermove 和 touchmove，页面还没重绘时第二次会再换回去；和同一项只换一次。
      if (overId === drag.lastOver) {
        return
      }
      drag.lastOver = overId
      const dragId = drag.id
      setOrder((current) => {
        const from = current.indexOf(dragId)
        const to = current.indexOf(overId)
        if (from < 0 || to < 0) {
          return current
        }
        const next = [...current]
        next.splice(from, 1)
        next.splice(to, 0, dragId)
        return next
      })
    }

    function onEnd() {
      cancelHold()
      const drag = dragRef.current
      if (!drag) {
        return
      }
      dragRef.current = null
      setDraggingId(null)
      swallowClickUntil.current = performance.now() + 400
      const next = orderRef.current
      if (next.some((id, index) => id !== drag.start[index])) {
        commitRef.current(next)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      cancelHold()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  function startDrag(id: string, target: HTMLElement, pointerId: number) {
    dragRef.current = { id, start: orderRef.current, lastOver: null }
    setDraggingId(id)
    try {
      target.setPointerCapture(pointerId)
    } catch {
      // 触点已经结束时浏览器会拒绝。
    }
  }

  /** 拖动把手：按下立即开始拖动。把手的样式要设 touch-action: none。 */
  function handleProps(id: string) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button > 0) {
          return
        }
        event.stopPropagation()
        const hold = holdRef.current
        if (hold) {
          window.clearTimeout(hold.timer)
          holdRef.current = null
        }
        startDrag(id, event.currentTarget, event.pointerId)
      },
      onClick(event: React.MouseEvent) {
        event.stopPropagation()
      },
    }
  }

  function itemProps(id: string) {
    return {
      [REORDER_ATTR]: id,
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button > 0 || (event.target as HTMLElement).closest(IGNORE)) {
          return
        }
        const target = event.currentTarget
        const hold: Hold = {
          id,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          target,
          timer: window.setTimeout(() => {
            if (holdRef.current !== hold) {
              return
            }
            holdRef.current = null
            startDrag(id, target, hold.pointerId)
            navigator.vibrate?.(10)
          }, CALENDAR_HOLD_MS),
        }
        holdRef.current = hold
      },
      onClickCapture(event: React.MouseEvent) {
        if (performance.now() < swallowClickUntil.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      },
      onContextMenu(event: React.MouseEvent) {
        event.preventDefault()
      },
    }
  }

  return { order, draggingId, itemProps, handleProps }
}
