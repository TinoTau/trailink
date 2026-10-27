import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './ConflictDatePopover.css'

import { formatMonthDay } from './localDate'
import { conflictPatternStyle, dayOnDriverDate, ordersOnDriverDate, patternForOrder, type ConflictPattern } from './orderFlags'
import type { ItineraryDay, Order } from './types'

export type ConflictDateChoice = {
  orderId: string
  dayId: string
  dateLabel: string
  label: string
  pattern: ConflictPattern
  showText: boolean
}

export function conflictDateChoices(
  orders: Order[],
  driverId: string,
  date: string,
  patternIds: Iterable<string>,
  textFor: (order: Order, day: ItineraryDay | undefined) => { label: string; showText: boolean },
): ConflictDateChoice[] {
  const ids = [...patternIds]
  const dateLabel = formatMonthDay(date)
  return ordersOnDriverDate(orders, driverId, date).map((order) => {
    const day = dayOnDriverDate(order, driverId, date)
    const text = textFor(order, day)
    return {
      orderId: order.id,
      dayId: day?.id ?? '',
      dateLabel,
      label: text.label,
      pattern: patternForOrder(ids, order.id),
      showText: text.showText,
    }
  })
}

export function ConflictDatePopover({
  anchor,
  choices,
  onChoose,
  onClose,
}: {
  anchor: DOMRect
  choices: ConflictDateChoice[]
  onChoose: (choice: ConflictDateChoice) => void
  onClose: () => void
}) {
  const [armedId, setArmedId] = useState<string | null>(null)

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('.conflict-date-popover')) {
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

  const width = Math.max(choices.length, 1) * 78 + Math.max(choices.length - 1, 0) * 4 + 8
  const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8))
  const below = anchor.bottom + 6
  const top = below + 74 > window.innerHeight ? Math.max(8, anchor.top - 80) : below

  return createPortal(
    <div className="conflict-date-popover" style={{ top, left }} role="dialog" aria-label="选择要移除的订单">
      {choices.map((choice) => (
        <button
          key={choice.orderId}
          type="button"
          className={`conflict-date-copy${armedId === choice.orderId ? ' release' : ''}`}
          style={conflictPatternStyle(choice.pattern, 62)}
          aria-pressed={armedId === choice.orderId}
          aria-label={
            armedId === choice.orderId
              ? `再点一次移除${choice.showText ? ` ${choice.dateLabel}` : ''}`
              : choice.showText
                ? `${choice.dateLabel} ${choice.label}`.trim()
                : '无权移除'
          }
          onClick={() => {
            if (armedId !== choice.orderId) {
              setArmedId(choice.orderId)
              return
            }
            onChoose(choice)
          }}
        >
          {choice.showText ? (
            <>
              <b>{choice.dateLabel}</b>
              {choice.label ? <em>{choice.label}</em> : null}
            </>
          ) : null}
        </button>
      ))}
    </div>,
    document.body,
  )
}
