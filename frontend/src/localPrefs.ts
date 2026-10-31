// 只存在本机浏览器里的个人偏好。所有键名都在这里，读写失败（隐私模式、禁用存储）时退回默认值，不影响页面。

export const PREF_KEYS = {
  calendarInkBalance: 'trailink.calendar.inkBalance',
  calendarInkSide: 'trailink.calendar.inkSide',
  driverCalendarColors: 'trailink.driverCalendar.colors.v2',
  currentCompanyId: 'trailink.currentCompanyId',
  driverLayout: 'trailink.dispatcher.driverLayout',
  vehicleLayout: 'trailink.dispatcher.vehicleLayout',
  dispatcherLayout: 'trailink.company.dispatcherLayout',
} as const

export type PrefKey = (typeof PREF_KEYS)[keyof typeof PREF_KEYS]

export function readPref(key: PrefKey): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: PrefKey, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 浏览器拒绝写入时，这次改动只在当前页面生效。
  }
}

export function readJsonPref<T>(key: PrefKey, fallback: T, normalize: (raw: Partial<T>) => T): T {
  const raw = readPref(key)
  if (!raw) {
    return fallback
  }
  try {
    return normalize(JSON.parse(raw) as Partial<T>)
  } catch {
    return fallback
  }
}

export function writeJsonPref(key: PrefKey, value: unknown) {
  writePref(key, JSON.stringify(value))
}
