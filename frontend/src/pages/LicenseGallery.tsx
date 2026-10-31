import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { message } from 'antd'
import { compressPhoto } from '../photoImage'
import type { LicensePhoto } from '../types'
import { FileField } from './FileField'
import { holdVehicleBackdrop } from './dispatcher/VehicleBoard'
import './dispatcher/dispatcher.css'

const photoSwipeIgnore = 'button, a, input, textarea, select, label'
const photoBlankControl = `${photoSwipeIgnore}, img, .vehicle-photo-bars, .dispatcher-filters, .dispatcher-card-lift`
const photoTapSlop = 8
const photoSwipeDistance = 48

const sides = [
  { side: 0, label: '正面' },
  { side: 1, label: '反面' },
] as const

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
  const [photoIndex, setPhotoIndex] = useState(0)
  const [large, setLarge] = useState(false)
  const [photoArmed, setPhotoArmed] = useState(false)
  const [pendingSide, setPendingSide] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const shown = sides
    .map((slot) => {
      const photo = photos.find((item) => item.side === slot.side)
      return photo ? { ...slot, photo } : null
    })
    .filter((item): item is { side: 0 | 1; label: string; photo: LicensePhoto } => item !== null)
  const viewIndex = Math.min(photoIndex, Math.max(shown.length - 1, 0))
  const current = shown[viewIndex]
  const busySide = removing ? (current?.side ?? null) : pendingSide

  useEffect(() => {
    if (!photoArmed) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('[data-photo-delete]')) {
        return
      }
      setPhotoArmed(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [photoArmed])

  useEffect(() => {
    if (!large) {
      return
    }
    let start: { x: number; y: number } | null = null
    function onPointerDown(event: PointerEvent) {
      const host = rootRef.current?.closest('.dispatcher-card, .profile-block')
      if (!(host instanceof HTMLElement)) {
        return
      }
      const box = host.getBoundingClientRect()
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
      if (!inside) {
        return
      }
      const target = event.target
      if (target instanceof Element && target.closest('.dispatcher-card, .profile-block') && target.closest(photoBlankControl)) {
        return
      }
      start = { x: event.clientX, y: event.clientY }
      holdVehicleBackdrop()
    }
    function onPointerUp(event: PointerEvent) {
      if (!start) {
        return
      }
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      start = null
      if (Math.abs(dx) < photoTapSlop && Math.abs(dy) < photoTapSlop) {
        setPhotoArmed(false)
        setLarge(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
    }
  }, [large])

  if (!canManage && shown.length === 0) {
    return null
  }

  async function pick(file: File, side: number, photoId?: string) {
    if (pendingSide !== null || removing) {
      return
    }
    setPendingSide(side)
    await new Promise((resolve) => window.setTimeout(resolve, 32))
    try {
      const compressed = await compressPhoto(file, side === 0 ? 'license-front' : 'license-back')
      if (photoId) {
        await onReplace(photoId, compressed)
      } else {
        await onUpload(side, compressed)
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传驾照失败')
    } finally {
      setPendingSide(null)
    }
  }

  function openLarge(index: number) {
    const body = rootRef.current?.closest('.dispatcher-card-body')
    if (body instanceof HTMLElement) {
      body.scrollTop = 0
    }
    setPhotoArmed(false)
    setPhotoIndex(index)
    setLarge(true)
  }

  function requestRemove() {
    if (!current || !canManage) {
      return
    }
    if (!photoArmed) {
      setPhotoArmed(true)
      return
    }
    setPhotoArmed(false)
    setRemoving(true)
    void onRemove(current.photo.id)
      .then(() => {
        if (shown.length <= 1) {
          setLarge(false)
        }
      })
      .catch((error: unknown) => {
        message.error(error instanceof Error ? error.message : '删除驾照失败')
      })
      .finally(() => setRemoving(false))
  }

  async function download(photo: LicensePhoto, label: string) {
    const response = await fetch(urlFor(photo), { credentials: 'include' })
    if (!response.ok) {
      message.error('下载照片失败')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = photo.fileName || `${label}.jpg`
    link.click()
    URL.revokeObjectURL(url)
  }

  function onLargePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    const target = event.target
    if (target instanceof Element && target.closest(photoSwipeIgnore)) {
      return
    }
    swipe.current = { x: event.clientX, y: event.clientY }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 指针已经离开时不再抓住触点。
    }
  }

  return (
    <div ref={rootRef} className="license-gallery" onPointerDown={(event) => event.stopPropagation()}>
      {caption ? <p className="license-caption">{caption}</p> : null}
      <div className="vehicle-photos two">
        {sides.map((slot) => {
          const index = shown.findIndex((item) => item.side === slot.side)
          const photo = index >= 0 ? shown[index] : null
          const spinning = busySide === slot.side
          if (!photo) {
            if (!canManage) {
              return null
            }
            if (spinning) {
              return (
                <div key={slot.side} className="vehicle-photo empty loading" aria-busy="true" aria-label={`正在上传${slot.label}`}>
                  <span className="photo-spinner" />
                </div>
              )
            }
            return (
              <FileField
                key={slot.side}
                label={slot.label}
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                className="vehicle-photo empty"
                onPick={(file) => void pick(file, slot.side)}
              />
            )
          }
          return (
            <button
              key={photo.photo.id}
              type="button"
              className={`vehicle-photo${spinning ? ' loading' : ''}`}
              aria-label={spinning ? (pendingSide === slot.side ? `正在上传${slot.label}` : `正在删除${slot.label}`) : `查看驾照${slot.label}`}
              aria-busy={spinning || undefined}
              disabled={spinning}
              onClick={() => openLarge(index)}
            >
              <img src={urlFor(photo.photo)} alt="" draggable={false} />
              {spinning ? <span className="photo-spinner" /> : null}
            </button>
          )
        })}
      </div>
      {large && current ? (
        <div className="vehicle-large" onPointerDown={onLargePointerDown} onPointerUp={(event) => {
          const start = swipe.current
          swipe.current = null
          if (!start) {
            return
          }
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (Math.abs(dx) > photoSwipeDistance && Math.abs(dx) > Math.abs(dy)) {
            setPhotoArmed(false)
            setPhotoIndex((index) => (dx > 0 ? Math.max(0, index - 1) : Math.min(shown.length - 1, index + 1)))
          }
        }} onPointerCancel={() => {
          swipe.current = null
        }}>
          <div className={`vehicle-large-stage${busySide === current.side ? ' loading' : ''}`}>
            <img src={urlFor(current.photo)} alt="" draggable={false} />
            {busySide === current.side ? <span className="photo-spinner" /> : null}
          </div>
          <div className="vehicle-photo-bars">
            {shown.map((item, index) => (
              <button
                key={item.photo.id}
                type="button"
                aria-label={item.label}
                aria-current={index === viewIndex ? 'true' : undefined}
                onClick={() => {
                  setPhotoArmed(false)
                  setPhotoIndex(index)
                }}
              />
            ))}
          </div>
          <div className="dispatcher-filters">
            <button type="button" className="dispatcher-chip" onClick={() => void download(current.photo, current.label)}>
              下载
            </button>
            {canManage ? (
              <button
                type="button"
                className={`dispatcher-chip${photoArmed ? ' release' : ''}`}
                disabled={busy || busySide !== null}
                data-photo-delete={photoArmed ? 'true' : undefined}
                aria-pressed={photoArmed}
                aria-label={photoArmed ? '确认删除照片' : '删除照片'}
                onClick={requestRemove}
              >
                删除
              </button>
            ) : null}
            {canManage ? (
              <FileField
                label="更新照片"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || busySide !== null}
                className="dispatcher-chip"
                onPick={(file) => void pick(file, current.side, current.photo.id)}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
