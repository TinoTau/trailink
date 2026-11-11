/**
 * 从别的页面跳到调度台并打开指定的卡片（例如公司信息「订单记录」里点司导、车牌）。
 * 放在路由的 state 里：刷新页面或返回时不会重复跳。
 */
export type DispatcherJump =
  /** 打开订单和这位司导的详情，司导日历跳到他在这张单上的第一天。 */
  | { kind: 'driver'; orderId: string; driverId: string }
  /** 切到车辆，打开这辆车和它在这张单上第一天的司导。 */
  | { kind: 'vehicle'; orderId: string; vehicleId: string }
  /** 派了司导、还没配车：切到车辆，打开这位司导（司导日历到他在这张单上第一个没配车的日子）。 */
  | { kind: 'missingVehicle'; orderId: string; driverId: string }
  /** 还没派司导、没配车：只打开这张单。 */
  | { kind: 'order'; orderId: string }

export function dispatcherJumpState(jump: DispatcherJump) {
  return { dispatcherJump: jump }
}

export function readDispatcherJump(state: unknown): DispatcherJump | null {
  if (!state || typeof state !== 'object' || !('dispatcherJump' in state)) {
    return null
  }
  const jump = (state as { dispatcherJump?: Partial<DispatcherJump> }).dispatcherJump
  if (!jump || typeof jump.orderId !== 'string') {
    return null
  }
  if (jump.kind === 'driver' && typeof jump.driverId === 'string') {
    return { kind: 'driver', orderId: jump.orderId, driverId: jump.driverId }
  }
  if (jump.kind === 'missingVehicle' && typeof jump.driverId === 'string') {
    return { kind: 'missingVehicle', orderId: jump.orderId, driverId: jump.driverId }
  }
  if (jump.kind === 'order') {
    return { kind: 'order', orderId: jump.orderId }
  }
  if (jump.kind === 'vehicle' && typeof jump.vehicleId === 'string') {
    return { kind: 'vehicle', orderId: jump.orderId, vehicleId: jump.vehicleId }
  }
  return null
}

/** 跳过去之前订单记录停在哪：从调度台点返回回来时，选中同一行、滚回同一个位置。只在本标签页里记。 */
export interface RecordsReturn {
  companyId: string
  scope: string
  orderId: string
  scrollTop: number
}

const RETURN_KEY = 'trailink.records.return'

export function rememberRecordsReturn(value: RecordsReturn) {
  try {
    window.sessionStorage.setItem(RETURN_KEY, JSON.stringify(value))
  } catch {
    // 存不了就回到默认位置，不影响跳转。
  }
}

const BACK_KEY = 'trailink.records.back'

/** 调度台点了返回按钮：回到订单记录时才恢复位置（自己再打开公司信息时不恢复）。 */
export function markRecordsBack() {
  try {
    window.sessionStorage.setItem(BACK_KEY, '1')
  } catch {
    // 存不了就回到默认位置。
  }
}

/** 点返回回来时读出并清掉；不是点返回回来的、不是这家公司或这个范围的不用。 */
export function takeRecordsReturn(companyId: string, scope: string): RecordsReturn | null {
  try {
    if (window.sessionStorage.getItem(BACK_KEY) !== '1') {
      return null
    }
    window.sessionStorage.removeItem(BACK_KEY)
    const text = window.sessionStorage.getItem(RETURN_KEY)
    if (!text) {
      return null
    }
    const value = JSON.parse(text) as Partial<RecordsReturn>
    if (value.companyId !== companyId || value.scope !== scope || typeof value.orderId !== 'string') {
      return null
    }
    window.sessionStorage.removeItem(RETURN_KEY)
    return { companyId, scope, orderId: value.orderId, scrollTop: Number(value.scrollTop) || 0 }
  } catch {
    return null
  }
}
