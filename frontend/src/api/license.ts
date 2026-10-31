import { api } from './client'
import type { LicensePhoto } from '../types'

export const licenseApi = {
  listMine: () => api.get<LicensePhoto[]>('/api/auth/license-photos'),
  upload: (side: number, file: File) => api.postFile<LicensePhoto>(`/api/auth/license-photos?side=${side}`, file),
  replace: (id: string, file: File) => api.putFile<LicensePhoto>(`/api/auth/license-photos/${id}`, file),
  remove: (id: string) => api.delete(`/api/auth/license-photos/${id}`),
  mineUrl: (id: string) => `/api/auth/license-photos/${id}`,
  listForDriver: (driverId: string) => api.get<LicensePhoto[]>(`/api/drivers/${driverId}/license-photos`),
  driverUrl: (driverId: string, photoId: string) => `/api/drivers/${driverId}/license-photos/${photoId}`,
}
