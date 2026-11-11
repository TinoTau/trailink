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

function clampScroll(body: HTMLElement, next: number) {
  const max = Math.max(0, body.scrollHeight - body.clientHeight)
  body.scrollTop = Math.min(Math.max(0, next), max)
}

/** 把 target 里这一天的格子挪到和 source 里这一天一样的高度。两边都有这一天才对齐，返回是否对齐了。 */
export function alignCalendarToDate(source: HTMLElement | null, target: HTMLElement | null, date: string) {
  const from = source?.querySelector<HTMLElement>(`[data-service-date="${date}"]`)
  const to = target?.querySelector<HTMLElement>(`[data-service-date="${date}"]`)
  if (!source || !target || !from || !to) {
    return false
  }
  const offset = from.getBoundingClientRect().top - source.getBoundingClientRect().top
  clampScroll(target, target.scrollTop + to.getBoundingClientRect().top - target.getBoundingClientRect().top - offset)
  return true
}

/** 这一天的格子是否整个落在日历可见范围里。 */
export function calendarDateVisible(body: HTMLElement | null, date: string) {
  const cell = body?.querySelector<HTMLElement>(`[data-service-date="${date}"]`)
  if (!body || !cell) {
    return false
  }
  const box = body.getBoundingClientRect()
  const rect = cell.getBoundingClientRect()
  return rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1
}

/**
 * 两张日历同步滚动：按 source 顶上第一个看得见的日期对齐，同一天在两边一样高
 * （各张日历的月份标题、表头高度不一样，按月份对齐会错开一行）。target 没有这一天时按月份对齐。
 */
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

  // 滚动时频繁调用：只在顶上这个月和下一个月里找第一个看得见的日期。
  const top = source.getBoundingClientRect().top
  const index = sourceMonths.indexOf(current)
  const first = sourceMonths
    .slice(index, index + 2)
    .flatMap((section) => [...section.querySelectorAll<HTMLElement>('[data-service-date]')])
    .find((cell) => cell.getBoundingClientRect().bottom > top + 4)
  if (first?.dataset.serviceDate && alignCalendarToDate(source, target, first.dataset.serviceDate)) {
    return
  }

  const key = current.dataset.month || ''
  const match = targetMonths.find((section) => section.dataset.month === key) ?? nearestMonthSection(targetMonths, key)
  if (!match) {
    return
  }

  clampScroll(target, match.offsetTop - (current.offsetTop - source.scrollTop))
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
