import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { Modal } from 'antd'
import { recognitionApi, type OrderImport } from '../../api/recognition'
import { WEEKDAYS, parseYmd, todayLocal } from '../../localDate'
import { orderDisplayLabel } from '../../orderFlags'
import { IslandToggle } from '../OrderInfoFields'
import type { DraftActivity, DraftDay, Order, OrderDraft, OrderFillPreview, OrderFillResult } from '../../types'
import { CloseIcon } from '../icons'
import './dispatcher.css'
import './ai-order.css'

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const MAX_FILES = 12
/** 粘贴的行程文字最多这么多字（和服务器一致）。 */
const MAX_TEXT = 20000

type Step = 'pick' | 'busy' | 'review' | 'saving'

/** 给已有的粗单填入行程明细（而不是新建订单）。 */
export interface AiFillTarget {
  order: Order
  /** 写调度备注：司导没有调度备注，不显示备注一栏。 */
  notes: boolean
  onFilled: (result: OrderFillResult) => void
}

/**
 * 调度台「AI 建单」：上传旅行社的行程图和电子票 → AI 整理成草稿 → 调度员核对修改 → 一次生成订单。
 * 草稿里 AI 拿不准的地方标黄；不在南岛包车范围的日子默认不勾。
 * 带 <code>fill</code> 时是「填入行程明细」：同样识别、核对，再看一眼对照（司导、车辆按第几天挪，冲突标红），填进这张粗单。
 */
export function AiOrderCard({
  onClose,
  onCreated,
  onMyDesk = false,
  fill,
}: {
  onClose: () => void
  onCreated?: (orderId: string) => void
  /** 在调度台上建单：放在自己的调度台上；派给调度里建单留在公司订单池。 */
  onMyDesk?: boolean
  fill?: AiFillTarget
}) {
  const [step, setStep] = useState<Step>('pick')
  const [files, setFiles] = useState<File[]>([])
  /** 直接粘贴的行程文字（微信、邮件里复制来的），可以和文件一起识别。 */
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<OrderDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) {
      return
    }
    const picked = Array.from(list).filter(
      (file) => ACCEPT.split(',').includes(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name),
    )
    setFiles((current) => [...current, ...picked].slice(0, MAX_FILES))
    setError(picked.length < list.length ? '只能上传 jpg / png / webp / pdf。' : null)
  }

  async function recognize() {
    setStep('busy')
    setError(null)
    try {
      setDraft(await recognitionApi.draft(files, text, fill?.order.id))
      setStep('review')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'AI 识别失败，请稍后再试。')
      setStep('pick')
    }
  }

  async function create() {
    if (!draft) {
      return
    }
    const days = includedDays(draft)
    if (days.length === 0) {
      setError('请至少勾选一天。')
      return
    }
    setStep('saving')
    setError(null)
    try {
      const created = await recognitionApi.import(
        {
          platformOrderNo: draft.platformOrderNo?.trim() || null,
          guestCount: draft.guestCount ?? 0,
          vehicleType: draft.vehicleType?.trim() || null,
          // 行程图里看不出来就按南岛。
          island: draft.island ?? 'south',
          notes: draft.notes?.trim() || null,
          onMyDesk,
          days,
        },
        files,
      )
      onCreated?.(created.orderId)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '生成订单失败')
      setStep('review')
    }
  }

  /** 填入行程明细：先取对照给人确认，确认后才写入。细单没写的（人数、车型、南/北岛）传空，保留粗单的。 */
  async function fillOrder() {
    if (!draft || !fill) {
      return
    }
    const days = includedDays(draft)
    if (days.length === 0) {
      setError('请至少勾选一天。')
      return
    }
    const payload = {
      platformOrderNo: draft.platformOrderNo?.trim() || null,
      guestCount: draft.guestCount ?? null,
      vehicleType: draft.vehicleType?.trim() || null,
      island: draft.island ?? null,
      notes: fill.notes ? draft.notes?.trim() || null : null,
      days,
    }
    setStep('saving')
    setError(null)
    let preview: OrderFillPreview
    try {
      preview = await recognitionApi.fillPreview(fill.order.id, payload)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '对照失败')
      setStep('review')
      return
    }
    setStep('review')
    Modal.confirm({
      title: `填入 ${orderDisplayLabel(fill.order) || '这张单'}？`,
      icon: null,
      width: 460,
      content: <FillPreviewList preview={preview} />,
      okText: `填入（${days.length} 天）`,
      cancelText: '再改改',
      onOk: async () => {
        setStep('saving')
        try {
          fill.onFilled(await recognitionApi.fill(fill.order.id, payload, files))
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : '填入行程明细失败')
          setStep('review')
        }
      },
    })
  }

  function close() {
    if (step === 'review') {
      Modal.confirm({
        title: '放弃这次识别？',
        content: '关闭后识别结果不会保存。',
        okText: '放弃',
        cancelText: '继续核对',
        onOk: onClose,
      })
      return
    }
    onClose()
  }

  function updateDay(index: number, change: Partial<DraftDay>) {
    setDraft((current) =>
      current ? { ...current, days: current.days.map((day, i) => (i === index ? { ...day, ...change } : day)) } : current,
    )
  }

  /** 在卡片里粘贴截图：当作上传的图片。粘贴文字时照常进文字框。 */
  function onPaste(event: ClipboardEvent) {
    if (step !== 'pick') {
      return
    }
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) {
      return
    }
    // 在文字框里粘贴、剪贴板里也有文字时（例如从 Word、网页复制，附带一张图片），按文字粘贴，不当成截图。
    if (event.target instanceof HTMLTextAreaElement && event.clipboardData.getData('text/plain').trim()) {
      return
    }
    event.preventDefault()
    const stamp = new Date().toTimeString().slice(0, 8).replaceAll(':', '')
    setFiles((current) =>
      [
        ...current,
        ...images.map(
          (file, index) =>
            new File([file], `粘贴的截图-${stamp}${images.length > 1 ? `-${index + 1}` : ''}.${file.type.split('/')[1] || 'png'}`, {
              type: file.type,
            }),
        ),
      ].slice(0, MAX_FILES),
    )
    setError(null)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragOver(false)
    if (step === 'pick') {
      addFiles(event.dataTransfer.files)
    }
  }

  const included = draft?.days.filter((day) => day.include).length ?? 0
  const subtitle =
    step === 'review' || step === 'saving'
      ? `${draft?.days.length ?? 0} 天，${fill ? '填入' : '导入'} ${included} 天 · 黄色待核对 · 点文字修改`
      : fill
        ? `${[orderDisplayLabel(fill.order), `${fill.order.dayCount} 天`].filter(Boolean).join(' · ')}。上传或粘贴这张单的行程明细，核对后填进去：以明细为准，司导、车辆按第几天跟着挪。`
        : '上传旅行社发来的行程图和电子票，或直接粘贴行程文字，AI 整理成订单草稿，核对后一键生成。'

  return (
    <article
      className={`dispatcher-card ai-order-card${dragOver ? ' drag-over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(step === 'pick')
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <header className="dispatcher-card-head">
        <div className="order-info-main">
          <div className="dispatcher-card-title">
            <strong>{fill ? '填入行程明细' : 'AI 建单'}</strong>
          </div>
          <p className="dispatcher-card-meta">{subtitle}</p>
        </div>
        <div className="card-head-actions">
          {step === 'review' || step === 'saving' ? (
            <button
              type="button"
              className="dispatcher-chip card-save reschedule-save"
              disabled={step === 'saving' || included === 0}
              onClick={() => void (fill ? fillOrder() : create())}
            >
              {step === 'saving' ? (fill ? '填入中…' : '生成中…') : fill ? `填入（${included} 天）` : `生成订单（${included} 天）`}
            </button>
          ) : null}
          <button type="button" className="dispatcher-icon-btn" aria-label="关闭" onClick={close}>
            <CloseIcon />
          </button>
        </div>
      </header>
      <div className="dispatcher-card-body ai-order-body">
        {step === 'pick' ? (
          <>
            <button type="button" className="ai-drop" onClick={() => input.current?.click()}>
              <strong>选择、拖入或粘贴截图</strong>
              <span>行程图请用原图（微信里勾「原图」），电子票可以是 PDF。一次最多 {MAX_FILES} 个。</span>
            </button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ''
              }}
            />
            {files.length > 0 ? (
              <ul className="ai-files">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span className="ai-file-kind">{/\.pdf$/i.test(file.name) ? 'PDF' : '图'}</span>
                    <span className="ai-file-name">{file.name}</span>
                    <span className="ai-file-size">{formatSize(file.size)}</span>
                    <button
                      type="button"
                      aria-label={`移除 ${file.name}`}
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="ai-paste">
              <span>或者粘贴行程文字</span>
              <textarea
                value={text}
                maxLength={MAX_TEXT}
                rows={5}
                placeholder="把微信、邮件里的行程直接粘贴在这里，例如：11月11日 基督城接机，住特卡波；11月12日 库克山……也可以和上面的图片、电子票一起识别。"
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            {error ? <p className="ai-error">{error}</p> : null}
            <button
              type="button"
              className="driver-primary-button ai-wide"
              disabled={files.length === 0 && !text.trim()}
              onClick={() => void recognize()}
            >
              开始识别{sourceLabel(files.length, text.trim().length > 0)}
            </button>
          </>
        ) : null}

        {step === 'busy' ? (
          <div className="ai-busy" role="status">
            <span className="ai-spinner" aria-hidden="true" />
            <strong>AI 正在识别…</strong>
            <span>长图大约要 10～30 秒，请不要关闭。</span>
          </div>
        ) : null}

        {(step === 'review' || step === 'saving') && draft ? (
          <>
            {draft.warnings.length > 0 ? (
              <details className="ai-warnings">
                <summary>
                  <span>AI 提醒 {draft.warnings.length} 条</span>
                  <em>{draft.warnings[0]}</em>
                </summary>
                <ul>
                  {draft.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <section className="ai-order-fields">
              <InlineText
                label="订单号"
                value={draft.platformOrderNo ?? ''}
                placeholder="无"
                onChange={(platformOrderNo) => setDraft({ ...draft, platformOrderNo })}
              />
              <InlineText
                label="人数"
                className={`ai-guests ${draft.guestCount == null ? 'uncertain' : ''}`}
                value={draft.guestCount == null ? '' : String(draft.guestCount)}
                placeholder="?"
                numeric
                onChange={(text) => setDraft({ ...draft, guestCount: /^\d+$/.test(text) ? Number(text) : null })}
              />
              <InlineText
                label="车型"
                className={draft.vehicleType ? undefined : 'uncertain'}
                value={draft.vehicleType ?? ''}
                placeholder="?"
                onChange={(vehicleType) => setDraft({ ...draft, vehicleType })}
              />
              <div className="ai-island">
                <span>南/北岛</span>
                <IslandToggle island={draft.island} onChange={(island) => setDraft({ ...draft, island })} />
              </div>
              <YearField draft={draft} onChange={setDraft} />
              {fill && !fill.notes ? null : (
                <InlineText
                  label="备注"
                  className="ai-span"
                  value={draft.notes ?? ''}
                  placeholder={fill ? '只有自己看得到，接在原来的备注后面' : '只有自己看得到'}
                  multiline
                  onChange={(notes) => setDraft({ ...draft, notes })}
                />
              )}
            </section>
            <div className="ai-days">
              {draft.days.map((day, index) => (
                <DraftDayCard
                  key={`${day.serviceDate}-${index}`}
                  day={day}
                  files={draft.files}
                  onChange={(change) => updateDay(index, change)}
                />
              ))}
            </div>
            <p className="ai-caption">
              {fill ? '没识别出来的（人数、车型、某天的行程）保留这张单原来的。' : ''}
              电子票会挂到对应活动上，行程图存为订单截图（7 天后自动删除）。
              {draft.model ? ` 识别：${modelLabel(draft.model)}，${(draft.inputTokens + draft.outputTokens).toLocaleString()} token。` : ''}
            </p>
          </>
        ) : null}
      </div>
      {step === 'review' || step === 'saving' ? (
        <footer className="ai-footer">
          {error ? <p className="ai-error">{error}</p> : null}
          <div className="ai-footer-row">
            <button
              type="button"
              className="ai-secondary"
              disabled={step === 'saving'}
              onClick={() => {
                setDraft(null)
                setStep('pick')
              }}
            >
              重新上传
            </button>
          </div>
        </footer>
      ) : null}
    </article>
  )
}

/** 核对后要提交的日期（勾选的），改过日期的那天活动时间跟着换到新日期。 */
function includedDays(draft: OrderDraft): OrderImport['days'] {
  return draft.days
    .filter((day) => day.include)
    .map((day) => ({
      serviceDate: day.serviceDate,
      description: day.description,
      endLocation: day.endLocation,
      activities: day.activities
        .filter((activity) => activity.content.trim())
        .map((activity) => ({
          ...activity,
          bookingTime: moveToDate(activity.bookingTime, day.serviceDate),
          checkinTime: moveToDate(activity.checkinTime, day.serviceDate),
        })),
    }))
}

/** 填入前的对照：每一天接原来哪天的司导、车辆；冲突标红（照样保留）；删掉的天。 */
function FillPreviewList({ preview }: { preview: OrderFillPreview }) {
  return (
    <div className="ai-fill-preview">
      <p className="ai-fill-lead">以明细为准。司导、车辆按第几天跟着挪；冲突的照样保留，日历上标红，之后再调整。</p>
      <ul>
        {preview.days.map((day) => {
          const conflict = day.driverConflict || day.vehicleConflict
          return (
            <li key={day.serviceDate} className={conflict ? 'conflict' : undefined}>
              <span className="ai-fill-date">{formatDay(day.serviceDate)}</span>
              <span className="ai-fill-who">
                {day.fromDate == null
                  ? '新加的一天，未派'
                  : [
                      day.fromDate !== day.serviceDate ? `原 ${formatShort(day.fromDate)}` : '日期不变',
                      day.driverName ? `${day.driverName}${day.driverConflict ? '（那天已有行程）' : ''}` : '未派',
                      day.plate ? `${day.plate}${day.vehicleConflict ? '（那天已被占用）' : ''}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </li>
          )
        })}
      </ul>
      {preview.removed.length > 0 ? (
        <>
          <p className="ai-fill-lead">明细比原来短，删掉这些天：</p>
          <ul>
            {preview.removed.map((day) => (
              <li key={day.serviceDate} className="removed">
                <span className="ai-fill-date">{formatDay(day.serviceDate)}</span>
                <span className="ai-fill-who">
                  {[day.driverName ? `原派 ${day.driverName}` : '未派', day.plate ?? '', day.hasContent ? '写过行程' : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

function formatShort(value: string) {
  const date = parseYmd(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function DraftDayCard({ day, files, onChange }: { day: DraftDay; files: string[]; onChange: (change: Partial<DraftDay>) => void }) {
  const unsure = (field: string) => (day.uncertain.includes(field) ? 'uncertain' : '')
  // 电子票只在上传了 PDF 或 AI 已配上电子票时显示：只传行程图时用不到。
  const ticketPicker = files.some((name) => /\.pdf$/i.test(name)) || day.activities.some((item) => item.ticketIndex != null)

  function updateActivity(index: number, change: Partial<DraftActivity>) {
    onChange({ activities: day.activities.map((item, i) => (i === index ? { ...item, ...change } : item)) })
  }

  if (!day.include) {
    return (
      <section className="ai-day excluded">
        <label className="ai-day-check">
          <input type="checkbox" checked={false} onChange={() => onChange({ include: true })} />
          <span>{formatDay(day.serviceDate)}</span>
          <em>{day.note || '不导入'}</em>
        </label>
      </section>
    )
  }

  return (
    <section className="ai-day">
      <div className="ai-day-head">
        <input
          type="checkbox"
          checked
          aria-label={`不导入 ${formatDay(day.serviceDate)}`}
          onChange={() => onChange({ include: false })}
        />
        <label className={`ai-day-date ${unsure('serviceDate')}`} title="点击修改日期">
          {formatDay(day.serviceDate)}
          <input
            type="date"
            value={day.serviceDate}
            aria-label="日期"
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => event.target.value && onChange({ serviceDate: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="ai-add"
          onClick={() =>
            onChange({
              activities: [
                ...day.activities,
                { content: '', kind: 'activity', provider: null, libraryActivityId: null, bookingTime: null, checkinTime: null, ticketIndex: null, uncertain: [] },
              ],
            })
          }
        >
          + 活动
        </button>
        <InlineText
          label="住"
          className={`ai-stay ${unsure('endLocation')}`}
          value={day.endLocation ?? ''}
          placeholder="—"
          onChange={(endLocation) => onChange({ endLocation })}
        />
      </div>
      <InlineText
        className={`ai-desc ${unsure('description')}`}
        value={day.description ?? ''}
        placeholder="当天行程"
        multiline
        onChange={(description) => onChange({ description })}
      />
      {day.activities.map((activity, index) => (
        <DraftActivityRow
          key={index}
          activity={activity}
          date={day.serviceDate}
          files={files}
          ticketPicker={ticketPicker}
          onChange={(change) => updateActivity(index, change)}
          onRemove={() => onChange({ activities: day.activities.filter((_, i) => i !== index) })}
        />
      ))}
    </section>
  )
}

/** 一项活动一行：名称、签到、开始、电子票、删除；酒店只有名称。关联了活动库的名称前有「库」。 */
function DraftActivityRow({
  activity,
  date,
  files,
  ticketPicker,
  onChange,
  onRemove,
}: {
  activity: DraftActivity
  date: string
  files: string[]
  ticketPicker: boolean
  onChange: (change: Partial<DraftActivity>) => void
  onRemove: () => void
}) {
  const unsure = (field: string) => (activity.uncertain.includes(field) ? 'uncertain' : '')
  const hotel = activity.kind === 'hotel'
  const ticket = activity.ticketIndex != null ? files[activity.ticketIndex] : null
  return (
    <div className={`ai-activity${hotel ? ' hotel' : ''}`}>
      {hotel ? <span className="ai-tag hotel">酒店</span> : null}
      {activity.libraryActivityId ? (
        <span className="ai-tag library" title="已关联活动库">
          库
        </span>
      ) : null}
      <InlineText
        className={`ai-activity-name ${unsure('content')}`}
        value={activity.content}
        placeholder={hotel ? '酒店名' : '活动名'}
        startEditing={!activity.content}
        onChange={(content) => onChange({ content })}
      />
      {hotel ? null : (
        <>
          <TimeField
            label="签"
            title="签到"
            className={unsure('checkinTime')}
            value={activity.checkinTime}
            date={date}
            onChange={(checkinTime) => onChange({ checkinTime })}
          />
          <TimeField
            label="始"
            title="开始"
            className={unsure('bookingTime')}
            value={activity.bookingTime}
            date={date}
            onChange={(bookingTime) => onChange({ bookingTime })}
          />
          {ticketPicker ? (
            <label className={`ai-ticket ${unsure('ticket')}${ticket ? ' picked' : ''}`} title={ticket ? `电子票：${ticket}` : '选择电子票'}>
              {ticket ? '票' : '+票'}
              <select
                value={activity.ticketIndex ?? ''}
                aria-label="电子票"
                onChange={(event) => onChange({ ticketIndex: event.target.value === '' ? null : Number(event.target.value) })}
              >
                <option value="">无电子票</option>
                {files.map((name, index) => (
                  <option key={index} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      )}
      <button type="button" className="ai-remove" aria-label="删除这项" onClick={onRemove}>
        <CloseIcon />
      </button>
    </div>
  )
}

/**
 * 平时显示成紧凑的文字，点一下才变成输入框，离开时保存。
 * 手机上输入框必须 16px 才不会放大整页，所以只在编辑那一项时用大字。
 */
function InlineText({
  label,
  className = '',
  value,
  placeholder,
  multiline = false,
  numeric = false,
  startEditing = false,
  onChange,
}: {
  label?: string
  className?: string
  value: string
  placeholder: string
  multiline?: boolean
  numeric?: boolean
  startEditing?: boolean
  onChange: (value: string) => void
}) {
  const [editing, setEditing] = useState(startEditing)
  const [text, setText] = useState(value)

  function open() {
    setText(value)
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    if (text.trim() !== value.trim()) {
      onChange(text.trim())
    }
  }

  const field = multiline ? (
    <textarea
      autoFocus
      value={text}
      rows={2}
      aria-label={label ?? placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
    />
  ) : (
    <input
      autoFocus
      value={text}
      inputMode={numeric ? 'numeric' : undefined}
      aria-label={label ?? placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
    />
  )

  return (
    <div className={`ai-inline ${className}${editing ? ' editing' : ''}`}>
      {label ? <span className="ai-inline-label">{label}</span> : null}
      {editing ? (
        field
      ) : (
        <button type="button" className={value ? undefined : 'empty'} onClick={open}>
          {value || placeholder}
        </button>
      )}
    </div>
  )
}

/** 24 小时制时间：平时显示「签 10:40」，点开可输 1530、15:30、15.30、9:5；输错退回原值，清空就是没有时间。 */
function TimeField({
  label,
  title,
  className,
  value,
  date,
  onChange,
}: {
  label: string
  title: string
  className: string
  value: string | null
  date: string
  onChange: (value: string | null) => void
}) {
  return (
    <span className="ai-time-wrap" title={title}>
      <InlineText
        label={label}
        className={`ai-time ${className}`}
        value={toTime(value)}
        placeholder="--:--"
        numeric
        onChange={(text) => {
          const time = parseTime(text)
          if (time !== undefined) {
            onChange(time ? fromTime(date, time) : null)
          }
        }}
      />
    </span>
  )
}

/** 返回 HH:mm；空返回 null；认不出返回 undefined。 */
function parseTime(text: string): string | null | undefined {
  const value = text.trim()
  if (!value) {
    return null
  }
  const match = /^(\d{1,2})(?:[:：.]?(\d{2}))?$/.exec(value.replace(/\s/g, '')) ?? /^(\d{1,2})[:：.](\d{1,2})$/.exec(value)
  if (!match) {
    return undefined
  }
  const hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (hour > 23 || minute > 59) {
    return undefined
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 年份：行程第一天的年份。原文没写年份时由 AI 推断，可以在这里改：整段行程连同活动时间一起挪整年，
 * 跨年的行程（12 月接 1 月）保持先后。
 */
function YearField({ draft, onChange }: { draft: OrderDraft; onChange: (draft: OrderDraft) => void }) {
  const first = draft.days.map((day) => day.serviceDate).sort()[0]
  if (!first) {
    return null
  }
  const year = Number(first.slice(0, 4))
  const thisYear = todayLocal().getFullYear()
  const choices = [...new Set([thisYear - 1, thisYear, thisYear + 1, thisYear + 2, year])].sort()
  return (
    <label className="ai-island ai-year">
      <span>年份</span>
      <select
        value={year}
        onChange={(event) => {
          const shift = Number(event.target.value) - year
          onChange({
            ...draft,
            days: draft.days.map((day) => ({
              ...day,
              serviceDate: addYears(day.serviceDate, shift),
              activities: day.activities.map((activity) => ({
                ...activity,
                bookingTime: activity.bookingTime ? addYears(activity.bookingTime, shift) : null,
                checkinTime: activity.checkinTime ? addYears(activity.checkinTime, shift) : null,
              })),
            })),
          })
        }}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  )
}

/** 「2026-02-29…」这样的日期（或日期时间）挪几年；2 月 29 日挪到平年变成 2 月 28 日。 */
function addYears(value: string, years: number) {
  const year = Number(value.slice(0, 4)) + years
  let rest = value.slice(4)
  if (rest.startsWith('-02-29') && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) {
    rest = `-02-28${rest.slice(6)}`
  }
  return `${year}${rest}`
}

function moveToDate(value: string | null, date: string) {
  return value ? `${date}${value.slice(10)}` : null
}

function toTime(value: string | null) {
  return value ? value.slice(11, 16) : ''
}

/** 时间跟着这一天的日期走（改了日期也一样）。 */
function fromTime(date: string, time: string) {
  return time ? `${date}T${time}:00` : null
}

function weekday(value: string) {
  return WEEKDAYS[(parseYmd(value).getDay() + 6) % 7]
}

function formatDay(value: string) {
  const date = parseYmd(value)
  return `${date.getMonth() + 1}月${date.getDate()}日 周${weekday(value)}`
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`
}

function modelLabel(model: string) {
  return model.replace(/^claude-/, 'Claude ').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/haiku|sonnet|opus/, (word) => word[0].toUpperCase() + word.slice(1))
}

/** 「开始识别」后面的说明：几个文件、有没有粘贴的文字。 */
function sourceLabel(fileCount: number, hasText: boolean) {
  if (fileCount > 0 && hasText) {
    return `（${fileCount} 个文件 + 文字）`
  }
  if (fileCount > 0) {
    return `（${fileCount} 个文件）`
  }
  return hasText ? '（粘贴的文字）' : ''
}
