import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { message } from 'antd'
import { libraryApi, ratingLabel } from '../../api/library'
import type { Destination, LibraryActivity } from '../../types'
import { useHoldReorder } from '../../useHoldReorder'
import './library.css'

/**
 * 当日详情「添加活动」弹框。
 * <ul>
 * <li>列出这一天住宿位置（浮雕字）的活动：先按本人拖出来的顺序，其余按评分。拖动列表的顺序记在本人账户上（按目的地分开）。</li>
 * <li>点选可多选，选中的放进下方「已选」，按点选先后编号。已选里可以再拖动调整这一次的顺序，确认后按这个顺序加进这一天。</li>
 * <li>拖动：按住 ⋮⋮ 立即拖；选项其他位置长按约 0.5 秒后拖；手指直接滑动是滚动。</li>
 * <li>可以搜索整个活动库；活动库里没有的可以手动填写（不进活动库）。</li>
 * </ul>
 */
export function ActivityPicker({
  place,
  onConfirm,
  onManual,
  onClose,
}: {
  place: string | null
  onConfirm: (picked: LibraryActivity[]) => Promise<void>
  onManual: () => void
  onClose: () => void
}) {
  const [destination, setDestination] = useState<Destination | null>(null)
  const [local, setLocal] = useState<LibraryActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LibraryActivity[] | null>(null)
  const [picked, setPicked] = useState<LibraryActivity[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    const load = place ? libraryApi.pick(place) : Promise.resolve({ destination: null, activities: [] })
    load
      .then((pick) => {
        if (alive) {
          setDestination(pick.destination)
          setLocal(pick.activities)
        }
      })
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : '读取活动库失败'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [place])

  useEffect(() => {
    const text = query.trim()
    if (!text) {
      // oxlint-disable-next-line react/set-state-in-effect
      setResults(null)
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      libraryApi
        .search(text)
        .then((list) => alive && setResults(list))
        .catch(() => alive && setResults([]))
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query])

  const byId = useMemo(() => new Map(local.map((item) => [item.id, item])), [local])
  const listOrder = useHoldReorder(
    local.map((item) => item.id),
    (ids) => {
      setLocal(ids.map((id) => byId.get(id)!).filter(Boolean))
      if (destination) {
        libraryApi.saveOrder(destination.id, ids).catch(() => message.error('顺序没有保存，请再试一次'))
      }
    },
  )
  const pickedById = useMemo(() => new Map(picked.map((item) => [item.id, item])), [picked])
  const pickedOrder = useHoldReorder(
    picked.map((item) => item.id),
    (ids) => setPicked(ids.map((id) => pickedById.get(id)!).filter(Boolean)),
  )
  const shownPicked = pickedOrder.order.map((id) => pickedById.get(id)).filter((item): item is LibraryActivity => Boolean(item))
  const searching = results !== null
  const shown = results ?? listOrder.order.map((id) => byId.get(id)).filter((item): item is LibraryActivity => Boolean(item))

  function toggle(activity: LibraryActivity) {
    setPicked((current) =>
      current.some((item) => item.id === activity.id) ? current.filter((item) => item.id !== activity.id) : [...current, activity],
    )
  }

  async function confirm() {
    setSaving(true)
    try {
      await onConfirm(shownPicked)
    } finally {
      setSaving(false)
    }
  }

  const placeName = destination?.name || place
  return createPortal(
    <div
      className="library-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="library-sheet" role="dialog" aria-label="添加活动">
        <header className="library-sheet-bar">
          <h2>{placeName ? `${placeName}的活动` : '添加活动'}</h2>
          <button type="button" className="library-chip" onClick={onClose}>
            取消
          </button>
        </header>
        <input
          className="library-search"
          value={query}
          placeholder="搜索活动库（中文或英文）"
          aria-label="搜索活动库"
          onChange={(event) => setQuery(event.target.value)}
        />
        {!searching && !loading && local.length > 1 ? <p className="library-hint">按住 ⋮⋮ 或长按约半秒可拖动调整常用顺序</p> : null}
        <div className="library-list">
          {loading ? <p className="library-empty">加载中…</p> : null}
          {!loading && !searching && local.length === 0 ? (
            <p className="library-empty">
              {destination
                ? `活动库里还没有${destination.name}的活动，可以搜索或手动填写。`
                : '这一天还没写住宿位置，或住宿位置不在活动库里。可以搜索活动库，或手动填写。'}
            </p>
          ) : null}
          {searching && shown.length === 0 ? <p className="library-empty">没有找到，可以手动填写。</p> : null}
          {shown.map((activity) => {
            const index = shownPicked.findIndex((item) => item.id === activity.id)
            const drag = searching ? {} : listOrder.itemProps(activity.id)
            return (
              <div
                key={activity.id}
                {...drag}
                role="checkbox"
                aria-checked={index >= 0}
                tabIndex={0}
                className={`library-option${index >= 0 ? ' picked' : ''}${listOrder.draggingId === activity.id ? ' dragging' : ''}`}
                onClick={() => toggle(activity)}
                onKeyDown={(event) => {
                  if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault()
                    toggle(activity)
                  }
                }}
              >
                <span className="library-pick-badge">{index >= 0 ? index + 1 : ''}</span>
                <span className="library-option-name">
                  {activity.name}
                  {activity.nameZh && activity.nameEn ? <small>{activity.nameEn}</small> : null}
                  {searching ? <small>{activity.destinations.map((item) => item.name).join('、')}</small> : null}
                </span>
                <span className="library-rating">{ratingLabel(activity)}</span>
                {searching ? null : (
                  <span className="library-drag-handle" aria-label="拖动调整常用顺序" {...listOrder.handleProps(activity.id)}>
                    ⋮⋮
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {shownPicked.length ? (
          <section className="library-picked" aria-label="已选活动">
            <p className="library-hint">已选 {shownPicked.length} 项，按这个顺序添加；可拖动调整</p>
            <div className="library-picked-list">
              {shownPicked.map((activity, index) => (
                <div
                  key={activity.id}
                  {...pickedOrder.itemProps(activity.id)}
                  className={`library-picked-row${pickedOrder.draggingId === activity.id ? ' dragging' : ''}`}
                >
                  <span className="library-drag-handle" aria-label="拖动调整顺序" {...pickedOrder.handleProps(activity.id)}>
                    ⋮⋮
                  </span>
                  <span className="library-pick-badge on">{index + 1}</span>
                  <span className="library-option-name">{activity.name}</span>
                  <button type="button" className="library-picked-remove" aria-label={`移除${activity.name}`} onClick={() => toggle(activity)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <footer className="library-sheet-actions">
          <button type="button" className="library-chip" onClick={onManual}>
            手动填写
          </button>
          <button
            type="button"
            className="library-chip primary"
            disabled={picked.length === 0 || saving}
            onClick={() => void confirm()}
          >
            {picked.length ? `添加 ${picked.length} 项` : '添加'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
