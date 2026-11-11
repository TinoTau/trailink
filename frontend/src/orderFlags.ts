import type { DriverCalendarTrip, ItineraryDay, Order } from './types'

const TILE_LABEL_MAX = 12

function clipTileLabel(raw: string) {
  return raw.length > TILE_LABEL_MAX ? raw.slice(0, TILE_LABEL_MAX) : raw
}

/** 订单显示名由后端给出（`label`），这里只按图标宽度截断。 */
export function orderDisplayLabel(order: { label?: string | null }) {
  return clipTileLabel((order.label ?? '').trim())
}

/**
 * 调度台和派给调度的订单图标上写的字（两个界面同一个规则）：
 * 有订单号写订单号；没有时依次写人数、车型、共用备注第一行（「2人 五座车 基督城-特卡波…」），图标里最多两行。
 * 这些都没有（例如看不到详情的单）时用后端给的显示名。
 */
export function orderTileLabel(order: {
  label?: string | null
  platformOrderNo?: string | null
  guestCount?: number | null
  vehicleType?: string | null
  sharedNotes?: string | null
}) {
  const orderNo = order.platformOrderNo?.trim()
  if (orderNo) {
    return orderNo
  }
  const route = (order.sharedNotes ?? '').trim().split(/\r?\n/)[0]?.trim() ?? ''
  const parts = [
    order.guestCount && order.guestCount > 0 ? `${order.guestCount}人` : '',
    order.vehicleType?.trim() ?? '',
    route,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : (order.label ?? '').trim()
}

/** 日历格子里的一条行程：我的行程和调度台当日编辑共用。 */
export function calendarTrip(order: Order, day: ItineraryDay): DriverCalendarTrip {
  return {
    orderId: order.id,
    label: orderDisplayLabel(order),
    itineraryDayId: day.id,
    endLocation: day.endLocation,
    weather: day.weather,
  }
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

/** 派出人由后端按「派出人，否则建单人」回退后给出，前端只比较。 */
export function isOwnAssignment(day: { assignedByUserId?: string | null } | undefined, userId: string | undefined) {
  return Boolean(day?.assignedByUserId && userId && day.assignedByUserId === userId)
}

export function orderAssignerName(
  order: { createdByName?: string | null },
  day?: { assignedByName?: string | null },
) {
  return (day ? day.assignedByName : order.createdByName)?.trim() || undefined
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

/** 有司导冲突的订单（后端判定），用来排定冲突图案的顺序。 */
export function conflictingOrderIds(orders: Order[]) {
  return new Set(orders.filter((order) => order.hasDriverConflict).map((order) => order.id))
}

/** 这辆车有冲突日期的订单（后端判定）。 */
export function conflictingVehicleOrderIds(orders: Order[], vehicleId: string) {
  return new Set(
    orders
      .filter((order) => order.days.some((day) => day.vehicleId === vehicleId && day.hasVehicleConflict))
      .map((order) => order.id),
  )
}

export function dateSpan(dates: string[]) {
  if (dates.length === 0) {
    return null
  }
  const sorted = [...dates].sort()
  return { start: sorted[0], end: sorted[sorted.length - 1] }
}

export function orderSpan(order: { days: { serviceDate: string }[] }) {
  return dateSpan(order.days.map((day) => day.serviceDate))
}

export function dateOrderEdges(
  orders: { id: string; days: { serviceDate: string }[] }[],
  date: string,
  orderIds: Iterable<string>,
) {
  const present = new Set(orderIds)
  let start = false
  let end = false
  for (const order of orders) {
    if (!present.has(order.id)) {
      continue
    }
    const span = orderSpan(order)
    if (!span) {
      continue
    }
    if (span.start === date) {
      start = true
    }
    if (span.end === date) {
      end = true
    }
  }
  return { start, end }
}

function dayOnDate(order: Order, date: string, same: (day: Order['days'][number]) => boolean) {
  return order.days.find((day) => day.serviceDate === date && same(day))
}

function ordersOnDate(orders: Order[], date: string, same: (day: Order['days'][number]) => boolean) {
  return orders.filter((order) => dayOnDate(order, date, same))
}

export function dayOnDriverDate(order: Order, driverId: string, date: string) {
  return dayOnDate(order, date, (day) => day.driverId === driverId)
}

export function ordersOnDriverDate(orders: Order[], driverId: string, date: string) {
  return ordersOnDate(orders, date, (day) => day.driverId === driverId)
}

export function dayOnVehicleDate(order: Order, vehicleId: string, date: string) {
  return dayOnDate(order, date, (day) => day.vehicleId === vehicleId)
}

export function ordersOnVehicleDate(orders: Order[], vehicleId: string, date: string) {
  return ordersOnDate(orders, date, (day) => day.vehicleId === vehicleId)
}

export function hasUnassignedDays(order: Order) {
  return order.assignedDayCount < order.dayCount
}

export function hasDispatcherAssignment(order: Order) {
  return Boolean(order.assignedDispatcherUserId)
}

export function splitOrderHint(orders: Order[]) {
  if (orders.some((order) => assignedDriverIds(order).size > 1)) {
    return '此单部分日期由其他司导负责'
  }
  if (orders.some((order) => order.assignedDayCount > 0 && hasUnassignedDays(order))) {
    return '此单尚未派完所有日期'
  }
  return null
}

/** 南/北岛的选项，顺序就是界面上的顺序。 */
export const ORDER_ISLANDS = [
  { value: 'south', label: '南岛' },
  { value: 'north', label: '北岛' },
  { value: 'both', label: '南北岛' },
] as const

/** 没填按南岛显示（业务主要在南岛）。 */
export function islandLabel(island: string | null | undefined) {
  return ORDER_ISLANDS.find((item) => item.value === island)?.label ?? '南岛'
}
