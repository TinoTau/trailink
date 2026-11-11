import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { conflictPatternStyle, type ConflictPattern } from '../../orderFlags'
import type { OrderClaim } from '../../types'
import '../../ConflictDatePopover.css'

/**
 * 订单卡片、司导卡片里的抢单确认（放在日期天数 / 司导备注下方）。
 * 有确定的司导时显示「确认派单」；多位司导抢、还没选人时提示去选。
 */
export function ClaimConfirmBar({
  text,
  busy,
  onConfirm,
}: {
  text: string
  busy: boolean
  onConfirm?: () => void
}) {
  return (
    <div className="claim-confirm">
      <span>{text}</span>
      {onConfirm ? (
        <button
          type="button"
          className="claim-confirm-button"
          disabled={busy}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onConfirm}
        >
          确认派单
        </button>
      ) : null}
    </div>
  )
}

/**
 * 多位司导抢同一张单：和重复日期框一样的小弹框，每位司导一格，扑克牌图案做底，写司导名字。
 * 点一格打开这位司导；司导区域里对应的图标也换成同样的扑克牌，点那边也一样。
 */
export function ClaimPickPopover({
  anchor,
  claims,
  patterns,
  onPick,
  onClose,
}: {
  anchor: DOMRect
  claims: OrderClaim[]
  patterns: Map<string, ConflictPattern>
  onPick: (driverId: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target
      if (target instanceof Element && (target.closest('.conflict-date-popover') || target.closest('[data-driver-id]') || target.closest('[data-order-tile]'))) {
        return
      }
      onClose()
    }
    const timer = window.setTimeout(() => document.addEventListener('click', onClick), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('click', onClick)
    }
  }, [onClose])

  const width = Math.max(claims.length, 1) * 78 + Math.max(claims.length - 1, 0) * 4 + 8
  const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8))
  const below = anchor.bottom + 6
  const top = below + 74 > window.innerHeight ? Math.max(8, anchor.top - 80) : below

  return createPortal(
    <div className="conflict-date-popover claim-pick" style={{ top, left }} role="dialog" aria-label="选择抢单的司导">
      {claims.map((claim) => {
        const pattern = patterns.get(claim.driverId)
        return (
          <button
            key={claim.driverId}
            type="button"
            className="conflict-date-copy"
            style={pattern ? conflictPatternStyle(pattern, 62) : undefined}
            aria-label={`查看 ${claim.driverName}`}
            onClick={() => onPick(claim.driverId)}
          >
            <span className="claim-pick-name">{claim.driverName}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
