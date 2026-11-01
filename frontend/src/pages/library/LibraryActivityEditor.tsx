import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { message } from 'antd'
import { libraryApi, ratingLabel } from '../../api/library'
import type { Destination, LibraryActivity, LibraryActivityDetail } from '../../types'
import { compressPhoto } from '../../photoImage'
import { FileField } from '../FileField'
import { PHOTO_ACCEPT } from '../PhotoViewer'
import { LibraryPhotos } from './LibraryPhotos'
import './library.css'

const HAS_CJK = /[㐀-鿿]/

/** 输入时延迟一下再搜，避免每敲一个字就请求。 */
function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/**
 * 公司账户添加、编辑活动库里的一项活动（住宿酒店也算）。
 * <ul>
 * <li>输入中文名或英文名时先模糊搜索活动库，提示可能已经存在的活动，可以直接去编辑它。</li>
 * <li>至少绑定一个目的地；搜不到的目的地可以新建（中英文名至少一个），之后大家都能搜到。</li>
 * <li>新建时可以先选好图片（最多 3 张），保存时一起上传；已有活动的图片即时保存，管理方式和车辆照片一样。</li>
 * <li>点「保存」或「添加到活动库」成功后关闭编辑框。</li>
 * </ul>
 */
export function LibraryActivityEditor({
  initial,
  onSaved,
  onDeleted,
  onOpenExisting,
  onClose,
}: {
  initial: LibraryActivityDetail | null
  onSaved: (activity: LibraryActivityDetail) => void
  onDeleted: (id: string) => void
  onOpenExisting: (id: string) => void
  onClose: () => void
}) {
  const [saved, setSaved] = useState(initial)
  const [nameZh, setNameZh] = useState(initial?.nameZh ?? '')
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? '')
  const [notes, setNotes] = useState(initial?.sharedNotes ?? '')
  const [destinations, setDestinations] = useState<Destination[]>(initial?.destinations ?? [])
  const [destQuery, setDestQuery] = useState('')
  const [destResults, setDestResults] = useState<Destination[]>([])
  const [newDest, setNewDest] = useState<{ zh: string; en: string } | null>(null)
  const [similar, setSimilar] = useState<LibraryActivity[]>([])
  const [busy, setBusy] = useState(false)
  const [armedDelete, setArmedDelete] = useState(false)
  const [pending, setPending] = useState<{ key: string; file: File; url: string }[]>([])
  const zhQuery = useDebounced(nameZh.trim())
  const enQuery = useDebounced(nameEn.trim())
  const destSearch = useDebounced(destQuery.trim())

  useEffect(() => {
    const queries = [zhQuery, enQuery].filter(Boolean)
    if (queries.length === 0) {
      // oxlint-disable-next-line react/set-state-in-effect
      setSimilar([])
      return
    }
    let alive = true
    Promise.all(queries.map((q) => libraryApi.search(q)))
      .then((lists) => {
        if (!alive) {
          return
        }
        const seen = new Map<string, LibraryActivity>()
        for (const item of lists.flat()) {
          if (item.id !== saved?.id) {
            seen.set(item.id, item)
          }
        }
        setSimilar([...seen.values()].slice(0, 5))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [zhQuery, enQuery, saved?.id])

  useEffect(() => {
    let alive = true
    libraryApi
      .destinations(destSearch || undefined)
      .then((list) => alive && setDestResults(list))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [destSearch])

  const chosen = new Set(destinations.map((item) => item.id))
  const destOptions = (destSearch ? destResults : destResults.filter((item) => item.mark)).filter((item) => !chosen.has(item.id))
  const exactDest = destResults.some((item) =>
    [item.nameZh, item.nameEn, item.mark].some((name) => name && name.toLowerCase() === destSearch.toLowerCase()),
  )

  function addDestination(destination: Destination) {
    setDestinations((current) => (current.some((item) => item.id === destination.id) ? current : [...current, destination]))
    setDestQuery('')
    setNewDest(null)
  }

  async function createDestination() {
    if (!newDest) {
      return
    }
    setBusy(true)
    try {
      addDestination(await libraryApi.createDestination(newDest.zh.trim() || null, newDest.en.trim() || null))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '新建目的地失败')
    } finally {
      setBusy(false)
    }
  }

  const pendingRef = useRef(pending)
  useEffect(() => {
    pendingRef.current = pending
  })
  // 关闭编辑框时释放还没上传的图片预览。
  useEffect(() => () => pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url)), [])

  async function addPending(file: File) {
    setBusy(true)
    try {
      const prepared = await compressPhoto(file, 'activity')
      setPending((current) => [...current, { key: `${Date.now()}-${current.length}`, file: prepared, url: URL.createObjectURL(prepared) }])
    } catch (error) {
      message.error(error instanceof Error ? error.message : '图片处理失败')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    let next: LibraryActivityDetail | null = null
    try {
      const body = {
        nameZh: nameZh.trim() || null,
        nameEn: nameEn.trim() || null,
        sharedNotes: notes.trim() || null,
        destinationIds: destinations.map((item) => item.id),
      }
      next = saved ? await libraryApi.update(saved.id, body) : await libraryApi.create(body)
      for (const item of saved ? [] : pending) {
        next = await libraryApi.uploadPhoto(next.id, item.file)
      }
      message.success(saved ? '活动已保存' : '活动已添加')
      onSaved(next)
    } catch (error) {
      if (next && !saved) {
        // 活动已经建好，只是图片没传完：留在编辑框里，转成编辑已有活动，可以重新加图片。
        setSaved(next)
        setPending([])
        message.error('活动已添加，但有图片没有上传成功，请在这里重新添加')
      } else {
        message.error(error instanceof Error ? error.message : '保存活动失败')
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!saved) {
      return
    }
    if (!armedDelete) {
      setArmedDelete(true)
      return
    }
    setBusy(true)
    try {
      await libraryApi.remove(saved.id)
      onDeleted(saved.id)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除活动失败')
      setBusy(false)
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
      <div className="library-sheet" role="dialog" aria-label={saved ? '编辑活动' : '添加活动'}>
        <header className="library-sheet-bar">
          <h2>{saved ? `编辑：${saved.name}` : '添加活动'}</h2>
          <button type="button" className="library-chip" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="library-list">
          <div className="library-inline">
            <label className="library-field">
              中文名
              <input value={nameZh} maxLength={100} placeholder="如：库克山直升机" onChange={(event) => setNameZh(event.target.value)} />
            </label>
            <label className="library-field">
              英文名
              <input value={nameEn} maxLength={150} placeholder="如：Mt Cook Heli" onChange={(event) => setNameEn(event.target.value)} />
            </label>
          </div>
          {similar.length ? (
            <div className="library-suggest">
              活动库里可能已经有：
              {similar.map((item) => (
                <button key={item.id} type="button" onClick={() => onOpenExisting(item.id)}>
                  {item.name}
                  {item.nameZh && item.nameEn ? ` / ${item.nameEn}` : ''}（{item.destinations.map((dest) => dest.name).join('、')}）→ 去编辑
                </button>
              ))}
            </div>
          ) : null}

          <div className="library-field">
            绑定目的地
            <div className="library-tags">
              {destinations.length === 0 ? <span className="library-hint">还没有绑定</span> : null}
              {destinations.map((item) => (
                <span key={item.id} className="library-tag">
                  {item.name}
                  <button
                    type="button"
                    aria-label={`移除${item.name}`}
                    onClick={() => setDestinations((current) => current.filter((dest) => dest.id !== item.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              className="library-search"
              value={destQuery}
              placeholder="搜索目的地（中文或英文）"
              onChange={(event) => {
                setDestQuery(event.target.value)
                setNewDest(null)
              }}
            />
            <div className="library-tags">
              {destOptions.map((item) => (
                <button key={item.id} type="button" className="library-chip" onClick={() => addDestination(item)}>
                  + {item.name}
                </button>
              ))}
            </div>
            {destSearch && !exactDest ? (
              newDest ? (
                <div className="library-suggest">
                  新建目的地（中英文名至少填一个）
                  <div className="library-inline">
                    <input value={newDest.zh} placeholder="中文名" onChange={(event) => setNewDest({ ...newDest, zh: event.target.value })} />
                    <input value={newDest.en} placeholder="英文名" onChange={(event) => setNewDest({ ...newDest, en: event.target.value })} />
                  </div>
                  <button type="button" disabled={busy || !(newDest.zh.trim() || newDest.en.trim())} onClick={() => void createDestination()}>
                    新建并绑定
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="library-dest-result"
                  onClick={() => setNewDest(HAS_CJK.test(destSearch) ? { zh: destSearch, en: '' } : { zh: '', en: destSearch })}
                >
                  没有「{destSearch}」？新建这个目的地
                </button>
              )
            ) : null}
          </div>

          <label className="library-field">
            共用备注
            <textarea value={notes} placeholder="所有人可见，如预订方式、注意事项" onChange={(event) => setNotes(event.target.value)} />
          </label>

          {saved ? (
            <div className="library-field">
              图片{saved.ratingCount ? ` · 评分 ${ratingLabel(saved)}` : ''}
              <LibraryPhotos activity={saved} onChanged={setSaved} />
            </div>
          ) : (
            <div className="library-field">
              图片（最多 3 张，保存时一起上传）
              <div className="vehicle-photos">
                {pending.map((item) => (
                  <div key={item.key} className="vehicle-photo library-pending">
                    <img src={item.url} alt="" draggable={false} />
                    <button
                      type="button"
                      aria-label="移除这张图片"
                      onClick={() => setPending((current) => current.filter((photo) => photo.key !== item.key))}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {pending.length < 3 ? (
                  <FileField
                    label={busy ? '处理中…' : '添加图片'}
                    accept={PHOTO_ACCEPT}
                    disabled={busy}
                    className="vehicle-photo empty"
                    onPick={(file) => void addPending(file)}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
        <footer className="library-sheet-actions">
          {saved ? (
            <button type="button" className={`library-chip danger${armedDelete ? ' armed' : ''}`} disabled={busy} onClick={() => void remove()}>
              {armedDelete ? '确认删除' : '删除活动'}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="library-chip primary" disabled={busy} onClick={() => void save()}>
            {saved ? '保存' : '添加到活动库'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
