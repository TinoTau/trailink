import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { message } from 'antd'
import { FileField } from './FileField'

// 车辆照片和驾照照片共用的大图查看：左右滑动换一张、横杠对应每一张、
// 点详情框里照片和按钮以外的空白处关闭、删除两步确认。

let backdropUntil = 0

/** 点空白处关闭大图后，吞掉紧跟着的那次点击，免得把详情框也一起关掉。 */
export function takePhotoBackdropClick() {
  if (performance.now() >= backdropUntil) {
    return false
  }
  backdropUntil = 0
  return true
}

function holdPhotoBackdrop() {
  backdropUntil = performance.now() + 500
  const stop = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    backdropUntil = 0
    document.removeEventListener('click', stop, true)
  }
  document.addEventListener('click', stop, true)
  window.setTimeout(() => document.removeEventListener('click', stop, true), 500)
}

const swipeIgnore = 'button, a, input, textarea, select, label'
const blankControl = `${swipeIgnore}, img, .vehicle-photo-bars, .dispatcher-filters, .dispatcher-card-lift`
const tapSlop = 8
const swipeDistance = 48

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

export type ViewerPhoto = {
  key: string
  src: string
  label: string
  fileName: string
}

/**
 * 大图的打开、关闭、当前第几张，以及删除的两步确认。
 * @param hostRef 详情框里任意一个元素；在它所属的 hostSelector 框内点空白处才关闭大图。
 */
export function usePhotoViewer(count: number, hostRef: RefObject<HTMLElement | null>, hostSelector: string) {
  const [index, setIndex] = useState(0)
  const [large, setLarge] = useState(false)
  const [armed, setArmed] = useState(false)
  const viewIndex = Math.min(index, Math.max(count - 1, 0))

  useEffect(() => {
    if (!armed) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest('[data-photo-delete]')) {
        return
      }
      setArmed(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [armed])

  useEffect(() => {
    if (!large) {
      return
    }
    let start: { x: number; y: number } | null = null
    function onPointerDown(event: PointerEvent) {
      const host = hostRef.current?.closest(hostSelector)
      if (!(host instanceof HTMLElement)) {
        return
      }
      const box = host.getBoundingClientRect()
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
      if (!inside || (event.target instanceof Element && event.target.closest(blankControl))) {
        return
      }
      start = { x: event.clientX, y: event.clientY }
      holdPhotoBackdrop()
    }
    function onPointerUp(event: PointerEvent) {
      if (!start) {
        return
      }
      const moved = Math.abs(event.clientX - start.x) >= tapSlop || Math.abs(event.clientY - start.y) >= tapSlop
      start = null
      if (!moved) {
        setArmed(false)
        setLarge(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
    }
  }, [hostRef, hostSelector, large])

  return {
    index: viewIndex,
    large,
    armed,
    open(next: number) {
      setArmed(false)
      setIndex(next)
      setLarge(true)
    },
    show(next: number) {
      setArmed(false)
      setIndex(next)
    },
    close() {
      setArmed(false)
      setLarge(false)
    },
    /** 第一次只套红框，第二次才执行。 */
    confirmRemove(remove: () => void) {
      if (!armed) {
        setArmed(true)
        return
      }
      setArmed(false)
      remove()
    },
  }
}

export type PhotoViewerState = ReturnType<typeof usePhotoViewer>

export function PhotoLargeView<T extends ViewerPhoto>({
  photos,
  viewer,
  busy,
  loading,
  onDownload,
  onRemove,
  onReplace,
}: {
  photos: T[]
  viewer: PhotoViewerState
  busy?: boolean
  /** 当前这一张正在上传或删除，盖一层转圈。 */
  loading?: boolean
  onDownload: (photo: T) => void
  /** 不传则不显示删除。 */
  onRemove?: (photo: T) => void
  /** 不传则不显示更新。 */
  onReplace?: (photo: T, file: File) => void
}) {
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const current = photos[viewer.index]
  if (!viewer.large || !current) {
    return null
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    if (event.target instanceof Element && event.target.closest(swipeIgnore)) {
      return
    }
    swipe.current = { x: event.clientX, y: event.clientY }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 指针已经离开时不再抓住触点。
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipe.current
    swipe.current = null
    if (!start) {
      return
    }
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) > swipeDistance && Math.abs(dx) > Math.abs(dy)) {
      viewer.show(dx > 0 ? Math.max(0, viewer.index - 1) : Math.min(photos.length - 1, viewer.index + 1))
    }
  }

  return (
    <div
      className="vehicle-large"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipe.current = null
      }}
    >
      <div className={`vehicle-large-stage${loading ? ' loading' : ''}`}>
        <img src={current.src} alt="" draggable={false} />
        {loading ? <span className="photo-spinner" /> : null}
      </div>
      <div className="vehicle-photo-bars">
        {photos.map((photo, index) => (
          <button
            key={photo.key}
            type="button"
            aria-label={photo.label}
            aria-current={index === viewer.index ? 'true' : undefined}
            onClick={() => viewer.show(index)}
          />
        ))}
      </div>
      <div className="dispatcher-filters">
        <button type="button" className="dispatcher-chip" onClick={() => onDownload(current)}>
          下载
        </button>
        {onRemove ? (
          <button
            type="button"
            className={`dispatcher-chip${viewer.armed ? ' release' : ''}`}
            disabled={busy}
            data-photo-delete={viewer.armed ? 'true' : undefined}
            aria-pressed={viewer.armed}
            aria-label={viewer.armed ? '确认删除照片' : '删除照片'}
            onClick={() => viewer.confirmRemove(() => onRemove(current))}
          >
            删除
          </button>
        ) : null}
        {onReplace ? (
          <FileField
            label="更新照片"
            accept={PHOTO_ACCEPT}
            disabled={busy}
            className="dispatcher-chip"
            onPick={(file) => onReplace(current, file)}
          />
        ) : null}
      </div>
    </div>
  )
}

/** 下载：已上传的照片要带登录 Cookie 取回再存；页面里还没上传的照片直接存。 */
export async function downloadPhoto(src: string, fileName: string) {
  let href = src
  let revoke = false
  if (!src.startsWith('blob:')) {
    const response = await fetch(src, { credentials: 'include' })
    if (!response.ok) {
      message.error('下载照片失败')
      return
    }
    href = URL.createObjectURL(await response.blob())
    revoke = true
  }
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  link.click()
  if (revoke) {
    URL.revokeObjectURL(href)
  }
}
