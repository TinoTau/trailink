import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { message } from 'antd'
import { CALENDAR_HOLD_MS, calendarHoldShifted } from '../../calendarDay'
import { formatLocalDate, todayLocal } from '../../localDate'
import { DRAG_THRESHOLD, isOverOrderPane, resolveDriverId, type DragState, type TouchDragHold } from './boardDrag'

/**
 * 调度台松手后要做的事，由页面提供。页面每次渲染后把最新的一份写进 ref，
 * 全局监听里通过 ref 读取，不需要重新挂监听。
 */
export interface BoardDragActions {
  /** 订单图标、订单日历当前是不是车辆管理（车辆区打开）。 */
  vehiclePane: boolean
  /** 当前打开的司导（或派给调度里的调度员）。 */
  openDriverId: string | null
  /** 这张订单有别人分配的日期，不能整单拖动（派给调度不限制）。 */
  isForeignOrder: (orderId: string) => boolean
  assignOrder: (orderId: string, driverId: string) => Promise<void>
  assignDay: (orderId: string, dayId: string, driverId: string) => Promise<void>
  unbindDay: (orderId: string, dayId: string, onlyDay?: boolean) => Promise<void>
  bindVehicle: (vehicleId: string, driverId: string, date: string) => Promise<void>
  unbindVehicle: (orderId: string, dayId: string, onlyDay?: boolean) => Promise<boolean>
  reorderDriver: (sourceId: string, targetId: string) => void
  reorderVehicle: (sourceId: string, targetId: string) => void
  /** 点订单日历的某一天：打开当日卡片。 */
  selectOrderDay: (dayId: string) => void
  /** 点司导日历里自己分配的某一天：打开这张订单。 */
  openOwnedDriverDay: (orderId: string, dayId?: string) => void
  /** 车辆管理时点司导日历的某一天：打开这一天的车辆。 */
  openVehicleForDriverDay: (orderId: string, dayId?: string) => void
  /** 打开司导卡片并把日历跳到某一天。 */
  queueDriverFocus: (driverId: string, date: string, driverOnly: boolean) => void
  /** 点订单图标：打开或收起订单。 */
  toggleOrder: (orderId: string) => void
  /** 点司导图标：打开或收起司导卡片。 */
  toggleDriver: (driverId: string) => void
  /** 点车辆图标：打开或收起车辆日历。 */
  toggleVehicle: (vehicleId: string) => void
  /** 从司导卡片点订单图标时，先把抬高的司导卡片放回原位。 */
  releaseDriverLift: () => void
}

const refuseForeignOrder = () => message.warning('只能移除自己分配的订单')

function dateUnderDriverCalendar(x: number, y: number) {
  const point = document.elementFromPoint(x, y)
  return point?.closest('[data-calendar="driver"]')
    ? point.closest('[data-service-date]')?.getAttribute('data-service-date') ?? null
    : null
}

function vehicleUnder(x: number, y: number) {
  return document.elementFromPoint(x, y)?.closest('[data-vehicle-id]')?.getAttribute('data-vehicle-id') ?? null
}

/**
 * 调度台的拖拽控制：订单、某一天、司导（调度员）、车辆的拖动和点击。
 * <ul>
 * <li>鼠标：按下移动超过几个像素开始拖；没拖动松开算点击。</li>
 * <li>触屏：按住约 0.5 秒后才能拖（未满 0.5 秒移动是滚动）。日历上有订单的日期直接拖动是整单，按住后再拖是这一天。</li>
 * <li>松手位置决定动作：司导图标 / 打开的司导卡片 = 分配或绑定车辆；订单区 = 取消；同类图标之间 = 排序。</li>
 * </ul>
 * 页面通过 beginPointer 开始一次按下，拖动中的状态（拖的是什么、悬停在哪）用于高亮和跟随手指的标签。
 */
export function useBoardDrag(busy: boolean, actionsRef: RefObject<BoardDragActions | null>) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverDriverId, setHoverDriverId] = useState<string | null>(null)
  const [hoverVehicleId, setHoverVehicleId] = useState<string | null>(null)
  const [hoverOrderPane, setHoverOrderPane] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const pendingRef = useRef<DragState | null>(null)
  const touchDragHoldRef = useRef<TouchDragHold | null>(null)
  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  useEffect(() => {
    function startDrag(next: DragState) {
      pendingRef.current = null
      dragRef.current = next
      setDrag(next)
    }

    function onMove(event: PointerEvent) {
      const act = actionsRef.current
      if (!act) {
        return
      }
      const hold = touchDragHoldRef.current
      if (hold && hold.pointerId === event.pointerId && calendarHoldShifted(hold, event.clientX, event.clientY)) {
        // 触屏在日历上没按满就拖动：有订单的日期按整单拖（车辆管理时带上这一天）。
        window.clearTimeout(hold.timer)
        touchDragHoldRef.current = null
        if (hold.drag.kind === 'day' && hold.drag.orderId) {
          if (!act.vehiclePane && act.isForeignOrder(hold.drag.orderId)) {
            refuseForeignOrder()
          } else {
            startDrag({
              kind: 'order',
              id: hold.drag.orderId,
              from: hold.drag.from,
              dayId: act.vehiclePane ? hold.drag.dayId : undefined,
              x: event.clientX,
              y: event.clientY,
            })
          }
        }
      }
      const pending = pendingRef.current
      if (!dragRef.current && pending) {
        const deltaX = event.clientX - pending.x
        const deltaY = event.clientY - pending.y
        if (deltaX * deltaX + deltaY * deltaY >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
          if (pending.kind === 'order' && act.isForeignOrder(pending.id)) {
            pendingRef.current = null
            refuseForeignOrder()
          } else {
            startDrag({ ...pending, x: event.clientX, y: event.clientY })
          }
        }
      }
      const current = dragRef.current
      if (!current) {
        return
      }
      setDrag({ ...current, x: event.clientX, y: event.clientY })
      setHoverDriverId(resolveDriverId(event.clientX, event.clientY, act.openDriverId))
      setHoverOrderPane(current.from === 'driver' && isOverOrderPane(event.clientX, event.clientY))
      setHoverVehicleId(current.kind === 'vehicle' ? vehicleUnder(event.clientX, event.clientY) : null)
    }

    function drop(current: DragState, x: number, y: number) {
      const act = actionsRef.current
      if (!act) {
        return
      }
      const driverId = resolveDriverId(x, y, act.openDriverId)
      const overOrderPane = isOverOrderPane(x, y)
      if (current.kind === 'vehicle') {
        const vehicleTarget = vehicleUnder(x, y)
        if (vehicleTarget && vehicleTarget !== current.id && !driverId) {
          act.reorderVehicle(current.id, vehicleTarget)
          return
        }
        if (!driverId) {
          return
        }
        if (act.openDriverId !== driverId) {
          act.queueDriverFocus(driverId, formatLocalDate(todayLocal()), true)
          return
        }
        const date = dateUnderDriverCalendar(x, y)
        if (date) {
          void act.bindVehicle(current.id, driverId, date)
        }
        return
      }
      if (current.from === 'driver') {
        if (overOrderPane) {
          const orderId = current.kind === 'order' ? current.id : current.orderId
          if (orderId) {
            if (act.vehiclePane) {
              void act.unbindVehicle(orderId, current.dayId ?? '', Boolean(current.onlyDay))
            } else {
              void act.unbindDay(orderId, current.dayId ?? '', current.onlyDay)
            }
          }
        }
        // 从司导卡片拖起的订单 / 日期只能拖回订单区取消（车辆管理时是解绑车辆），
        // 放回司导区或拖到别的司导都不派单：派单只从订单区拖下来，免得误触把拆单整单派给一位司导。
        return
      }
      if (current.kind === 'day' && current.from === 'order' && current.dayId && !driverId) {
        act.selectOrderDay(current.dayId)
        return
      }
      if (!driverId) {
        return
      }
      if (current.kind === 'order') {
        void act.assignOrder(current.id, driverId)
        return
      }
      if (current.kind === 'day' && current.orderId && current.dayId) {
        void act.assignDay(current.orderId, current.dayId, driverId)
        return
      }
      if (current.kind === 'driver' && driverId !== current.id) {
        act.reorderDriver(current.id, driverId)
      }
    }

    function click(pending: DragState) {
      const act = actionsRef.current
      if (!act) {
        return
      }
      if (pending.kind === 'day' && pending.from === 'order' && pending.dayId) {
        act.selectOrderDay(pending.dayId)
        return
      }
      if (pending.kind === 'day' && pending.from === 'driver' && pending.orderId) {
        if (act.vehiclePane) {
          act.openVehicleForDriverDay(pending.orderId, pending.dayId)
        } else {
          act.openOwnedDriverDay(pending.orderId, pending.dayId)
        }
        return
      }
      if (pending.kind === 'order') {
        if (pending.from === 'driver') {
          act.releaseDriverLift()
        }
        act.toggleOrder(pending.id)
        return
      }
      if (pending.kind === 'driver') {
        act.toggleDriver(pending.id)
      }
      if (pending.kind === 'vehicle') {
        act.toggleVehicle(pending.id)
      }
    }

    function onUp(event: PointerEvent) {
      const hold = touchDragHoldRef.current
      if (hold && hold.pointerId === event.pointerId) {
        const shifted = calendarHoldShifted(hold, event.clientX, event.clientY)
        window.clearTimeout(hold.timer)
        touchDragHoldRef.current = null
        if (!shifted) {
          pendingRef.current = hold.drag
        }
      }
      const current = dragRef.current
      const pending = pendingRef.current
      pendingRef.current = null
      if (current) {
        setDrag(null)
        setHoverDriverId(null)
        setHoverVehicleId(null)
        setHoverOrderPane(false)
        dragRef.current = null
        drop(current, event.clientX, event.clientY)
        return
      }
      if (pending) {
        click(pending)
      }
    }

    function onTouchMove(event: TouchEvent) {
      if ((dragRef.current || pendingRef.current) && event.cancelable) {
        event.preventDefault()
      }
    }

    function onCancel(event: PointerEvent | TouchEvent) {
      const hold = touchDragHoldRef.current
      if (!hold) {
        return
      }
      if ('pointerId' in event && event.pointerId !== hold.pointerId) {
        return
      }
      window.clearTimeout(hold.timer)
      touchDragHoldRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchcancel', onCancel)
    return () => {
      const hold = touchDragHoldRef.current
      if (hold) {
        window.clearTimeout(hold.timer)
        touchDragHoldRef.current = null
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [actionsRef])

  /** 在订单、某一天、司导、车辆上按下。忙的时候不响应。 */
  function beginPointer(event: ReactPointerEvent, next: DragState) {
    if (busy) {
      return
    }
    if (event.pointerType === 'touch') {
      const existing = touchDragHoldRef.current
      if (existing) {
        window.clearTimeout(existing.timer)
        touchDragHoldRef.current = null
      }
      const target = event.currentTarget
      if (!(target instanceof HTMLElement)) {
        return
      }
      const hold: TouchDragHold = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        target,
        drag: next,
        timer: window.setTimeout(() => {
          if (touchDragHoldRef.current !== hold) {
            return
          }
          touchDragHoldRef.current = null
          pendingRef.current = hold.drag.kind === 'day' ? { ...hold.drag, onlyDay: true } : hold.drag
          try {
            hold.target.setPointerCapture(hold.pointerId)
          } catch {
            // 手指已经离开时不再抓住触点。
          }
        }, CALENDAR_HOLD_MS),
      }
      touchDragHoldRef.current = hold
      if (next.kind === 'day') {
        event.preventDefault()
        try {
          target.setPointerCapture(event.pointerId)
        } catch {
          // 手指已经离开时不再抓住触点。
        }
      }
      return
    }
    if (next.kind !== 'day') {
      event.preventDefault()
    }
    pendingRef.current = next
  }

  return { drag, dragRef, hoverDriverId, hoverVehicleId, hoverOrderPane, beginPointer }
}
