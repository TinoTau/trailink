import type {
  AssignmentResultDto,
  CompanyApplicationDto,
  CompanyBriefDto,
  CompanyDeskDto,
  CompanyHomeDto,
  CompanyMemberDto,
  CompanyOrderDto,
  DispatcherSearchDto,
  DriverApplicantDto,
  DriverNoteWriteDto,
  DriverReadDto,
  ItineraryDayReadDto,
  ItineraryDayWriteDto,
  OrderActivityReadDto,
  OrderActivityWriteDto,
  OrderFileReadDto,
  OrderReadDto,
  OrderWriteDto,
  PendingApplicationDto,
  PendingDriverApplicationDto,
  SessionUserDto,
} from './api/generated'

type RequiredApi<T> = { [K in keyof T]-?: T[K] }
type WithNumbers<T, K extends keyof T> = Omit<RequiredApi<T>, K> & { [P in K]-?: number }

export type UserRole = 'company' | 'dispatcher' | 'driver'

export type PendingApplication = RequiredApi<PendingApplicationDto>
export type PendingDriverApplication = RequiredApi<PendingDriverApplicationDto>
export type DispatcherSearch = RequiredApi<DispatcherSearchDto>
export type DriverApplicant = RequiredApi<DriverApplicantDto>
export type CompanySearch = RequiredApi<CompanyBriefDto>
export type CompanyApplication = RequiredApi<CompanyApplicationDto>
export type CompanyMember = RequiredApi<CompanyMemberDto>

export type SessionUser = Omit<
  RequiredApi<SessionUserDto>,
  'role' | 'companies' | 'pendingApplications' | 'pendingDriverApplications'
> & {
  role: UserRole
  companies: CompanySearch[]
  pendingApplications: PendingApplication[]
  pendingDriverApplications: PendingDriverApplication[]
}

export type CompanyOrderSummary = Omit<
  WithNumbers<CompanyOrderDto, 'dayCount'>,
  'kind'
> & {
  kind: 'company' | 'assigned' | 'driven'
}

export type CompanyDesk = Omit<
  RequiredApi<CompanyDeskDto>,
  'applications' | 'dispatchers' | 'orders'
> & {
  applications: CompanyApplication[]
  dispatchers: CompanyMember[]
  orders: CompanyOrderSummary[]
}

export type CompanyHome = Omit<RequiredApi<CompanyHomeDto>, 'companies' | 'desk'> & {
  companies: CompanySearch[]
  desk: CompanyDesk | null
}

export type Driver = RequiredApi<DriverReadDto>
export type DriverNoteWrite = RequiredApi<DriverNoteWriteDto>

export type OrderActivity = Omit<
  WithNumbers<OrderActivityReadDto, 'sortOrder'>,
  'bookingTime' | 'checkinTime'
> & {
  bookingTime: string | null
  checkinTime: string | null
}

export type OrderActivityWrite = Omit<
  OrderActivityWriteDto,
  'content' | 'bookingTime' | 'checkinTime'
> & {
  content: string
  bookingTime?: string | null
  checkinTime?: string | null
}

export type ItineraryDayWrite = Omit<ItineraryDayWriteDto, 'serviceDate'> & {
  serviceDate: string
}

export type ItineraryDay = Omit<
  RequiredApi<ItineraryDayReadDto>,
  'activities'
> & {
  activities: OrderActivity[]
}

export type OrderFile = RequiredApi<OrderFileReadDto>

export type Order = Omit<
  WithNumbers<OrderReadDto, 'dayCount' | 'guestCount' | 'assignedDayCount'>,
  'days' | 'files'
> & {
  days: ItineraryDay[]
  files: OrderFile[]
}

export type OrderWrite = Omit<OrderWriteDto, 'startDate' | 'guestCount'> & {
  startDate: string
  guestCount: number
}

export type AssignmentResult = Omit<
  WithNumbers<AssignmentResultDto, 'updatedDayCount'>,
  'warnings'
> & {
  warnings: string[]
}

export interface DriverCalendarTrip {
  orderId: string
  label: string
  itineraryDayId: string
  endLocation: string | null
}

export interface DriverCalendarDay {
  date: string
  items: DriverCalendarTrip[]
  assignerName?: string
}

