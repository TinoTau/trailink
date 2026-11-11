import { api } from './client'
import type { GrabOrder, GrabResult, OrderClaim } from '../types'

/** 抢单：司导抢订单里还没派的全部日期，等调度员确认；调度员看待确认的抢单并确认派单。 */
export const grabApi = {
  list: () => api.get<GrabOrder[]>('/api/grab'),
  take: (orderId: string, dayIds: string[]) => api.post<GrabResult>(`/api/grab/${orderId}`, { dayIds }),
  withdraw: (orderId: string) => api.delete(`/api/grab/${orderId}`),
  claims: () => api.get<OrderClaim[]>('/api/grab/claims'),
  confirm: (orderId: string, driverId: string) => api.post<GrabResult>(`/api/grab/${orderId}/confirm`, { driverId }),
}

export const SHARE_LEVEL_LABELS = ['调度自留', '公司内部', '面向所有人'] as const
