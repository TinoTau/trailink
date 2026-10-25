import type {
  CompanyHome,
  CompanySearch,
  DispatcherSearch,
  DriverApplicant,
  PendingApplication,
  PendingDriverApplication,
  SessionUser,
} from '../types'
import { api } from './client'

export const authApi = {
  register: (body: {
    username: string
    password: string
    name: string
    accountType: 'driver' | 'company'
    companyName?: string
  }) => api.post<SessionUser>('/api/auth/register', body),
  login: (username: string, password: string) =>
    api.post<SessionUser>('/api/auth/login', { username, password }),
  logout: () => api.post<void>('/api/auth/logout', {}),
  me: () => api.get<SessionUser>('/api/auth/me'),
  updateName: (name: string) => api.put<SessionUser>('/api/auth/name', { name }),
  updateUsername: (username: string) => api.put<SessionUser>('/api/auth/username', { username }),
  updatePassword: (currentPassword: string, password: string) =>
    api.put<SessionUser>('/api/auth/password', { currentPassword, password }),
  updateContact: (contact: string) => api.put<SessionUser>('/api/auth/contact', { contact }),
  updateAssignedColor: (assignedColor: string) =>
    api.put<SessionUser>('/api/auth/assigned-color', { assignedColor }),
  uploadAvatar: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return api.postForm<SessionUser>('/api/auth/avatar', body)
  },
}

export const companyApi = {
  search: (name: string) => api.get<CompanySearch[]>(`/api/companies?name=${encodeURIComponent(name)}`),
  apply: (companyId: string) => api.post<PendingApplication>('/api/companies/applications', { companyId }),
  desk: (companyId?: string) =>
    api.get<CompanyHome>(companyId ? `/api/company?companyId=${encodeURIComponent(companyId)}` : '/api/company'),
  updateContact: (companyId: string, contact: string) =>
    api.put<CompanyHome>('/api/company', { companyId, contact }),
  updateName: (companyId: string, name: string) =>
    api.put<CompanyHome>('/api/company', { companyId, name }),
  uploadQr: (companyId: string, file: File) => {
    const body = new FormData()
    body.append('companyId', companyId)
    body.append('file', file)
    return api.postForm<CompanyHome>('/api/company/qr', body)
  },
  approve: (applicationId: string, companyId?: string) =>
    api.post<CompanyHome>(`/api/company/applications/${applicationId}/approve`, {}).then((home) =>
      companyId ? companyApi.desk(companyId) : home,
    ),
  removeDispatcher: (userId: string, companyId?: string) =>
    api.delete(`/api/company/dispatchers/${userId}`).then(() => companyApi.desk(companyId)),
  updateDispatcherNotes: (userId: string, notes: string) =>
    api.put<CompanyHome>(`/api/company/dispatchers/${userId}/notes`, { notes }),
  updateNote: (companyId: string, notes: string) =>
    api.put<CompanyHome>('/api/company/notes', { companyId, notes }),
}

export const dispatcherApi = {
  search: (name: string) =>
    api.get<DispatcherSearch[]>(`/api/dispatchers?name=${encodeURIComponent(name)}`),
  apply: (dispatcherUserId: string) =>
    api.post<PendingDriverApplication>('/api/dispatchers/applications', { dispatcherUserId }),
  incoming: () => api.get<DriverApplicant[]>('/api/dispatchers/applications'),
  approve: (applicationId: string) =>
    api.post<DriverApplicant[]>(`/api/dispatchers/applications/${applicationId}/approve`, {}),
}
