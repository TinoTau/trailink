import type {
  AssignmentResult,
  ItineraryDay,
  Order,
  OrderActivity,
  OrderActivityWrite,
  OrderWrite,
} from '../types'
import { api } from './client'

export const ordersApi = {
  list: () => api.get<Order[]>('/api/orders'),
  get: (id: string) => api.get<Order>(`/api/orders/${id}`),
  create: (body: OrderWrite) => api.post<Order>('/api/orders', body),
  update: (id: string, body: OrderWrite) => api.put<Order>(`/api/orders/${id}`, body),
  remove: (id: string) => api.delete(`/api/orders/${id}`),
  assignDriver: (orderId: string, driverId: string | null) =>
    api.put<AssignmentResult>(`/api/orders/${orderId}/driver`, { driverId }),
  createDay: (orderId: string, body: { serviceDate: string; description?: string; endLocation?: string; driverId?: string | null }) =>
    api.post<ItineraryDay>(`/api/orders/${orderId}/days`, body),
  updateDay: (
    orderId: string,
    dayId: string,
    body: { serviceDate: string; description?: string | null; endLocation?: string | null; driverId?: string | null },
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
