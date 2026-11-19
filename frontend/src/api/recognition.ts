import { api } from './client'
import type { DraftDay, OrderDraft, OrderFillPreview, OrderFillResult, RecognitionStatus } from '../types'

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

/**
 * 粗单填入行程明细：核对后的细单。以细单为准；没填的（人数为 null、车型、南/北岛、订单号，某天的说明、住宿、活动）保留粗单的。
 */
export interface OrderFill {
  platformOrderNo: string | null
  guestCount: number | null
  vehicleType: string | null
  island: string | null
  notes: string | null
  days: OrderImport['days']
}

let statusRequest: Promise<RecognitionStatus> | null = null

/** AI 建单：上传行程图和电子票得到草稿；核对后一次写成订单。 */
export const recognitionApi = {
  status: () => api.get<RecognitionStatus>('/api/recognition/status'),
  /** 同一页面里只问一次（司导日历每天的详情都要知道能不能「填入行程明细」）。失败了下次再问。 */
  cachedStatus: () => {
    statusRequest ??= recognitionApi.status().catch((error: unknown) => {
      statusRequest = null
      throw error
    })
    return statusRequest
  },
  /** 识别：文件（行程图、电子票）和粘贴的行程文字，至少一样。给已有订单填入行程明细时带上 orderId。 */
  draft: (files: File[], text?: string, orderId?: string) => {
    const body = new FormData()
    for (const file of files) {
      body.append('files', file)
    }
    if (text?.trim()) {
      body.append('text', text)
    }
    if (orderId) {
      body.append('orderId', orderId)
    }
    return api.postForm<OrderDraft>('/api/recognition/order-draft', body)
  },
  /** 填入前的对照，不写数据库。 */
  fillPreview: (orderId: string, order: OrderFill) =>
    api.post<OrderFillPreview>(`/api/orders/${orderId}/itinerary-fill/preview`, order),
  /** 把细单填进粗单。文件和 AI 建单一样按识别时的序号上传。 */
  fill: (orderId: string, order: OrderFill, files: File[]) => {
    const body = new FormData()
    body.append('order', JSON.stringify(order))
    files.forEach((file, index) => body.append(`file-${index}`, file))
    return api.postForm<OrderFillResult>(`/api/orders/${orderId}/itinerary-fill`, body)
  },
  import: (order: OrderImport, files: File[]) => {
    const body = new FormData()
    body.append('order', JSON.stringify(order))
    files.forEach((file, index) => body.append(`file-${index}`, file))
    return api.postForm<{ orderId: string }>('/api/recognition/import', body)
  },
}
