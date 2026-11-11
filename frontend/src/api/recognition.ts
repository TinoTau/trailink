import { api } from './client'
import type { DraftDay, OrderDraft, RecognitionStatus } from '../types'

/** 核对后提交的订单：只提交勾选的日期。电子票和行程图按识别时的序号随表单上传。 */
export interface OrderImport {
  platformOrderNo: string | null
  guestCount: number
  vehicleType: string | null
  island: string | null
  notes: string | null
  /** 在调度台上建单：放在自己的调度台上；派给调度里建单不传，留在公司订单池。 */
  onMyDesk?: boolean
  days: Pick<DraftDay, 'serviceDate' | 'description' | 'endLocation' | 'activities'>[]
}

/** AI 建单：上传行程图和电子票得到草稿；核对后一次写成订单。 */
export const recognitionApi = {
  status: () => api.get<RecognitionStatus>('/api/recognition/status'),
  /** 识别：文件（行程图、电子票）和粘贴的行程文字，至少一样。 */
  draft: (files: File[], text?: string) => {
    const body = new FormData()
    for (const file of files) {
      body.append('files', file)
    }
    if (text?.trim()) {
      body.append('text', text)
    }
    return api.postForm<OrderDraft>('/api/recognition/order-draft', body)
  },
  import: (order: OrderImport, files: File[]) => {
    const body = new FormData()
    body.append('order', JSON.stringify(order))
    files.forEach((file, index) => body.append(`file-${index}`, file))
    return api.postForm<{ orderId: string }>('/api/recognition/import', body)
  },
}
