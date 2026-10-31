import { useState } from 'react'
import { conflictPatternStyle, type ConflictPattern } from '../../orderFlags'

export function PersonAvatar({ name, src, pattern }: { name: string; src: string | null; pattern?: ConflictPattern }) {
  const [failed, setFailed] = useState(false)
  return (
    <b style={pattern ? conflictPatternStyle(pattern, 36) : undefined}>
      {pattern ? null : src && !failed ? (
        <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />
      ) : (
        name.slice(0, 1)
      )}
    </b>
  )
}

export function DeskHint({ open, text, onToggle }: { open: boolean; text: string; onToggle: () => void }) {
  return (
    <div className="dispatcher-hint-block">
      <button
        type="button"
        className="dispatcher-hint-toggle"
        aria-expanded={open}
        aria-label={open ? '收起说明' : '展开说明'}
        onClick={onToggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={open ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'} />
        </svg>
      </button>
      {open ? <p className="dispatcher-hint">{text}</p> : null}
    </div>
  )
}
