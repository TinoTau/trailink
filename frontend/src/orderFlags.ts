import type { Order } from './types'

const TILE_LABEL_MAX = 12

function clipTileLabel(raw: string) {
  return raw.length > TILE_LABEL_MAX ? raw.slice(0, TILE_LABEL_MAX) : raw
}

export function orderDisplayLabel(order: {
  platformOrderNo?: string | null
  notes?: string | null
  driverNotes?: string | null
}, side: 'dispatcher' | 'driver' = 'dispatcher') {
  const raw = (order.platformOrderNo ?? '').trim() || ((side === 'driver' ? order.driverNotes : order.notes) ?? '').trim()
  return clipTileLabel(raw)
}

export function dayActivityLine(activities: { content?: string | null; sortOrder?: number }[]) {
  return [...activities]
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((item) => (item.content ?? '').trim())
    .filter(Boolean)
    .join('-')
}

export function driverDisplayLabel(driver: { name?: string | null; notes?: string | null }) {
  return clipTileLabel((driver.notes ?? '').trim() || (driver.name ?? '').trim())
}

function dayAssigner(
  order: { createdByUserId?: string | null; createdByName?: string | null },
  day?: { assignedByUserId?: string | null; assignedByName?: string | null },
) {
  const id = day?.assignedByUserId || order.createdByUserId || undefined
  const name = (day?.assignedByName || order.createdByName)?.trim() || undefined
  return { id, name }
}

export function isOwnAssignment(
  order: { createdByUserId?: string | null },
  day: { assignedByUserId?: string | null } | undefined,
  userId: string | undefined,
) {
  const assignerId = dayAssigner(order, day).id
  return Boolean(assignerId && userId && assignerId === userId)
}

export function orderAssignerName(
  order: { createdByName?: string | null },
  day?: { assignedByName?: string | null },
) {
  return dayAssigner(order, day).name
}

const DRIVER_ASSIGNER_MAX = 6

export function driverAssignerCaption(
  order: { companyName?: string | null; companyNote?: string | null; createdByName?: string | null },
  day?: { assignedByName?: string | null },
) {
  const name = orderAssignerName(order, day)
  if (!name) {
    return undefined
  }
  const company = order.companyName?.trim()
  if (!company) {
    return name
  }
  const full = `${company}${name}`
  if ([...full].length <= DRIVER_ASSIGNER_MAX) {
    return full
  }
  const abbreviation = order.companyNote?.trim()
  return abbreviation ? `${abbreviation}-${name}` : full
}

export function assignedDayCount(order: Order) {
  return order.assignedDayCount
}

export function assignedDriverIds(order: Order) {
  return new Set(order.days.filter((day) => day.driverId).map((day) => day.driverId))
}

export function assignedAssignerIds(order: Order) {
  return new Set(
    order.days
      .filter((day) => day.driverId)
      .map((day) => day.assignedByUserId || order.createdByUserId)
      .filter((id): id is string => Boolean(id)),
  )
}

export function isPartiallyAssigned(order: Order) {
  const assigned = assignedDayCount(order)
  return assigned > 0 && assigned < order.dayCount
}

export function isSplitOrder(order: Order) {
  return assignedDriverIds(order).size > 1 || assignedAssignerIds(order).size > 1 || isPartiallyAssigned(order)
}

export function hasUnassignedDays(order: Order) {
  return assignedDayCount(order) < order.dayCount
}

export function hasDispatcherAssignment(order: Order) {
  return Boolean(order.assignedDispatcherUserId)
}

export function orderEndDate(order: { startDate: string; endDate?: string | null }) {
  return order.endDate || order.startDate
}

export function isIncomplete(order: Order, today: string) {
  return orderEndDate(order) >= today
}

export function isInProgress(order: Order, today: string) {
  const end = orderEndDate(order)
  return order.startDate <= today && end >= today
}

export function isHistoricalOrder(order: Order, today: string) {
  if (order.dayCount <= 0) {
    return false
  }
  return orderEndDate(order) < today && !hasUnassignedDays(order)
}

export function splitOrderHint(orders: Order[]) {
  if (orders.some((order) => assignedDriverIds(order).size > 1)) {
    return '此单部分日期由其他司导负责'
  }
  if (orders.some(isPartiallyAssigned)) {
    return '此单尚未派完所有日期'
  }
  return null
}
