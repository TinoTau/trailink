import { api } from './client'
import type { DriverCalendarMutation, DriverCalendarPreview } from '../types'

export const driverCalendarApi = {
  preview: (startDate: string, endDate: string) =>
    api.get<DriverCalendarPreview>(
      `/api/driver-calendar/preview?startDate=${startDate}&endDate=${endDate}`,
    ),
  claim: (orderNo: string) =>
    api.post<DriverCalendarMutation>('/api/driver-calendar/claim', { orderNo }),
  createRange: (startDate: string, endDate: string) =>
    api.post<DriverCalendarMutation>('/api/driver-calendar/range', { startDate, endDate }),
}
