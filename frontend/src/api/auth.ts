import type {
  CompanyHome,
  CompanyOrderRecord,
  CompanyOrderScope,
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
  uploadAvatar: (file: File) => api.postFile<SessionUser>('/api/auth/avatar', file),
}

export const companyApi = {
  search: (name: string) => api.get<CompanySearch[]>(`/api/companies?name=${encodeURIComponent(name)}`),
  apply: (companyId: string) => api.post<PendingApplication>('/api/companies/applications', { companyId }),
  desk: (companyId?: string) =>
    api.get<CompanyHome>(companyId ? `/api/company?companyId=${encodeURIComponent(companyId)}` : '/api/company'),
  /** 订单记录：调度员看分配给自己的单，公司账户看本公司全部，司导看自己跑的。按开始日期从早到晚。 */
  /** 订单记录：`all` 公司全部（公司账户）、`desk` 自己调度台上的（公司账户、调度员）、`driver` 派给自己跑的（所有人）。不传用角色的默认。 */
  /** 订单记录导出成默认样式的 Excel。 */
  exportOrders: (companyId: string, scope: CompanyOrderScope) =>
    api.getFile(`/api/company/orders/export?companyId=${encodeURIComponent(companyId)}&scope=${scope}`),
  /** 把订单记录填进上传的表格（.xlsx），返回填好的表格。 */
  fillOrders: (companyId: string, scope: CompanyOrderScope, file: File) =>
    api.postFileForFile(`/api/company/orders/export?companyId=${encodeURIComponent(companyId)}&scope=${scope}`, file),
  orders: (companyId: string, scope?: CompanyOrderScope) =>
    api.get<CompanyOrderRecord[]>(
      `/api/company/orders?companyId=${encodeURIComponent(companyId)}${scope ? `&scope=${scope}` : ''}`,
    ),
  updateContact: (companyId: string, contact: string) =>
    api.put<CompanyHome>('/api/company', { companyId, contact }),
  updateName: (companyId: string, name: string) =>
    api.put<CompanyHome>('/api/company', { companyId, name }),
  uploadQr: (companyId: string, file: File) =>
    api.postFile<CompanyHome>('/api/company/qr', file, { companyId }),
  approve: (applicationId: string, companyId?: string) =>
    api.post<CompanyHome>(`/api/company/applications/${applicationId}/approve`, {}).then((home) =>
      companyId ? companyApi.desk(companyId) : home,
    ),
  removeDispatcher: (userId: string, companyId?: string) =>
    api.delete(`/api/company/dispatchers/${userId}`).then(() => companyApi.desk(companyId)),
  setDispatcherHidden: (userId: string, hidden: boolean) =>
    api.put(`/api/company/dispatchers/${userId}/hidden`, { hidden }),
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
