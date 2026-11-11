import { message } from 'antd'
import { ordersApi } from '../../api/orders'
import { formatMonthDay } from '../../localDate'
import type { Order } from '../../types'
import type { CalendarMark } from './DispatcherCalendarCard'
import { addDays, type ReschedulePlan } from './useOrderReschedule'

/**
 * 在订单日历上拖动改日期的预览、底部按钮条和保存：调度台订单卡和公司信息「订单记录」的改日期弹框共用。
 */
export interface ReschedulePreview {
  plan: ReschedulePlan
  /** 新日期上的各天：原来的行程跟着平移；两头新增的是空白日（蓝色「新增」）。 */
  marks: CalendarMark[]
  /** 落到新范围外、会删掉的天数。 */
  removed: number
  /** 其中写了行程或派了司导的天数。 */
  removedFilled: number
  /** 两头新增的空白天数。 */
  added: number
}

/** 按方案算出预览；`baseMarks` 是订单日历上原来的格子（颜色、司导、住宿等跟着平移）。 */
export function reschedulePreviewOf(order: Order, plan: ReschedulePlan, baseMarks: CalendarMark[]): ReschedulePreview {
  const sorted = [...order.days].sort((left, right) => left.serviceDate.localeCompare(right.serviceDate))
  const markByDate = new Map(baseMarks.map((mark) => [mark.date, mark]))
  const marks: CalendarMark[] = []
  let removed = 0
  let removedFilled = 0
  for (const day of sorted) {
    const date = addDays(day.serviceDate, plan.shift)
    if (date < plan.start || date > plan.end) {
      removed += 1
      if (day.driverId || day.endLocation || day.description) {
        removedFilled += 1
      }
      continue
    }
    const mark = markByDate.get(day.serviceDate)
    marks.push({
      ...(mark ?? { dayId: day.id, orderId: order.id }),
      date,
      owned: undefined,
      conflict: false,
      grab: false,
      orderStart: date === plan.start,
      orderEnd: date === plan.end,
    })
  }
  const spanStart = sorted.length > 0 ? addDays(sorted[0].serviceDate, plan.shift) : null
  const spanEnd = sorted.length > 0 ? addDays(sorted[sorted.length - 1].serviceDate, plan.shift) : null
  let added = 0
  for (let date = plan.start; date <= plan.end; date = addDays(date, 1)) {
    if (spanStart && spanEnd && date >= spanStart && date <= spanEnd) {
      continue
    }
    added += 1
    marks.push({
      date,
      dayId: `new-${date}`,
      orderId: order.id,
      label: '新增',
      // 和新建订单框选日期时同一个颜色，一眼看出拉长了哪几天。
      color: '#e6f4ff',
      textColor: '#1677ff',
      orderStart: date === plan.start,
      orderEnd: date === plan.end,
    })
  }
  return { plan, marks, removed, removedFilled, added }
}

/** 改日期时卡片上的提示：拉长缩短时换一句。 */
export function rescheduleHint(resizing: boolean) {
  return resizing
    ? '拉长缩短：拖到新的开头或末尾，原来的日期不动。'
    : '改日期：按住行程拖动，整单前后挪；长按开头或末尾那天约 0.5 秒再拖，拉长或缩短。'
}

/** 写入新日期；有冲突提示一并显示。返回是否保存成功。 */
export async function saveOrderDates(orderId: string, plan: ReschedulePlan) {
  try {
    const result = await ordersApi.reschedule(orderId, plan.start, plan.end, plan.shift)
    if (result.warnings.length > 0) {
      message.warning({ content: `日期已改。${result.warnings.join('；')}`, duration: 8 })
    } else {
      message.success('日期已修改')
    }
    return true
  } catch (error) {
    message.error(error instanceof Error ? error.message : '修改日期失败')
    return false
  }
}

/**
 * 改日期的底部按钮条：新起止和变化说明，取消 / 还原。「保存」在卡片头上关闭按钮左边（`RescheduleSaveButton`）。
 */
export function RescheduleFooter({
  preview,
  tooLong,
  changed,
  onCancel,
  onReset,
}: {
  preview: ReschedulePreview
  tooLong: boolean
  changed: boolean
  onCancel: () => void
  onReset: () => void
}) {
  const { plan, removed, removedFilled, added } = preview
  const count = (Date.parse(plan.end) - Date.parse(plan.start)) / 86_400_000 + 1
  const parts = [`${formatMonthDay(plan.start)} 至 ${formatMonthDay(plan.end)} · ${count} 天`]
  if (plan.shift !== 0) {
    parts.push(`整单${plan.shift > 0 ? '推后' : '提前'} ${Math.abs(plan.shift)} 天`)
  }
  if (added > 0) {
    parts.push(`新增 ${added} 天空白`)
  }
  if (removed > 0) {
    parts.push(`删掉 ${removed} 天${removedFilled > 0 ? '（含行程和派单）' : ''}`)
  }
  return (
    <div className="reschedule-bar">
      <p className={`reschedule-summary${removed > 0 ? ' warn' : ''}${tooLong ? ' warn' : ''}`}>
        {tooLong ? '一次最多三个月' : parts.join(' · ')}
      </p>
      <div className="reschedule-row">
        <button type="button" className="dispatcher-chip" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="dispatcher-chip" disabled={!changed} onClick={onReset}>
          还原
        </button>
      </div>
    </div>
  )
}

/**
 * 改日期的「保存」，放在卡片头上关闭按钮左边。
 * 要删掉日子时先套红框（`armed`），再点一次才保存（`data-card-remove` 让点它不算点别处）。
 */
export function RescheduleSaveButton({
  tooLong,
  changed,
  busy,
  armed,
  onSave,
}: {
  tooLong: boolean
  changed: boolean
  busy: boolean
  armed: boolean
  onSave: () => void
}) {
  return (
    <button
      type="button"
      className={`dispatcher-chip card-save reschedule-save${armed ? ' release' : ''}`}
      data-card-remove={armed ? 'true' : undefined}
      disabled={!changed || tooLong || busy}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onSave}
    >
      {armed ? '确认删掉并保存' : '保存'}
    </button>
  )
}
