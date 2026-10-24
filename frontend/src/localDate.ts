export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayLocal() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

export function orderedRange(start: string, end?: string | null) {
  const finish = end || start
  return start <= finish ? [start, finish] as const : [finish, start] as const
}

export function eachLocalDate(start: string, end: string) {
  const dates: string[] = []
  const [year, month, day] = start.split('-').map(Number)
  const cursor = new Date(year, month - 1, day)
  while (formatLocalDate(cursor) <= end) {
    dates.push(formatLocalDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function formatLocalTime(value?: string | null) {
  if (!value) {
    return null
  }

  const time = value.includes('T') ? value.split('T')[1] : value.split(' ')[1]
  return time ? time.slice(0, 5) : null
}

export function parseYmd(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value
}

export function formatMonthDay(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}月${Number(day)}日`
}

export function monthCells(month: Date) {
  const start = monthStart(month)
  const end = monthEnd(month)
  const leading = (start.getDay() + 6) % 7
  const cells: Array<{ date: Date; inMonth: boolean }> = []

  for (let index = 0; index < leading; index += 1) {
    cells.push({ date: new Date(start.getFullYear(), start.getMonth(), index - leading + 1), inMonth: false })
  }

  for (let day = 1; day <= end.getDate(); day += 1) {
    cells.push({ date: new Date(start.getFullYear(), start.getMonth(), day), inMonth: true })
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false })
  }

  return cells
}

export function monthsBetween(start: string, end: string) {
  const first = monthStart(parseYmd(start))
  const last = monthStart(parseYmd(end))
  const months: Date[] = []
  const cursor = new Date(first)
  while (cursor <= last) {
    months.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months.length > 0 ? months : [first]
}
