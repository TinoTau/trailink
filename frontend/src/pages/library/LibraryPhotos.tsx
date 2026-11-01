import { useRef, useState } from 'react'
import { message } from 'antd'
import { libraryApi } from '../../api/library'
import { compressPhoto } from '../../photoImage'
import type { LibraryActivityDetail } from '../../types'
import { FileField } from '../FileField'
import { downloadPhoto, PHOTO_ACCEPT, PhotoLargeView, usePhotoViewer, type ViewerPhoto } from '../PhotoViewer'
import '../dispatcher/dispatcher.css'

type Shown = ViewerPhoto & { photoId: string }

/** 活动图片：最多 3 张，和车辆照片一样压缩后上传，点开看大图、左右滑动、两步删除、更新、下载。 */
export function LibraryPhotos({
  activity,
  onChanged,
}: {
  activity: LibraryActivityDetail
  onChanged: (next: LibraryActivityDetail) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const shown: Shown[] = activity.photos.map((photo, index) => ({
    key: photo.id,
    photoId: photo.id,
    src: libraryApi.photoUrl(activity.id, photo.id),
    label: `第 ${index + 1} 张`,
    fileName: photo.fileName || 'activity.jpg',
  }))
  const viewer = usePhotoViewer(shown.length, rootRef, '.library-sheet')

  async function run(work: () => Promise<LibraryActivityDetail | void>) {
    setBusy(true)
    try {
      const next = await work()
      onChanged(next ?? (await libraryApi.detail(activity.id)))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '图片保存失败')
    } finally {
      setBusy(false)
    }
  }

  function upload(file: File, replaceId?: string) {
    void run(async () => {
      const prepared = await compressPhoto(file, 'activity')
      return replaceId
        ? libraryApi.replacePhoto(activity.id, replaceId, prepared)
        : libraryApi.uploadPhoto(activity.id, prepared)
    })
  }

  return (
    <div ref={rootRef}>
      <div className="vehicle-photos">
        {[0, 1, 2].map((index) => {
          const photo = shown[index]
          if (!photo) {
            return index === shown.length ? (
              <FileField
                key={`empty-${index}`}
                label={busy ? '上传中…' : '添加图片'}
                accept={PHOTO_ACCEPT}
                disabled={busy}
                className="vehicle-photo empty"
                onPick={(file) => upload(file)}
              />
            ) : (
              <div key={`empty-${index}`} className="vehicle-photo empty" aria-hidden />
            )
          }
          return (
            <button key={photo.key} type="button" className="vehicle-photo" aria-label={`查看${photo.label}`} onClick={() => viewer.open(index)}>
              <img src={photo.src} alt="" draggable={false} />
            </button>
          )
        })}
      </div>
      <PhotoLargeView
        photos={shown}
        viewer={viewer}
        busy={busy}
        loading={busy}
        onDownload={(photo) => void downloadPhoto(photo.src, photo.fileName)}
        onRemove={(photo) =>
          void run(async () => {
            await libraryApi.removePhoto(activity.id, photo.photoId)
            if (shown.length <= 1) {
              viewer.close()
            }
          })
        }
        onReplace={(photo, file) => upload(file, photo.photoId)}
      />
    </div>
  )
}
