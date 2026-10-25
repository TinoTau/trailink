import type { Driver, DriverNoteWrite } from '../types'
import { api } from './client'

export const driversApi = {
  list: () => api.get<Driver[]>('/api/drivers'),
  updateNotes: (id: string, body: DriverNoteWrite) => api.put<Driver>(`/api/drivers/${id}/notes`, body),
}
