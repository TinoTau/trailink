import { PREF_KEYS, readJsonPref, writeJsonPref } from './localPrefs'

export const PRESET_COLORS = ['#C6F0E0', '#D6E4FF', '#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#8c8c8c', '#262626']

export interface DriverCalendarColors {
  past: string
  upcoming: string
}

export const DEFAULT_DRIVER_CALENDAR_COLORS: DriverCalendarColors = {
  past: '#C6F0E0',
  upcoming: '#D6E4FF',
}

export function readDriverCalendarColors(): DriverCalendarColors {
  return readJsonPref(PREF_KEYS.driverCalendarColors, DEFAULT_DRIVER_CALENDAR_COLORS, (parsed) => ({
    past: parsed.past || DEFAULT_DRIVER_CALENDAR_COLORS.past,
    upcoming: parsed.upcoming || DEFAULT_DRIVER_CALENDAR_COLORS.upcoming,
  }))
}

export function writeDriverCalendarColors(colors: DriverCalendarColors) {
  writeJsonPref(PREF_KEYS.driverCalendarColors, colors)
}

export function driverCalendarFill(date: string, today: string, colors: DriverCalendarColors) {
  return date < today ? colors.past : colors.upcoming
}

export function contrastText(background: string) {
  const hex = background.replace('#', '')
  const value = hex.length === 3 ? hex.split('').map((item) => item + item).join('') : hex
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255 < 0.55 ? '#fff' : '#1f1f1f'
}
