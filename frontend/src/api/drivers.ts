import type { Driver, DriverWrite } from '../types'
import { api } from './client'

export const driversApi = {
  list: () => api.get<Driver[]>('/api/drivers'),
  get: (id: string) => api.get<Driver>(`/api/drivers/${id}`),
  create: (body: DriverWrite) => api.post<Driver>('/api/drivers', body),
  update: (id: string, body: DriverWrite) => api.put<Driver>(`/api/drivers/${id}`, body),
  remove: (id: string) => api.delete(`/api/drivers/${id}`),
}
