import { eachLocalDate } from '../localDate'
import type {
  AssignmentResult,
  ItineraryDay,
  Order,
  OrderActivity,
  OrderActivityWrite,
  OrderWrite,
} from '../types'
import { api } from './client'

export const MAX_ORDER_RANGE_DAYS = 31

export async function createOrderWithDays(input: {
  startDate: string
  endDate: string
  driverId?: string | null
  guestCount?: number
}) {
  if (!input.startDate || !input.endDate) {
    throw new Error('请先在日历上选择起止日期')
  }

  const dates = eachLocalDate(input.startDate, input.endDate)
  if (dates.length > MAX_ORDER_RANGE_DAYS) {
    throw new RangeError(`一次最多添加 ${MAX_ORDER_RANGE_DAYS} 天`)
  }

  const order = await ordersApi.create({
    startDate: input.startDate,
    guestCount: input.guestCount ?? 0,
  })
  const warnings: string[] = []
  for (const date of dates) {
    const day = await ordersApi.createDay(order.id, {
      serviceDate: date,
      ...(input.driverId ? { driverId: input.driverId } : {}),
    })
    if (day.warnings?.length) {
      warnings.push(...day.warnings)
    }
  }
  return { order, dates, warnings }
}

export const ordersApi = {
  list: (params?: { orderNo?: string }) => {
    const search = new URLSearchParams()
    if (params?.orderNo) {
      search.set('orderNo', params.orderNo)
    }
    const query = search.toString()
    return api.get<Order[]>(query ? `/api/orders?${query}` : '/api/orders')
  },
  get: (id: string) => api.get<Order>(`/api/orders/${id}`),
  create: (body: OrderWrite) => api.post<Order>('/api/orders', body),
  update: (id: string, body: OrderWrite) => api.put<Order>(`/api/orders/${id}`, body),
  remove: (id: string) => api.delete(`/api/orders/${id}`),
  assignDriver: (orderId: string, driverId: string | null, failOnConflict = false) =>
    api.put<AssignmentResult>(`/api/orders/${orderId}/driver`, { driverId, failOnConflict }),
  createDay: (orderId: string, body: { serviceDate: string; description?: string; endLocation?: string; driverId?: string | null }) =>
    api.post<ItineraryDay>(`/api/orders/${orderId}/days`, body),
  updateDay: (
    orderId: string,
    dayId: string,
    body: {
      serviceDate: string
      description?: string | null
      endLocation?: string | null
      driverId?: string | null
      failOnConflict?: boolean
    },
  ) => api.put<ItineraryDay>(`/api/orders/${orderId}/days/${dayId}`, body),
  removeDay: (orderId: string, dayId: string) => api.delete(`/api/orders/${orderId}/days/${dayId}`),
  createActivity: (orderId: string, dayId: string, body: OrderActivityWrite) =>
    api.post<OrderActivity>(`/api/orders/${orderId}/days/${dayId}/activities`, body),
  updateActivity: (orderId: string, dayId: string, activityId: string, body: OrderActivityWrite) =>
    api.put<OrderActivity>(`/api/orders/${orderId}/days/${dayId}/activities/${activityId}`, body),
  removeActivity: (orderId: string, dayId: string, activityId: string) =>
    api.delete(`/api/orders/${orderId}/days/${dayId}/activities/${activityId}`),
  reorderActivities: (orderId: string, dayId: string, activityIds: string[]) =>
    api.put<OrderActivity[]>(`/api/orders/${orderId}/days/${dayId}/activities/reorder`, { activityIds }),
}
