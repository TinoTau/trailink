import './calendarDay.css'

export function CalendarDayCaption({ day, label }: { day: number; label?: string }) {
  return (
    <span className="calendar-day-caption">
      <b>{day}</b>
      {label ? <em>{label}</em> : null}
    </span>
  )
}
