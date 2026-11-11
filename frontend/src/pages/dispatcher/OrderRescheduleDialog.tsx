import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuthenticatedAuth } from '../../auth/authState'
import { contrastText } from '../../calendarUi'
import { earlierDate, laterDate } from '../../localDate'
import { orderDisplayLabel, orderSpan } from '../../orderFlags'
import { placeMark } from '../../placeMark'
import type { Order } from '../../types'
import { useDisarmOnOutside } from '../../useDisarmOnOutside'
import { useLockPageScroll } from '../../useLockPageScroll'
import { scrollCalendarToDate } from './boardCalendar'
import { DEFAULT_ASSIGNED_COLOR } from './boardLayout'
import { DispatcherCalendarCard, type CalendarMark } from './DispatcherCalendarCard'
import { RescheduleFooter, RescheduleSaveButton, reschedulePreviewOf, rescheduleHint, saveOrderDates } from './orderReschedulePreview'
import { addDays, useOrderReschedule } from './useOrderReschedule'

/**
 * 改日期弹框：和调度台订单卡上的改日期同一套（同一个拖动手势、预览、按钮条和接口），用在公司信息的订单记录里。
 * 打开就是改日期状态：按住行程拖动整单前后挪；长按开头或末尾约 0.5 秒再拖，拉长或缩短。
 */
export function OrderRescheduleDialog({
  order,
  onClose,
  onSaved,
}: {
  order: Order
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const { user } = useAuthenticatedAuth()
  const bodyRef = useRef<HTMLDivElement>(null)
  const reschedule = useOrderReschedule(bodyRef)
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const span = orderSpan(order)
  const start = span?.start ?? order.startDate
  const end = span?.end ?? start
  useLockPageScroll(true)

  const { open } = reschedule
  useEffect(() => {
    open(order.id, start, end)
    // 只在打开时开始一次；保存后弹框会关掉。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 打开时把行程放到日历中间。
  useLayoutEffect(() => {
    scrollCalendarToDate(bodyRef.current, start, 'center')
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDisarmOnOutside(armed, '[data-card-remove]', useCallback(() => setArmed(false), []))

  const color = user.assignedColor || DEFAULT_ASSIGNED_COLOR
  const baseMarks: CalendarMark[] = order.days.map((day) => ({
    date: day.serviceDate,
    dayId: day.id,
    orderId: order.id,
    label: day.driverId ? day.driverName?.slice(0, 1) : '未派',
    place: placeMark(day.endLocation),
    weather: day.weather,
    assigned: Boolean(day.driverId),
    color: day.driverId ? color : '#FFF1B8',
    textColor: day.driverId ? contrastText(color) : '#d46b08',
  }))
  const preview = reschedule.preview ? reschedulePreviewOf(order, reschedule.preview, baseMarks) : null
  // 日历前后多留一些月份，方便往前、往后挪。
  const rangeStart = earlierDate(addDays(start, -62), preview?.plan.start) ?? start
  const rangeEnd = laterDate(addDays(end, 92), preview?.plan.end) ?? end

  async function save() {
    if (!preview || busy || !reschedule.changed || reschedule.tooLong) {
      return
    }
    // 和调度台一样：要删掉日子时第一次点「保存」套红框，再点一次才保存。
    if (preview.removed > 0 && !armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    setBusy(true)
    try {
      if (await saveOrderDates(order.id, preview.plan)) {
        reschedule.close()
        await onSaved()
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="reschedule-dialog-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="reschedule-dialog">
        <DispatcherCalendarCard
          title={orderDisplayLabel(order) || '调整日期'}
          subtitle={rescheduleHint(reschedule.resizing)}
          marks={preview ? preview.marks : baseMarks}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          bodyRef={bodyRef}
          bodyKey="reschedule-dialog"
          onClose={onClose}
          selectable
          pickFrom={preview?.plan.start ?? start}
          pickTo={preview?.plan.end ?? end}
          onDatePointerDown={reschedule.press}
          onDateTouchHold={reschedule.hold}
          onDatePointerEnter={reschedule.enter}
          headAction={
            <RescheduleSaveButton
              tooLong={reschedule.tooLong}
              changed={reschedule.changed}
              busy={busy}
              armed={armed}
              onSave={() => void save()}
            />
          }
          footer={
            preview ? (
              <RescheduleFooter
                preview={preview}
                tooLong={reschedule.tooLong}
                changed={reschedule.changed}
                onCancel={onClose}
                onReset={() => reschedule.reset()}
              />
            ) : null
          }
        />
      </div>
    </div>
  )
}
