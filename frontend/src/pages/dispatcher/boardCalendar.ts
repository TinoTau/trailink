// 调度台几张日历之间的滚动对齐，以及司导日历同一天只留一个格子。
import type { CalendarMark } from './DispatcherCalendarCard'

export function monthValue(key: string) {
  const [year, month] = key.split('-').map(Number)
  return year * 12 + month
}

export function nearestMonthSection(sections: HTMLElement[], key: string) {
  const target = monthValue(key)
  return [...sections].sort(
    (left, right) =>
      Math.abs(monthValue(left.dataset.month || '') - target) -
      Math.abs(monthValue(right.dataset.month || '') - target),
  )[0]
}

export function alignCalendarScroll(source: HTMLElement | null, target: HTMLElement | null) {
  if (!source || !target) {
    return
  }
  const sourceMonths = [...source.querySelectorAll<HTMLElement>('section[data-month]')]
  const targetMonths = [...target.querySelectorAll<HTMLElement>('section[data-month]')]
  if (sourceMonths.length === 0 || targetMonths.length === 0) {
    return
  }

  let current = sourceMonths[0]
  for (const section of sourceMonths) {
    if (section.offsetTop <= source.scrollTop + 16) {
      current = section
    }
  }

  const key = current.dataset.month || ''
  const match = targetMonths.find((section) => section.dataset.month === key) ?? nearestMonthSection(targetMonths, key)
  if (!match) {
    return
  }

  const next = match.offsetTop - (current.offsetTop - source.scrollTop)
  const max = Math.max(0, target.scrollHeight - target.clientHeight)
  target.scrollTop = Math.min(Math.max(0, next), max)
}

export function scrollCalendarToDate(body: HTMLElement | null, date: string, placement: 'start' | 'center' = 'start') {
  if (!body) {
    return
  }
  const cell = body.querySelector<HTMLElement>(`[data-service-date="${date}"]`)
  if (!cell) {
    return
  }
  const delta = cell.getBoundingClientRect().top - body.getBoundingClientRect().top
  const next = placement === 'center'
    ? body.scrollTop + delta - (body.clientHeight - cell.offsetHeight) / 2
    : body.scrollTop + delta - 8
  const max = Math.max(0, body.scrollHeight - body.clientHeight)
  body.scrollTop = Math.min(Math.max(0, next), max)
}

export function collapseDriverMarks(marks: CalendarMark[]) {
  const byDate = new Map<string, CalendarMark>()
  for (const mark of marks) {
    const current = byDate.get(mark.date)
    if (!current || (mark.owned && current.owned === false)) {
      byDate.set(mark.date, mark)
    }
  }
  return [...byDate.values()]
}
