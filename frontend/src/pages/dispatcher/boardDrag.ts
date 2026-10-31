// 调度台拖拽：拖起的是什么、松手落在哪里。
export const DRAG_THRESHOLD = 8

export type DragKind = 'order' | 'driver' | 'day' | 'vehicle'

export interface DragState {
  kind: DragKind
  id: string
  orderId?: string
  dayId?: string
  from?: 'order' | 'driver'
  onlyDay?: boolean
  x: number
  y: number
}

export interface TouchDragHold {
  pointerId: number
  x: number
  y: number
  target: HTMLElement
  drag: DragState
  timer: number
}

export function resolveDriverId(x: number, y: number, openDriverId: string | null) {
  const element = document.elementFromPoint(x, y)
  const icon = element?.closest('[data-driver-id]')
  if (icon) {
    return icon.getAttribute('data-driver-id')
  }
  if (openDriverId && element?.closest('[data-driver-pane]')) {
    return openDriverId
  }
  return null
}

export function isOverOrderPane(x: number, y: number) {
  return Boolean(document.elementFromPoint(x, y)?.closest('[data-order-pane]'))
}
