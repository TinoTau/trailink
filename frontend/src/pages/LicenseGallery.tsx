import { useRef, useState } from 'react'
import { message } from 'antd'
import { compressPhoto } from '../photoImage'
import type { LicensePhoto } from '../types'
import { FileField } from './FileField'
import { downloadPhoto, PHOTO_ACCEPT, PhotoLargeView, usePhotoViewer, type ViewerPhoto } from './PhotoViewer'
import './dispatcher/dispatcher.css'

const SIDES = [
  { side: 0, label: '正面', fallback: 'license-front' },
  { side: 1, label: '反面', fallback: 'license-back' },
] as const

type ShownLicense = ViewerPhoto & { side: number; photo: LicensePhoto }

/** 驾照正反面：本人可上传、更新、删除；已批准他的调度员和公司只能查看和下载。 */
export function LicenseGallery({
  photos,
  urlFor,
  canManage,
  busy,
  caption,
  onUpload,
  onReplace,
  onRemove,
}: {
  photos: LicensePhoto[]
  urlFor: (photo: LicensePhoto) => string
  canManage: boolean
  busy?: boolean
  caption?: string
  onUpload: (side: number, file: File) => Promise<void>
  onReplace: (photoId: string, file: File) => Promise<void>
  onRemove: (photoId: string) => Promise<void>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [pendingSide, setPendingSide] = useState<number | null>(null)
  const [removingSide, setRemovingSide] = useState<number | null>(null)
  const shown: ShownLicense[] = SIDES.flatMap((slot) => {
    const photo = photos.find((item) => item.side === slot.side)
    return photo
      ? [{ key: photo.id, src: urlFor(photo), label: slot.label, fileName: photo.fileName || `${slot.label}.jpg`, side: slot.side, photo }]
      : []
  })
  const viewer = usePhotoViewer(shown.length, rootRef, '.dispatcher-card, .profile-block')
  const busySide = removingSide ?? pendingSide

  if (!canManage && shown.length === 0) {
    return null
  }

  async function pick(file: File, side: number, photoId?: string) {
    if (busySide !== null) {
      return
    }
    setPendingSide(side)
    try {
      const compressed = await compressPhoto(file, SIDES[side].fallback)
      await (photoId ? onReplace(photoId, compressed) : onUpload(side, compressed))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传驾照失败')
    } finally {
      setPendingSide(null)
    }
  }

  async function remove(item: ShownLicense) {
    setRemovingSide(item.side)
    try {
      await onRemove(item.photo.id)
      if (shown.length <= 1) {
        viewer.close()
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除驾照失败')
    } finally {
      setRemovingSide(null)
    }
  }

  function openLarge(index: number) {
    const body = rootRef.current?.closest('.dispatcher-card-body')
    if (body instanceof HTMLElement) {
      body.scrollTop = 0
    }
    viewer.open(index)
  }

  const current = shown[viewer.index]
  return (
    <div ref={rootRef} className="license-gallery" onPointerDown={(event) => event.stopPropagation()}>
      {caption ? <p className="license-caption">{caption}</p> : null}
      <div className="vehicle-photos two">
        {SIDES.map((slot) => {
          const index = shown.findIndex((item) => item.side === slot.side)
          const item = shown[index]
          const spinning = busySide === slot.side
          if (!item) {
            if (!canManage) {
              return null
            }
            return spinning ? (
              <div key={slot.side} className="vehicle-photo empty loading" aria-busy="true" aria-label={`正在上传${slot.label}`}>
                <span className="photo-spinner" />
              </div>
            ) : (
              <FileField
                key={slot.side}
                label={slot.label}
                accept={PHOTO_ACCEPT}
                disabled={busy}
                className="vehicle-photo empty"
                onPick={(file) => void pick(file, slot.side)}
              />
            )
          }
          return (
            <button
              key={item.key}
              type="button"
              className={`vehicle-photo${spinning ? ' loading' : ''}`}
              aria-label={spinning ? (pendingSide === slot.side ? `正在上传${slot.label}` : `正在删除${slot.label}`) : `查看驾照${slot.label}`}
              aria-busy={spinning || undefined}
              disabled={spinning}
              onClick={() => openLarge(index)}
            >
              <img src={item.src} alt="" draggable={false} />
              {spinning ? <span className="photo-spinner" /> : null}
            </button>
          )
        })}
      </div>
      <PhotoLargeView
        photos={shown}
        viewer={viewer}
        busy={busy || busySide !== null}
        loading={current !== undefined && busySide === current.side}
        onDownload={(item) => void downloadPhoto(item.src, item.fileName)}
        onRemove={canManage ? (item) => void remove(item) : undefined}
        onReplace={canManage ? (item, file) => void pick(file, item.side, item.photo.id) : undefined}
      />
    </div>
  )
}
