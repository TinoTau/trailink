import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react'
import { message } from 'antd'
import { vehiclesApi } from '../../api/vehicles'
import { compressPhoto } from '../../photoImage'
import type { Vehicle } from '../../types'
import { FileField } from '../FileField'
import { PinIcon } from '../icons'
import { downloadPhoto, PHOTO_ACCEPT, PhotoLargeView, usePhotoViewer, type ViewerPhoto } from '../PhotoViewer'
import { OrderInfoFields } from '../OrderInfoFields'
import { DispatcherCalendarCard, DispatcherDayCard, type CalendarMark } from './DispatcherCalendarCard'
import { paneLiftLimit, startPaneLift } from './paneLift'

type PendingPhoto = {
  id: string
  file: File
  url: string
}

type ShownPhoto = ViewerPhoto & {
  photoId?: string
  pendingId?: string
}

function photoKey() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function VehicleBoard({
  vehicles,
  pinnedIds,
  selectedId,
  adding,
  dragId,
  hoverId,
  busy,
  calendarMarks,
  calendarRangeStart,
  calendarRangeEnd,
  calendarBodyRef,
  onCalendarDayClick,
  onSelect,
  onAddingChange,
  onPin,
  onPointerDown,
  onUpsert,
  onRemoved,
}: {
  vehicles: Vehicle[]
  pinnedIds: string[]
  selectedId: string | null
  adding: boolean
  dragId: string | null
  hoverId: string | null
  busy: boolean
  calendarMarks: CalendarMark[]
  calendarRangeStart: string
  calendarRangeEnd: string
  calendarBodyRef?: Ref<HTMLDivElement>
  onCalendarDayClick?: (mark: CalendarMark, anchor: HTMLButtonElement) => void
  onSelect: (id: string | null) => void
  onAddingChange: (adding: boolean) => void
  onPin: (id: string) => void
  onPointerDown: (event: ReactPointerEvent, id: string) => void
  onUpsert: (vehicle: Vehicle) => void
  onRemoved: (id: string) => void
}) {
  const selected = vehicles.find((item) => item.id === selectedId) ?? null
  const open = adding || Boolean(selected)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState(0)
  const [liftDragging, setLiftDragging] = useState(false)
  const liftRef = useRef(0)
  const contentLiftRef = useRef(0)
  const fittedKey = useRef('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [calendarArmed, setCalendarArmed] = useState(false)
  const showDetail = !selected || detailOpen

  const commitLift = useCallback((next: number) => {
    liftRef.current = next
    setLift(next)
    setLiftDragging(false)
  }, [])

  const measureContentLift = useCallback(() => {
    const overlay = overlayRef.current
    const card = overlay?.querySelector('.dispatcher-card')
    const pane = overlay?.closest('.dispatcher-pane')
    const driverPane = document.querySelector('[data-driver-pane]')
    if (!(overlay instanceof HTMLElement) || !(card instanceof HTMLElement) || !(pane instanceof HTMLElement) || !(driverPane instanceof HTMLElement)) {
      return null
    }
    const head = card.querySelector(':scope > .dispatcher-card-head')
    const body = card.querySelector(':scope > .dispatcher-card-body')
    const foot = card.querySelector(':scope > .dispatcher-card-lift')
    if (!(head instanceof HTMLElement) || !(body instanceof HTMLElement) || !(foot instanceof HTMLElement)) {
      return null
    }
    const flow = [...body.children].filter((child): child is HTMLElement => child instanceof HTMLElement && !child.classList.contains('vehicle-large'))
    const bodyStyle = getComputedStyle(body)
    const footStyle = getComputedStyle(foot)
    const cardStyle = getComputedStyle(card)
    const firstStyle = flow[0] ? getComputedStyle(flow[0]) : null
    const lastStyle = flow.length > 0 ? getComputedStyle(flow[flow.length - 1]) : null
    const inner = flow.length > 0
      ? flow[flow.length - 1].getBoundingClientRect().bottom - flow[0].getBoundingClientRect().top + parseFloat(firstStyle?.marginTop ?? '0') + parseFloat(lastStyle?.marginBottom ?? '0')
      : 0
    const cardHeight =
      head.offsetHeight +
      inner +
      parseFloat(bodyStyle.paddingTop) +
      parseFloat(bodyStyle.paddingBottom) +
      foot.offsetHeight +
      parseFloat(footStyle.marginTop) +
      parseFloat(footStyle.marginBottom) +
      parseFloat(cardStyle.borderTopWidth) +
      parseFloat(cardStyle.borderBottomWidth)
    const pad = parseFloat(getComputedStyle(overlay).paddingTop) + parseFloat(getComputedStyle(overlay).paddingBottom)
    return cardHeight + pad - pane.getBoundingClientRect().height
  }, [])

  useEffect(() => {
    if (open) {
      return
    }
    liftRef.current = 0
    contentLiftRef.current = 0
    fittedKey.current = ''
    setLift(0)
    setLiftDragging(false)
  }, [open])

  const applyContentLift = useCallback((need: number) => {
    contentLiftRef.current = need
    const driverPane = document.querySelector('[data-driver-pane]')
    const max = driverPane instanceof HTMLElement ? paneLiftLimit(driverPane) : need
    commitLift(Math.min(max, need))
  }, [commitLift])

  useLayoutEffect(() => {
    if (!open || !showDetail) {
      if (liftRef.current !== 0) {
        fittedKey.current = ''
        commitLift(0)
      }
      return
    }
    const key = selected?.id ?? 'new'
    if (fittedKey.current === key) {
      return
    }
    const next = measureContentLift()
    if (next == null) {
      return
    }
    fittedKey.current = key
    applyContentLift(next)
  }, [open, showDetail, selected?.id, measureContentLift, applyContentLift, commitLift])

  useEffect(() => {
    setDetailOpen(false)
    setCalendarArmed(false)
  }, [selected?.id, adding])

  useEffect(() => {
    if (!calendarArmed) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('[data-vehicle-delete]')) {
        return
      }
      setCalendarArmed(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [calendarArmed])

  async function deleteFromCalendar() {
    if (!selected) {
      return
    }
    if (!calendarArmed) {
      setCalendarArmed(true)
      return
    }
    try {
      await vehiclesApi.remove(selected.id)
      onRemoved(selected.id)
      onSelect(null)
      onAddingChange(false)
      message.success('车辆已删除')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除车辆失败')
    }
  }

  const fitVehicleLift = useCallback(() => {
    if (!overlayRef.current) {
      return
    }
    const next = measureContentLift()
    if (next == null) {
      commitLift(0)
      return
    }
    applyContentLift(next)
  }, [applyContentLift, commitLift, measureContentLift])

  const expandVehicleLift = useCallback(() => {
    const overlay = overlayRef.current
    const pane = overlay?.closest('.dispatcher-pane')
    const page = overlay?.closest('.dispatcher-page')
    const driverPane = document.querySelector('[data-driver-pane]')
    if (pane instanceof HTMLElement && page instanceof HTMLElement) {
      commitLift(Math.max(0, page.getBoundingClientRect().bottom - pane.getBoundingClientRect().bottom))
      return
    }
    if (driverPane instanceof HTMLElement) {
      commitLift(paneLiftLimit(driverPane))
    }
  }, [commitLift])

  function beginVehicleLift(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target
    if (target instanceof Element && target.closest('button, a, input, textarea, select, label')) {
      return
    }
    const overlay = overlayRef.current
    const pane = overlay?.closest('.dispatcher-pane')
    const driverPane = document.querySelector('[data-driver-pane]')
    if (!(overlay instanceof HTMLElement) || !(pane instanceof HTMLElement) || !(driverPane instanceof HTMLElement)) {
      return
    }
    startPaneLift(event, {
      direction: 'down',
      overlay,
      pane,
      maxPane: driverPane,
      settling: false,
      current: liftRef.current,
      minLift: Math.min(0, contentLiftRef.current),
      onChange: (value) => {
        liftRef.current = value
        setLift(value)
      },
      onDragging: setLiftDragging,
    })
  }

  return (
    <>
      <div className="dispatcher-grid">
        {vehicles.length === 0 ? <p className="dispatcher-empty">暂无车辆</p> : null}
        {vehicles.map((vehicle) => {
          const pinned = pinnedIds.includes(vehicle.id)
          const photo = vehicle.photos[0]
          return (
            <div
              key={vehicle.id}
              data-vehicle-id={vehicle.id}
              className={`dispatcher-driver${hoverId === vehicle.id && dragId && dragId !== vehicle.id ? ' drop' : ''}${pinned ? ' pinned' : ''}${dragId === vehicle.id ? ' dragging' : ''}${selectedId === vehicle.id ? ' open' : ''}`}
            >
              <div className="dispatcher-corner">
                <button
                  type="button"
                  className={`dispatcher-icon-btn${pinned ? ' active' : ''}`}
                  aria-label={pinned ? '取消置顶' : '置顶'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onPin(vehicle.id)}
                >
                  <PinIcon filled={pinned} />
                </button>
              </div>
              <button
                type="button"
                className="dispatcher-avatar"
                aria-label={vehicle.plate}
                title={vehicle.plate}
                onPointerDown={(event) => onPointerDown(event, vehicle.id)}
              >
                <b>
                  {photo ? (
                    <img src={vehiclesApi.photoUrl(vehicle.id, photo.id)} alt="" draggable={false} />
                  ) : (
                    vehicle.plate.slice(0, 1)
                  )}
                </b>
                <span>{vehicle.plate}</span>
              </button>
            </div>
          )
        })}
      </div>
      {open ? (
        <div
          ref={overlayRef}
          className={`dispatcher-overlay${showDetail ? ` liftable vehicle-lift${liftDragging ? ' dragging' : ''}` : ''}`}
          style={
            showDetail
              ? {
                  height: `calc(100% + ${lift}px)`,
                  zIndex: lift > 0 || liftDragging ? 8 : undefined,
                }
              : undefined
          }
        >
          {showDetail ? (
            <VehicleDetail
              vehicle={selected}
              busy={busy}
              onHeadPointerDown={beginVehicleLift}
              onOpenPhoto={expandVehicleLift}
              onClosePhoto={fitVehicleLift}
              onClose={() => {
                if (selected) {
                  setDetailOpen(false)
                  return
                }
                onSelect(null)
                onAddingChange(false)
              }}
              onUpsert={(vehicle) => {
                onUpsert(vehicle)
                onAddingChange(false)
                onSelect(vehicle.id)
                setDetailOpen(false)
              }}
              onRemoved={() => {
                if (selected) {
                  onRemoved(selected.id)
                }
                onSelect(null)
                onAddingChange(false)
              }}
            />
          ) : (
            <DispatcherCalendarCard
              title={selected?.plate || '车辆'}
              subtitle={calendarMarks.length > 0 ? `${calendarMarks.length} 天已绑定` : '还没有绑定订单'}
              marks={calendarMarks}
              rangeStart={calendarRangeStart}
              rangeEnd={calendarRangeEnd}
              bodyRef={calendarBodyRef}
              bodyKey="vehicle"
              dayClicks
              onDayClick={onCalendarDayClick}
              editLabel="编辑车辆"
              onEdit={() => setDetailOpen(true)}
              onRemove={() => void deleteFromCalendar()}
              removeLabel="删除车辆"
              removeArmed={calendarArmed}
              onFramePointerDown={(event) => {
                if (selected) {
                  onPointerDown(event, selected.id)
                }
              }}
              onClose={() => {
                onSelect(null)
                onAddingChange(false)
              }}
            />
          )}
        </div>
      ) : null}
    </>
  )
}

function VehicleDetail({
  vehicle,
  busy,
  onClose,
  onUpsert,
  onRemoved,
  onHeadPointerDown,
  onOpenPhoto,
  onClosePhoto,
}: {
  vehicle: Vehicle | null
  busy: boolean
  onClose: () => void
  onUpsert: (vehicle: Vehicle) => void
  onRemoved: () => void
  onHeadPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onOpenPhoto: () => void
  onClosePhoto: () => void
}) {
  const [plate, setPlate] = useState(vehicle?.plate ?? '')
  const [sharedNotes, setSharedNotes] = useState(vehicle?.sharedNotes ?? '')
  const [info, setInfo] = useState(vehicle?.info ?? '')
  const [available, setAvailable] = useState(vehicle?.available ?? true)
  const [editing, setEditing] = useState(vehicle == null)
  const [armed, setArmed] = useState(false)
  const [stopArmed, setStopArmed] = useState(false)
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const photosRef = useRef<HTMLDivElement>(null)
  const largeWas = useRef(false)

  const photos = vehicle?.photos ?? []
  const shown: ShownPhoto[] = (vehicle
    ? photos.map((photo) => ({
        key: photo.id,
        src: vehiclesApi.photoUrl(vehicle.id, photo.id),
        label: '',
        fileName: photo.fileName || 'vehicle.jpg',
        photoId: photo.id,
      }))
    : pending.map((photo) => ({
        key: photo.id,
        src: photo.url,
        label: '',
        fileName: photo.file.name || 'vehicle.jpg',
        pendingId: photo.id,
      }))
  ).map((photo, index) => ({ ...photo, label: `第 ${index + 1} 张` }))
  const viewer = usePhotoViewer(shown.length, photosRef, '.dispatcher-overlay')
  const large = viewer.large

  useLayoutEffect(() => {
    if (!largeWas.current || large) {
      largeWas.current = large
      return
    }
    largeWas.current = large
    // 先让这次点击落在还没缩回去的详情框上，再收回高度。
    const timer = window.setTimeout(() => onClosePhoto(), 0)
    return () => window.clearTimeout(timer)
  }, [large, onClosePhoto])


  useEffect(() => {
    setPlate(vehicle?.plate ?? '')
    setSharedNotes(vehicle?.sharedNotes ?? '')
    setInfo(vehicle?.info ?? '')
    setAvailable(vehicle?.available ?? true)
    setEditing(vehicle == null)
    setArmed(false)
    setStopArmed(false)
    viewer.close()
    setPending((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url))
      return []
    })
  }, [vehicle?.id])

  useEffect(() => {
    if (!armed) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('[data-vehicle-delete]')) {
        return
      }
      setArmed(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [armed])

  useEffect(() => {
    if (!stopArmed) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('[data-vehicle-stop]')) {
        return
      }
      setStopArmed(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [stopArmed])

  async function save() {
    const body = { plate: plate.trim(), sharedNotes, info, available }
    if (!body.plate) {
      message.warning('请填写车牌号')
      return
    }
    let saved: Vehicle | null = vehicle
    try {
      saved = vehicle ? await vehiclesApi.update(vehicle.id, body) : await vehiclesApi.create(body)
      if (!vehicle) {
        for (const item of pending) {
          saved = await vehiclesApi.uploadPhoto(saved.id, item.file)
        }
      }
      onUpsert(saved)
      setEditing(false)
      message.success(vehicle ? '车辆已保存' : '已添加车辆')
    } catch (error) {
      if (!vehicle && saved && saved !== vehicle) {
        onUpsert(saved)
      }
      message.error(error instanceof Error ? error.message : '保存车辆失败')
    }
  }

  function requestAvailable(next: boolean) {
    if (next) {
      setStopArmed(false)
      void chooseAvailable(true)
      return
    }
    if (!stopArmed) {
      setStopArmed(true)
      return
    }
    setStopArmed(false)
    void chooseAvailable(false)
  }

  async function chooseAvailable(next: boolean) {
    setAvailable(next)
    if (!vehicle || next === vehicle.available) {
      return
    }
    const body = { plate: plate.trim() || vehicle.plate, sharedNotes, info, available: next }
    try {
      onUpsert(await vehiclesApi.update(vehicle.id, body))
      message.success(next ? '已设为可用' : '已停用')
    } catch (error) {
      setAvailable(vehicle.available)
      message.error(error instanceof Error ? error.message : '无法更改车辆状态')
    }
  }

  function rememberPhoto(file: File, replacePendingId?: string) {
    if (file.type && !file.type.startsWith('image/')) {
      message.warning('请选择 jpg、png 或 webp')
      return
    }
    if (replacePendingId) {
      const url = URL.createObjectURL(file)
      setPending((current) =>
        current.map((item) => {
          if (item.id !== replacePendingId) {
            return item
          }
          URL.revokeObjectURL(item.url)
          return { ...item, file, url }
        }),
      )
      return
    }
    if (pending.length >= 3) {
      message.warning('一辆车最多三张照片')
      return
    }
    setPending((current) => [...current, { id: photoKey(), file, url: URL.createObjectURL(file) }])
  }

  function dropPending(pendingId: string) {
    setPending((current) => {
      const target = current.find((item) => item.id === pendingId)
      if (target) {
        URL.revokeObjectURL(target.url)
      }
      return current.filter((item) => item.id !== pendingId)
    })
    viewer.close()
  }

  async function upload(file: File, replaceId?: string) {
    let prepared: File
    try {
      prepared = await compressPhoto(file, 'vehicle')
    } catch (error) {
      message.warning(error instanceof Error ? error.message : '无法压缩照片')
      return
    }
    if (!vehicle) {
      rememberPhoto(prepared, replaceId)
      return
    }
    try {
      const saved = replaceId
        ? await vehiclesApi.replacePhoto(vehicle.id, replaceId, prepared)
        : await vehiclesApi.uploadPhoto(vehicle.id, prepared)
      onUpsert(saved)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传照片失败')
    }
  }

  async function removePhoto(photoId: string) {
    if (!vehicle) {
      return
    }
    try {
      await vehiclesApi.removePhoto(vehicle.id, photoId)
      onUpsert({ ...vehicle, photos: vehicle.photos.filter((item) => item.id !== photoId) })
      viewer.close()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除照片失败')
    }
  }

  function removeShown(photo: ShownPhoto) {
    if (photo.photoId) {
      void removePhoto(photo.photoId)
    } else if (photo.pendingId) {
      dropPending(photo.pendingId)
    }
  }

  async function confirmDelete() {
    if (!vehicle) {
      return
    }
    if (!armed) {
      setArmed(true)
      return
    }
    try {
      await vehiclesApi.remove(vehicle.id)
      onRemoved()
      message.success('车辆已删除')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除车辆失败')
    }
  }

  return (
    <DispatcherDayCard
      title={vehicle?.plate || '添加车辆'}
      subtitle={vehicle ? (available ? '可用' : '停用') : '填写车牌号后保存'}
      onClose={onClose}
      onRemove={vehicle ? () => void confirmDelete() : undefined}
      removeLabel="删除车辆"
      removeArmed={armed}
      editOpen={editing}
      onEditOpenChange={setEditing}
      editLabel="编辑车辆"
      onHeadPointerDown={onHeadPointerDown}
      footer={
        <div
          className="dispatcher-card-lift down"
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整车辆详情高度"
          onPointerDown={onHeadPointerDown}
        />
      }
    >
      <OrderInfoFields
        className="vehicle-plain"
        heading=""
        onSave={editing ? () => void save() : undefined}
        saveDisabled={busy}
        extra={
          <>
        {editing ? (
          <>
            <label className="dispatcher-notes-field">
              车牌号
              <input value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="车牌号" />
            </label>
            <label className="dispatcher-notes-field">
              <textarea value={info} onChange={(event) => setInfo(event.target.value)} placeholder="车辆信息" />
            </label>
            <label className="dispatcher-notes-field">
              共用备注
              <textarea value={sharedNotes} onChange={(event) => setSharedNotes(event.target.value)} placeholder="共用备注" />
            </label>
          </>
        ) : (
          <>
            {vehicle?.info ? <p className="dispatcher-notes-preview">{vehicle.info}</p> : null}
            {vehicle?.sharedNotes ? <p className="dispatcher-notes-preview">{vehicle.sharedNotes}</p> : null}
          </>
        )}
        <div ref={photosRef} className="vehicle-photos" onPointerDown={(event) => event.stopPropagation()}>
          {Array.from({ length: 3 }, (_, index) => {
            const photo = shown[index]
            if (!photo) {
              return (
                <FileField
                  key={`empty-${index}`}
                  label="添加照片"
                  accept={PHOTO_ACCEPT}
                  disabled={busy}
                  className="vehicle-photo empty"
                  onPick={(file) => void upload(file)}
                />
              )
            }
            return (
              <button
                key={photo.key}
                type="button"
                className="vehicle-photo"
                aria-label={`查看照片 ${index + 1}`}
                onClick={() => {
                  viewer.open(index)
                  onOpenPhoto()
                }}
              >
                <img src={photo.src} alt="" draggable={false} />
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={`dispatcher-chip vehicle-status${available && stopArmed ? ' release' : ''}`}
          disabled={busy}
          data-vehicle-stop={available && stopArmed ? 'true' : undefined}
          aria-pressed={available ? stopArmed : undefined}
          aria-label={available ? (stopArmed ? '确认停用' : '停用') : '可用'}
          onClick={() => requestAvailable(!available)}
        >
          {available ? '停用' : '可用'}
        </button>
        <PhotoLargeView
          photos={shown}
          viewer={viewer}
          busy={busy}
          onDownload={(photo) => void downloadPhoto(photo.src, photo.fileName)}
          onRemove={(photo) => removeShown(photo)}
          onReplace={(photo, file) => void upload(file, photo.photoId ?? photo.pendingId)}
        />
          </>
        }
      />
    </DispatcherDayCard>
  )
}

