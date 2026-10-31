import type { PointerEvent as ReactPointerEvent } from 'react'

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
