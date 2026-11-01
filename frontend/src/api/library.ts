import { api } from './client'
import type { Destination, LibraryActivity, LibraryActivityDetail, LibraryActivityWrite, LibraryPick, OrderActivity } from '../types'

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value)
    }
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** 活动库：所有人可查、可评分、可调整自己的顺序；只有公司账户能编辑。 */
export const libraryApi = {
  destinations: (q?: string) => api.get<Destination[]>(`/api/library/destinations${query({ q })}`),
  createDestination: (nameZh: string | null, nameEn: string | null) =>
    api.post<Destination>('/api/library/destinations', { nameZh, nameEn }),
  search: (q?: string, destinationId?: string) =>
    api.get<LibraryActivity[]>(`/api/library/activities${query({ q, destinationId })}`),
  /** 当日详情添加活动：按住宿位置列出当地活动，已按本人顺序和评分排好。 */
  pick: (place: string) => api.get<LibraryPick>(`/api/library/pick${query({ place })}`),
  saveOrder: (destinationId: string, activityIds: string[]) =>
    api.put<void>('/api/library/order', { destinationId, activityIds }),
  detail: (id: string) => api.get<LibraryActivityDetail>(`/api/library/activities/${id}`),
  create: (body: LibraryActivityWrite) => api.post<LibraryActivityDetail>('/api/library/activities', body),
  update: (id: string, body: LibraryActivityWrite) => api.put<LibraryActivityDetail>(`/api/library/activities/${id}`, body),
  remove: (id: string) => api.delete(`/api/library/activities/${id}`),
  rate: (id: string, score: number, comment: string) =>
    api.put<LibraryActivityDetail>(`/api/library/activities/${id}/rating`, { score, comment }),
  unrate: (id: string) => api.delete(`/api/library/activities/${id}/rating`),
  uploadPhoto: (id: string, file: File) => api.postFile<LibraryActivityDetail>(`/api/library/activities/${id}/photos`, file),
  replacePhoto: (id: string, photoId: string, file: File) =>
    api.putFile<LibraryActivityDetail>(`/api/library/activities/${id}/photos/${photoId}`, file),
  removePhoto: (id: string, photoId: string) => api.delete(`/api/library/activities/${id}/photos/${photoId}`),
  photoUrl: (id: string, photoId: string) => `/api/library/activities/${id}/photos/${photoId}`,
  /** 把选中的活动按顺序加进某一天。 */
  addToDay: (orderId: string, dayId: string, libraryActivityIds: string[]) =>
    api.post<OrderActivity[]>(`/api/orders/${orderId}/days/${dayId}/activities/from-library`, { libraryActivityIds }),
}

/** 「4.5★ (2)」；还没人评分时为空字符串。 */
export function ratingLabel(activity: Pick<LibraryActivity, 'averageScore' | 'ratingCount'>) {
  return activity.averageScore == null ? '' : `${activity.averageScore.toFixed(1)}★ (${activity.ratingCount})`
}
