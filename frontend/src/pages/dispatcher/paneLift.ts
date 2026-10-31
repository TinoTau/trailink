import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export function paneLiftLimit(maxPane: HTMLElement) {
  return maxPane.getBoundingClientRect().height
}

export function startPaneLift(
  event: ReactPointerEvent<HTMLElement>,
  {
    direction,
    overlay,
    pane,
    maxPane,
    settling,
    current,
    minLift = 0,
    onChange,
    onDragging,
  }: {
    direction: 'up' | 'down'
    overlay: HTMLElement
    pane: HTMLElement
    maxPane: HTMLElement
    settling: boolean
    current: number
    minLift?: number
    onChange: (value: number) => void
    onDragging: (dragging: boolean) => void
  },
) {
  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, textarea, select, label')) {
    return
  }
  let startLift = current
  if (settling) {
    const overlayBox = overlay.getBoundingClientRect()
    const paneBox = pane.getBoundingClientRect()
    const visual = direction === 'up' ? paneBox.top - overlayBox.top : overlayBox.bottom - paneBox.bottom
    startLift = Math.max(0, visual)
    onChange(startLift)
  }
  onDragging(true)
  overlay.classList.add('dragging')
  event.preventDefault()
  event.stopPropagation()
  const startY = event.clientY
  const maxLift = paneLiftLimit(maxPane)
  const move = (ev: PointerEvent) => {
    const delta = direction === 'up' ? startY - ev.clientY : ev.clientY - startY
    onChange(Math.min(maxLift, Math.max(minLift, startLift + delta)))
  }
  const end = () => {
    onDragging(false)
    overlay.classList.remove('dragging')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    // 手柄很小，窗口监听已经能跟上指针。
  }
}

/**
 * 下半区卡片向上拖高：拖动时跟手，松手停在当前位置；收回时用一段短动画回到下半区。
 * @param open 卡片关掉时高度恢复。
 */
export function usePaneLift(open: boolean) {
  const [lift, setLift] = useState(0)
  const [settling, setSettling] = useState(false)
  const [dragging, setDragging] = useState(false)
  const liftRef = useRef(0)
  const timer = useRef<number | null>(null)

  function clearTimer() {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  useEffect(() => {
    if (open) {
      return
    }
    clearTimer()
    liftRef.current = 0
    // oxlint-disable-next-line react/set-state-in-effect
    setLift(0)
    setSettling(false)
    setDragging(false)
  }, [open])

  return {
    lift,
    settling,
    dragging,
    /** 收回到下半区。 */
    release() {
      if (liftRef.current <= 0) {
        return
      }
      liftRef.current = 0
      setLift(0)
      setSettling(true)
      clearTimer()
      timer.current = window.setTimeout(() => {
        timer.current = null
        setSettling(false)
      }, 240)
    },
    /** 收回动画结束（或被打断）。 */
    settle() {
      clearTimer()
      setSettling(false)
    },
    /** 从卡片顶部横条或标题栏开始拖。 */
    begin(event: ReactPointerEvent<HTMLElement>) {
      const target = event.target
      if (target instanceof Element && target.closest('button, a, input, textarea, select, label')) {
        return
      }
      const overlay = event.currentTarget.closest('.dispatcher-overlay')
      const pane = document.querySelector('[data-driver-pane]')
      const orderPane = document.querySelector('[data-order-pane]')
      if (!(overlay instanceof HTMLElement) || !(pane instanceof HTMLElement) || !(orderPane instanceof HTMLElement)) {
        return
      }
      clearTimer()
      setSettling(false)
      startPaneLift(event, {
        direction: 'up',
        overlay,
        pane,
        maxPane: orderPane,
        settling,
        current: liftRef.current,
        onChange: (value) => {
          liftRef.current = value
          setLift(value)
        },
        onDragging: setDragging,
      })
    },
  }
}
