import type {
  AssignmentResultDto,
  CompanyApplicationDto,
  CompanyBriefDto,
  CompanyDeskDto,
  CompanyHomeDto,
  CompanyMemberDto,
  CompanyOrderRecordDto,
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
  GrabOrderDto,
  GrabDayDto,
  GrabConflictDto,
  GrabResultDto,
  OrderClaimDto,
  OrderWriteDto,
  PlaceDto,
  PendingApplicationDto,
  PendingDriverApplicationDto,
  SessionUserDto,
  WeatherSourceDto,
  DestinationDto,
  LibraryActivityReadDto,
  LibraryActivityWriteDto,
  LibraryPhotoReadDto,
  LibraryReviewDto,
  OrderDraftActivityDto,
  OrderDraftDayDto,
  OrderDraftDto,
  RecognitionStatusDto,
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

/** 南/北岛：south 南岛、north 北岛、both 南北岛；没填为 null（按南岛显示）。 */
export type OrderIsland = 'south' | 'north' | 'both'

/** 订单记录的过滤范围：all 公司全部、desk 调度（自己调度台上的）、driver 司导（派给自己跑的）。 */
export type CompanyOrderScope = 'all' | 'desk' | 'driver'

/** 公司信息页「订单记录」的一行。 */
export type CompanyOrderRecord = Omit<RequiredApi<CompanyOrderRecordDto>, 'shareLevel' | 'island'> & {
  shareLevel: ShareLevel
  island: OrderIsland | null
}

export type CompanyDesk = Omit<
  RequiredApi<CompanyDeskDto>,
  'applications' | 'dispatchers'
> & {
  applications: CompanyApplication[]
  dispatchers: CompanyMember[]
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

export type Destination = RequiredApi<DestinationDto>
export type LibraryPhoto = RequiredApi<LibraryPhotoReadDto>
export type LibraryActivity = Omit<RequiredApi<LibraryActivityReadDto>, 'destinations' | 'photos'> & {
  destinations: Destination[]
  photos: LibraryPhoto[]
}
export type LibraryReview = RequiredApi<LibraryReviewDto>
export type LibraryActivityDetail = LibraryActivity & { reviews: LibraryReview[] }
export type LibraryActivityWrite = Omit<RequiredApi<LibraryActivityWriteDto>, 'nameZh' | 'nameEn' | 'sharedNotes'> & {
  nameZh: string | null
  nameEn: string | null
  sharedNotes: string | null
}
export type LibraryPick = { destination: Destination | null; activities: LibraryActivity[] }

export type Order = Omit<RequiredApi<OrderReadDto>, 'days' | 'files'> & {
  days: ItineraryDay[]
  files: OrderFile[]
}

/** 抢单范围：0 调度自留，1 公司内部，2 面向所有人。 */
export type ShareLevel = 0 | 1 | 2

export type GrabActivity = { content: string; bookingTime: string | null; checkinTime: string | null }
export type GrabDay = Omit<RequiredApi<GrabDayDto>, 'activities'> & { activities: GrabActivity[] }
export type GrabConflict = RequiredApi<GrabConflictDto>
/** 调度台：自己订单上待确认的抢单。 */
export type OrderClaim = RequiredApi<OrderClaimDto>
export type GrabOrder = Omit<RequiredApi<GrabOrderDto>, 'shareLevel' | 'days' | 'conflicts'> & {
  shareLevel: ShareLevel
  days: GrabDay[]
  conflicts: GrabConflict[]
}
export type GrabResult = RequiredApi<GrabResultDto>

export type OrderWrite = Omit<OrderWriteDto, 'startDate' | 'guestCount'> & {
  startDate: string
  guestCount: number
}

export type OrderDatesResult = { order: Order; removedDayCount: number; warnings: string[] }

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
  /** 这一天配的车牌（多张单配了不同的车用「/」连起来）；没配车时为空。 */
  vehiclePlate?: string
}

/** AI 建单：服务器配了密钥且当前用户是调度员或公司账户时可用。 */
export type RecognitionStatus = RequiredApi<RecognitionStatusDto>
export type DraftActivityKind = 'activity' | 'hotel'
export type DraftActivity = Omit<RequiredApi<OrderDraftActivityDto>, 'kind' | 'bookingTime' | 'checkinTime'> & {
  kind: DraftActivityKind
  bookingTime: string | null
  checkinTime: string | null
}
export type DraftDay = Omit<RequiredApi<OrderDraftDayDto>, 'activities'> & { activities: DraftActivity[] }
/** AI 识别出的订单草稿，调度员核对后才写入。 */
export type OrderDraft = Omit<RequiredApi<OrderDraftDto>, 'days'> & { days: DraftDay[] }
