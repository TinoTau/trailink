import { api } from './client'
import type { Vehicle, VehicleBindResult, VehicleWrite } from '../types'

export const vehiclesApi = {
  list: () => api.get<Vehicle[]>('/api/vehicles'),
  create: (body: VehicleWrite) => api.post<Vehicle>('/api/vehicles', body),
  update: (id: string, body: VehicleWrite) => api.put<Vehicle>(`/api/vehicles/${id}`, body),
  remove: (id: string) => api.delete(`/api/vehicles/${id}`),
  uploadPhoto: (id: string, file: File) => api.postFile<Vehicle>(`/api/vehicles/${id}/photos`, file),
  replacePhoto: (id: string, photoId: string, file: File) =>
    api.putFile<Vehicle>(`/api/vehicles/${id}/photos/${photoId}`, file),
  removePhoto: (id: string, photoId: string) => api.delete(`/api/vehicles/${id}/photos/${photoId}`),
  bind: (orderId: string, dayId: string, vehicleId: string) =>
    api.put<VehicleBindResult>(`/api/orders/${orderId}/days/${dayId}/vehicle`, { vehicleId }),
  unbind: (orderId: string, dayId: string, onlyDay: boolean) =>
    api.put<VehicleBindResult>(`/api/orders/${orderId}/days/${dayId}/vehicle`, { vehicleId: null, onlyDay }),
  photoUrl: (id: string, photoId: string) => `/api/vehicles/${id}/photos/${photoId}`,
}
