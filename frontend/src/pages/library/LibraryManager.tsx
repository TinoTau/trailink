import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { message } from 'antd'
import { libraryApi, ratingLabel } from '../../api/library'
import type { Destination, LibraryActivity, LibraryActivityDetail } from '../../types'
import { LibraryActivityEditor } from './LibraryActivityEditor'
import './library.css'

/**
 * 活动库管理弹框（公司账户）：搜索、按常用目的地筛选、列表，底部「添加活动」。
 * 点某一项打开编辑框；编辑框保存或删除后关闭，回到这里并刷新列表。
 */
export function LibraryManager({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [presets, setPresets] = useState<Destination[]>([])
  const [destinationId, setDestinationId] = useState<string | null>(null)
  const [list, setList] = useState<LibraryActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<LibraryActivityDetail | 'new' | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    libraryApi
      .destinations()
      .then((all) => setPresets(all.filter((item) => item.mark)))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => {
      libraryApi
        .search(query.trim() || undefined, destinationId ?? undefined)
        .then((next) => alive && setList(next))
        .catch((error: unknown) => message.error(error instanceof Error ? error.message : '读取活动库失败'))
        .finally(() => alive && setLoading(false))
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query, destinationId, reload])

  async function open(id: string) {
    try {
      setEditing(await libraryApi.detail(id))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '读取活动失败')
    }
  }

  return createPortal(
    <div
      className="library-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="library-sheet tall" role="dialog" aria-label="活动库">
        <header className="library-sheet-bar">
          <h2>活动库</h2>
          <button type="button" className="library-chip" onClick={onClose}>
            关闭
          </button>
        </header>
        <input
          className="library-search"
          value={query}
          placeholder="搜索活动（中文或英文）"
          aria-label="搜索活动库"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="library-filter" role="radiogroup" aria-label="按目的地筛选">
          <button
            type="button"
            role="radio"
            aria-checked={destinationId === null}
            className={`library-chip${destinationId === null ? ' selected' : ''}`}
            onClick={() => setDestinationId(null)}
          >
            全部
          </button>
          {presets.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={destinationId === item.id}
              className={`library-chip${destinationId === item.id ? ' selected' : ''}`}
              onClick={() => setDestinationId(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="library-list">
          {loading ? <p className="library-empty">加载中…</p> : null}
          {!loading && list.length === 0 ? (
            <p className="library-empty">{query.trim() || destinationId ? '没有找到' : '活动库还是空的，点下方「添加活动」开始'}</p>
          ) : null}
          {list.map((item) => (
            <button key={item.id} type="button" className="library-row" onClick={() => void open(item.id)}>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {[item.nameZh && item.nameEn ? item.nameEn : null, item.destinations.map((dest) => dest.name).join('、')]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
              <span className="library-rating">{ratingLabel(item)}</span>
            </button>
          ))}
        </div>
        <footer className="library-sheet-actions end">
          <button type="button" className="library-chip primary" onClick={() => setEditing('new')}>
            添加活动
          </button>
        </footer>
      </div>
      {editing ? (
        <LibraryActivityEditor
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onSaved={() => {
            setEditing(null)
            setReload((value) => value + 1)
          }}
          onDeleted={() => {
            setEditing(null)
            setReload((value) => value + 1)
          }}
          onOpenExisting={(id) => void open(id)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>,
    document.body,
  )
}
