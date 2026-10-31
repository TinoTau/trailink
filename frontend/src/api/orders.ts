import { addCalendarMonths, eachLocalDate, parseYmd, toDateOnly } from '../localDate'
import type {
  AssignmentResult,
  ItineraryDay,
  ItineraryDayWrite,
  Order,
  OrderActivity,
  OrderActivityWrite,
  OrderFile,
  OrderWrite,
} from '../types'
import { api } from './client'

export const MAX_ORDER_RANGE_MONTHS = 3

export async function createOrderWithDays(input: {
  startDate: string
  endDate: string
  driverId?: string | null
  guestCount?: number
  companyId?: string
}) {
  if (!input.startDate || !input.endDate) {
    throw new Error('请先在日历上选择起止日期')
  }

  const dates = eachLocalDate(input.startDate, input.endDate)
  const limit = addCalendarMonths(parseYmd(input.startDate), MAX_ORDER_RANGE_MONTHS)
  if (parseYmd(input.endDate) > limit) {
    throw new RangeError('一次最多添加三个月')
  }

  const companyId = input.companyId || undefined
  const order = await ordersApi.create({
    startDate: input.startDate,
    guestCount: input.guestCount ?? 0,
    ...(companyId ? { companyId } : {}),
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

export function itineraryDayWrite(
  day: {
    serviceDate: string
    description?: string | null
    endLocation?: string | null
  },
  driverId: string | null,
): ItineraryDayWrite {
  return {
    serviceDate: day.serviceDate,
    description: day.description,
    endLocation: day.endLocation,
    driverId,
  }
}

export function clearDayDriver(day: {
  serviceDate: string
  description?: string | null
  endLocation?: string | null
}) {
  return itineraryDayWrite(day, null)
}

export function updateOrderInfo(
  order: Order,
  fields: { platformOrderNo?: string; notes?: string; driverNotes?: string; sharedNotes?: string; companyId?: string | null },
) {
  return ordersApi.update(order.id, {
    platformOrderNo: fields.platformOrderNo !== undefined
      ? fields.platformOrderNo.trim() || undefined
      : order.platformOrderNo ?? undefined,
    startDate: toDateOnly(order.startDate),
    guestCount: order.guestCount,
    notes: fields.notes !== undefined ? fields.notes : order.notes,
    driverNotes: fields.driverNotes !== undefined ? fields.driverNotes : order.driverNotes,
    sharedNotes: fields.sharedNotes !== undefined ? fields.sharedNotes : order.sharedNotes,
    companyId: fields.companyId !== undefined ? fields.companyId : order.companyId,
  })
}

export const ordersApi = {
  list: (params?: { orderNo?: string; driverId?: string }) => {
    const search = new URLSearchParams()
    if (params?.orderNo) {
      search.set('orderNo', params.orderNo)
    }
    if (params?.driverId) {
      search.set('driverId', params.driverId)
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
  assignDispatcher: (orderId: string, dispatcherUserId: string | null) =>
    api.put<Order>(`/api/orders/${orderId}/dispatcher`, { dispatcherUserId }),
  createDay: (orderId: string, body: ItineraryDayWrite) =>
    api.post<ItineraryDay>(`/api/orders/${orderId}/days`, body),
  updateDay: (
    orderId: string,
    dayId: string,
    body: ItineraryDayWrite,
  ) => api.put<ItineraryDay>(`/api/orders/${orderId}/days/${dayId}`, body),
  createActivity: (orderId: string, dayId: string, body: OrderActivityWrite) =>
    api.post<OrderActivity>(`/api/orders/${orderId}/days/${dayId}/activities`, body),
  updateActivity: (orderId: string, dayId: string, activityId: string, body: OrderActivityWrite) =>
    api.put<OrderActivity>(`/api/orders/${orderId}/days/${dayId}/activities/${activityId}`, body),
  removeActivity: (orderId: string, dayId: string, activityId: string) =>
    api.delete(`/api/orders/${orderId}/days/${dayId}/activities/${activityId}`),
  reorderActivities: (orderId: string, dayId: string, activityIds: string[]) =>
    api.put<OrderActivity[]>(`/api/orders/${orderId}/days/${dayId}/activities/reorder`, { activityIds }),
  uploadFile: (orderId: string, file: File) => api.postFile<OrderFile>(`/api/orders/${orderId}/files`, file),
  removeFile: (orderId: string, fileId: string) => api.delete(`/api/orders/${orderId}/files/${fileId}`),
  fileUrl: (orderId: string, fileId: string) => `/api/orders/${orderId}/files/${fileId}`,
  uploadTicket: (orderId: string, dayId: string, activityId: string, file: File) =>
    api.postFile<OrderActivity>(`/api/orders/${orderId}/days/${dayId}/activities/${activityId}/ticket`, file),
  ticketUrl: (orderId: string, dayId: string, activityId: string) =>
    `/api/orders/${orderId}/days/${dayId}/activities/${activityId}/ticket`,
}

export function isStoredFile(path?: string | null) {
  return Boolean(path && (path.startsWith('files/') || path.startsWith('company-qr/')))
}
