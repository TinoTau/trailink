// 页面里共用的简笔图标，各只画一份。

export function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 5h10l4 4v10H5V5z" />
      <path d="M15 5v4h4M8 12h8M8 16h6" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/** 置顶：斜放的图钉，司导、调度员和车辆共用。 */
export function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 4.5l4.5 4.5-3 1.5-4.5 4.5-3-3 4.5-4.5L15 4.5zM6 18l4-2" />
    </svg>
  )
}
