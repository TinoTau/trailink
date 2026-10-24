import { message } from 'antd'
import { useState } from 'react'
import { ordersApi } from '../api/orders'
import type { OrderFile } from '../types'
import { FileField } from './FileField'

export function OrderFilesBlock({
  orderId,
  files,
  onChanged,
  compact,
}: {
  orderId: string
  files: OrderFile[]
  onChanged: () => void | Promise<void>
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    setBusy(true)
    try {
      await ordersApi.uploadFile(orderId, file)
      await onChanged()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传截图失败')
    } finally {
      setBusy(false)
    }
  }

  async function remove(fileId: string) {
    setBusy(true)
    try {
      await ordersApi.removeFile(orderId, fileId)
      await onChanged()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除截图失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'dispatcher-files' : 'account-files'}>
      {files.map((file) => (
        <div className="account-file-row" key={file.id}>
          <a href={ordersApi.fileUrl(orderId, file.id)} target="_blank" rel="noreferrer">
            {file.fileName}
          </a>
          <button
            type="button"
            className={compact ? 'dispatcher-chip' : 'account-chip'}
            disabled={busy}
            onClick={() => void remove(file.id)}
          >
            删除
          </button>
        </div>
      ))}
      <FileField
        label="上传截图"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        className={compact ? 'dispatcher-chip' : 'account-chip'}
        onPick={(file) => void upload(file)}
      />
    </div>
  )
}
