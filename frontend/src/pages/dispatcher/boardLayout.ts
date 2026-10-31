// 调度台图标的排列：置顶、手动排序、按姓名或车牌排序，以及只存在本机的布局。
import { readJsonPref, writeJsonPref, type PrefKey } from '../../localPrefs'
import type { Order } from '../../types'

export const DEFAULT_ASSIGNED_COLOR = '#C6F0E0'

export interface DriverLayout {
  pinnedIds: string[]
  sortIds: string[]
}

export interface BoardPerson {
  id: string
  name: string
  notes: string | null
  contact: string | null
  hidden: boolean
  hasAvatar: boolean
}

export function readLayout(key: PrefKey): DriverLayout {
  return readJsonPref<DriverLayout>(key, { pinnedIds: [], sortIds: [] }, (parsed) => ({
    pinnedIds: parsed.pinnedIds ?? [],
    sortIds: parsed.sortIds ?? [],
  }))
}

export function sortBoardOrders(orders: Order[]) {
  return [...orders].sort((left, right) => {
    const leftLive = left.isInProgress
    const rightLive = right.isInProgress
    if (leftLive !== rightLive) {
      return leftLive ? -1 : 1
    }
    if (leftLive) {
      return right.startDate.localeCompare(left.startDate) || left.orderNo.localeCompare(right.orderNo)
    }
    return left.startDate.localeCompare(right.startDate) || left.orderNo.localeCompare(right.orderNo)
  })
}

export function comparePlate(left: string, right: string) {
  return left.localeCompare(right, 'en', { sensitivity: 'base' }) || left.localeCompare(right)
}

export function sortDrivers(
  drivers: BoardPerson[],
  layout: DriverLayout,
  options?: { manualUnpinned?: boolean; compareName?: (left: string, right: string) => number },
) {
  const manualUnpinned = options?.manualUnpinned !== false
  const compareName = options?.compareName ?? ((left: string, right: string) => left.localeCompare(right, 'zh-CN'))
  const visible = drivers.filter((driver) => !driver.hidden)
  const pinned = layout.pinnedIds
    .map((id) => visible.find((driver) => driver.id === id))
    .filter((driver): driver is BoardPerson => Boolean(driver))
  const pinnedIds = new Set(layout.pinnedIds)
  const rest = visible.filter((driver) => !pinnedIds.has(driver.id))
  const sortIndex = manualUnpinned ? new Map(layout.sortIds.map((id, index) => [id, index])) : new Map<string, number>()
  rest.sort((left, right) => {
    const leftRank = sortIndex.has(left.id)
    const rightRank = sortIndex.has(right.id)
    if (leftRank && rightRank) {
      return sortIndex.get(left.id)! - sortIndex.get(right.id)!
    }
    if (leftRank !== rightRank) {
      return leftRank ? -1 : 1
    }
    return compareName(left.name, right.name)
  })
  return [...pinned, ...rest]
}

export function toggledPins(pinnedIds: string[], id: string) {
  return pinnedIds.includes(id) ? pinnedIds.filter((item) => item !== id) : [...pinnedIds, id]
}

export function movedLayout(layout: DriverLayout, unpinnedIds: string[], sourceId: string, targetId: string) {
  const pinned = new Set(layout.pinnedIds)
  if (pinned.has(sourceId) !== pinned.has(targetId)) {
    return null
  }
  if (pinned.has(sourceId)) {
    return { ...layout, pinnedIds: moveIds(layout.pinnedIds, sourceId, targetId) }
  }
  return { ...layout, sortIds: moveIds(unpinnedIds, sourceId, targetId) }
}

export function writeBoardLayout(key: PrefKey, next: DriverLayout, apply: (value: DriverLayout) => void) {
  apply(next)
  writeJsonPref(key, next)
}

export function moveIds(ids: string[], sourceId: string, targetId: string) {
  const working = ids.includes(sourceId) ? [...ids] : [sourceId, ...ids]
  const from = working.indexOf(sourceId)
  if (from < 0 || sourceId === targetId) {
    return working
  }
  working.splice(from, 1)
  const insertAt = working.indexOf(targetId)
  working.splice(insertAt < 0 ? working.length : insertAt, 0, sourceId)
  return working
}

export function mergeOrders(primary: Order[], extra: Order[]) {
  const map = new Map(primary.map((order) => [order.id, order]))
  for (const order of extra) {
    map.set(order.id, order)
  }
  return [...map.values()]
}
