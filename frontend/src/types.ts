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
  VehicleBindResultDto,
  VehiclePhotoReadDto,
  VehicleReadDto,
  VehicleWriteDto,
  LicensePhotoReadDto,
  OrderActivityReadDto,
  OrderActivityWriteDto,
  OrderFileReadDto,
  OrderReadDto,
  OrderWriteDto,
  PlaceDto,
  PendingApplicationDto,
  PendingDriverApplicationDto,
  SessionUserDto,
  WeatherSourceDto,
} from './api/generated'

type RequiredApi<T> = { [K in keyof T]-?: T[K] }

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

export type CompanyOrderSummary = Omit<RequiredApi<CompanyOrderDto>, 'kind'> & {
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

export type OrderActivity = Omit<RequiredApi<OrderActivityReadDto>, 'bookingTime' | 'checkinTime'> & {
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

export type VehiclePhoto = RequiredApi<VehiclePhotoReadDto>
export type Vehicle = Omit<RequiredApi<VehicleReadDto>, 'photos'> & { photos: VehiclePhoto[] }
export type VehicleWrite = RequiredApi<VehicleWriteDto>
export type VehicleBindResult = RequiredApi<VehicleBindResultDto>
export type LicensePhoto = RequiredApi<LicensePhotoReadDto>

export type OrderFile = RequiredApi<OrderFileReadDto>
export type Place = RequiredApi<PlaceDto>
export type WeatherSource = RequiredApi<WeatherSourceDto>

export type Order = Omit<RequiredApi<OrderReadDto>, 'days' | 'files'> & {
  days: ItineraryDay[]
  files: OrderFile[]
}

export type OrderWrite = Omit<OrderWriteDto, 'startDate' | 'guestCount'> & {
  startDate: string
  guestCount: number
}

export type AssignmentResult = Omit<RequiredApi<AssignmentResultDto>, 'warnings'> & {
  warnings: string[]
}

export interface DriverCalendarTrip {
  orderId: string
  label: string
  itineraryDayId: string
  endLocation: string | null
  /** 这一天住宿地的天气短词，只有常用地点、且在预报范围内才有。 */
  weather: string | null
}

export interface DriverCalendarDay {
  date: string
  items: DriverCalendarTrip[]
  assignerName?: string
}

