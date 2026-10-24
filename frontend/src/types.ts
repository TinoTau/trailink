export type UserRole = 'company' | 'dispatcher' | 'driver'

export interface PendingApplication {
  id: string
  companyId: string
  companyName: string
}

export interface SessionUser {
  id: string
  username: string
  name: string
  role: UserRole
  companyId?: string | null
  companyName?: string | null
  driverId?: string | null
  hasAvatar?: boolean
  companies?: CompanySearch[]
  pendingApplications?: PendingApplication[]
  pendingDriverApplications?: PendingDriverApplication[]
}

export interface PendingDriverApplication {
  id: string
  dispatcherUserId: string
  dispatcherName: string
}

export interface DispatcherSearch {
  id: string
  name: string
}

export interface DriverApplicant {
  id: string
  userId: string
  username: string
  name: string
}

export interface CompanySearch {
  id: string
  name: string
}

export interface CompanyHome {
  companies: CompanySearch[]
  desk?: CompanyDesk | null
}

export interface CompanyDesk {
  id: string
  name: string
  ownerName: string
  contact?: string | null
  hasQr: boolean
  canEdit: boolean
  canManage: boolean
  applications: Array<{ id: string; userId: string; username: string; name: string }>
  dispatchers: Array<{ userId: string; username: string; name: string }>
  orders: CompanyOrderSummary[]
}

export interface CompanyOrderSummary {
  id: string
  orderNo: string
  startDate: string
  dayCount: number
  kind: 'company' | 'assigned' | 'driven'
}

export interface Driver {
  id: string
  name: string
  phone?: string | null
  notes?: string | null
}

export interface DriverWrite {
  name: string
  phone?: string
  notes?: string
}

export interface OrderActivity {
  id: string
  itineraryDayId: string
  content: string
  provider?: string | null
  bookingTime?: string | null
  checkinTime?: string | null
  ticketPath?: string | null
  sortOrder: number
}

export interface OrderActivityWrite {
  content: string
  provider?: string
  bookingTime?: string | null
  checkinTime?: string | null
  ticketPath?: string
}

export interface ItineraryDay {
  id: string
  orderId: string
  serviceDate: string
  description?: string | null
  endLocation?: string | null
  driverId?: string | null
  driverName?: string | null
  activityCount: number
  activities: OrderActivity[]
  warnings?: string[]
}

export interface Order {
  id: string
  orderNo: string
  platformOrderNo?: string | null
  sourceCompany?: string | null
  startDate: string
  endDate?: string | null
  dayCount: number
  guestCount: number
  notes?: string | null
  assignedDriverId?: string | null
  assignedDayCount?: number
  days: ItineraryDay[]
  files?: OrderFile[]
}

export interface OrderFile {
  id: string
  orderId: string
  fileName: string
}

export interface OrderWrite {
  platformOrderNo?: string
  sourceCompany?: string
  startDate: string
  guestCount: number
  notes?: string
  companyId?: string
}

export interface AssignmentResult {
  orderId: string
  driverId?: string | null
  updatedDayCount: number
  warnings: string[]
}

export interface DriverCalendarActivity {
  id: string
  content: string
  provider?: string | null
  bookingTime?: string | null
  checkinTime?: string | null
  hasTicket: boolean
  ticketAccessible: boolean
}

export interface DriverCalendarTrip {
  orderId: string
  orderNo: string
  itineraryDayId: string
  endLocation?: string | null
  description?: string | null
  activities: DriverCalendarActivity[]
}

export interface DriverCalendarDay {
  date: string
  items: DriverCalendarTrip[]
}

