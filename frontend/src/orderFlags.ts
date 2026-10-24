import type { Order } from './types'

export function assignedDayCount(order: Order) {
  if (typeof order.assignedDayCount === 'number') {
    return order.assignedDayCount
  }
  if (order.days?.length) {
    return order.days.filter((day) => day.driverId).length
  }
  return order.assignedDriverId ? 1 : 0
}

export function assignedDriverIds(order: Order) {
  return new Set(order.days.filter((day) => day.driverId).map((day) => day.driverId))
}

export function isSplitOrder(order: Order) {
  const assigned = assignedDayCount(order)
  return assignedDriverIds(order).size > 1 || (assigned > 0 && assigned < order.dayCount)
}

export function hasUnassignedDays(order: Order) {
  return assignedDayCount(order) < order.dayCount
}

export function splitOrderHint(orders: Order[]) {
  if (orders.some((order) => assignedDriverIds(order).size > 1)) {
    return '此单部分日期由其他司导负责'
  }
  if (orders.some(isSplitOrder)) {
    return '此单尚未派完所有日期'
  }
  return null
}
