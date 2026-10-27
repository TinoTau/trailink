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

const ACTIVITY_JOIN = '-'

export function formatActivityLine(parts: string[]) {
  return parts.join(ACTIVITY_JOIN)
}

export function parseActivityLine(raw: string) {
  return raw.split(ACTIVITY_JOIN).map((item) => item.trim()).filter(Boolean)
}

export function dayActivityLine(activities: { content?: string | null; sortOrder?: number }[]) {
  return formatActivityLine(
    [...activities]
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
      .map((item) => (item.content ?? '').trim())
      .filter(Boolean),
  )
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

export function assignedDriverIds(order: Order) {
  return new Set(order.days.filter((day) => day.driverId).map((day) => day.driverId))
}

export function firstAssignedDay(order: Order) {
  return order.days
    .filter((day) => day.driverId)
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.id.localeCompare(right.id))[0]
}

export function assignedDriverFocus(order: Order, today: string) {
  const first = firstAssignedDay(order)
  if (!first?.driverId) {
    return null
  }
  const date =
    order.days
      .filter((day) => day.driverId === first.driverId && day.serviceDate >= today)
      .map((day) => day.serviceDate)
      .sort()[0] ?? null
  return { driverId: first.driverId, date }
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
  const assigned = order.assignedDayCount
  return assigned > 0 && assigned < order.dayCount
}

export function isSplitOrder(order: Order) {
  return assignedDriverIds(order).size > 1 || assignedAssignerIds(order).size > 1 || isPartiallyAssigned(order)
}

export const CONFLICT_RED = '#ff4d4f'
export const CONFLICT_PATTERNS = [
  'spade',
  'heart',
  'diamond',
  'club',
  'pin',
  'pins',
  'bamboo',
  'bamboos',
  'character',
  'east',
  'south',
  'west',
  'north',
  'red',
  'green',
  'white',
] as const
export type ConflictPattern = (typeof CONFLICT_PATTERNS)[number]

const SUIT_COUNT = 4
const OUTLINE = 'fill="none" stroke="#595959" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'
const PATTERN_SIZE = 96

const CONFLICT_PATTERN_IMAGE: Record<ConflictPattern, string> = {
  spade: outline(
    '<path d="M32 7C18 19 7 29 7 41 7 50 15 56 23 52 28 49 30 44 32 40 34 44 36 49 41 52 49 56 57 50 57 41 57 29 46 19 32 7Z"/><path d="M29 52h6l1 8H28Z"/>',
  ),
  heart: outline(
    '<path d="M32 57C18 45 7 35 7 23 7 14 15 8 23 12c5 3 7 8 9 12 2-4 4-9 9-12 8-4 16 2 16 11 0 12-11 22-25 34z"/>',
  ),
  diamond: outline('<path d="M32 6 58 32 32 58 6 32Z"/>'),
  club: patternUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><mask id="club-hole"><rect width="64" height="64" fill="#fff"/><circle cx="32" cy="31" r="7" fill="#000"/></mask><g fill="none" stroke="#595959" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" mask="url(#club-hole)"><circle cx="32" cy="17" r="11"/><circle cx="20" cy="35" r="11"/><circle cx="44" cy="35" r="11"/><path d="M32 48v9"/></g></svg>`,
  ),
  pin: tile('<circle cx="32" cy="32" r="14"/>'),
  pins: tile('<circle cx="18" cy="18" r="4"/><circle cx="46" cy="18" r="4"/><circle cx="18" cy="46" r="4"/><circle cx="46" cy="46" r="4"/>'),
  bamboo: tile('<path d="M18 16v32M46 16v32M18 32h8M38 32h8"/>'),
  bamboos: tile('<path d="M16 16v10M32 14v10M48 16v10M16 40v10M32 42v10M48 40v10"/>'),
  character: tile(mark('萬')),
  east: tile(mark('東')),
  south: tile(mark('南')),
  west: tile(mark('西')),
  north: tile(mark('北')),
  red: tile(mark('中')),
  green: tile(mark('發')),
  white: tile('<rect x="18" y="18" width="28" height="28" rx="8"/>'),
}

function tile(inner: string) {
  return outline(`<rect x="8" y="8" width="48" height="48" rx="14"/>${inner}`)
}

function mark(glyph: string) {
  return `<text x="32" y="38" text-anchor="middle" font-size="18" font-weight="700" font-family="PingFang SC, Microsoft YaHei, Segoe UI, sans-serif" fill="none" stroke="#595959" stroke-width="1.2">${glyph}</text>`
}

function outline(body: string) {
  const painted = body.replace(/<(path|rect|circle)\b(?![^>]*\bstroke=)/g, `<$1 ${OUTLINE}`)
  return patternUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${painted}</svg>`)
}

function patternUrl(svg: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export function patternForOrder(orderIds: string[], orderId: string): ConflictPattern {
  const rank = [...new Set(orderIds)].sort().indexOf(orderId)
  const index = rank < 0 ? 0 : rank
  if (index < SUIT_COUNT) {
    return CONFLICT_PATTERNS[index]
  }
  const mahjong = CONFLICT_PATTERNS.slice(SUIT_COUNT)
  return mahjong[(index - SUIT_COUNT) % mahjong.length]
}

export function conflictPatternStyle(pattern: ConflictPattern, size = PATTERN_SIZE) {
  return {
    backgroundColor: '#fff',
    backgroundImage: CONFLICT_PATTERN_IMAGE[pattern],
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundSize: `${size}px ${size}px`,
    color: '#1f1f1f',
  }
}

export function conflictingOrderIds(orders: Order[], driverId?: string | null) {
  if (driverId === null) {
    return new Set<string>()
  }
  const groups = new Map<string, Set<string>>()
  for (const order of orders) {
    for (const day of order.days) {
      if (!day.driverId || (driverId && day.driverId !== driverId)) {
        continue
      }
      const key = `${day.driverId}|${day.serviceDate}`
      const ids = groups.get(key) ?? new Set<string>()
      ids.add(order.id)
      groups.set(key, ids)
    }
  }
  const conflicted = new Set<string>()
  for (const ids of groups.values()) {
    if (ids.size > 1) {
      for (const id of ids) {
        conflicted.add(id)
      }
    }
  }
  return conflicted
}

export function dayOnDriverDate(order: Order, driverId: string, date: string) {
  return order.days.find((day) => day.driverId === driverId && day.serviceDate === date)
}

export function ordersOnDriverDate(orders: Order[], driverId: string, date: string) {
  return orders.filter((order) => dayOnDriverDate(order, driverId, date))
}

export function hasUnassignedDays(order: Order) {
  return order.assignedDayCount < order.dayCount
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
