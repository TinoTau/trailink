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
  days: ItineraryDay[]
}

export interface OrderWrite {
  platformOrderNo?: string
  sourceCompany?: string
  startDate: string
  guestCount: number
  notes?: string
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

export interface DriverCalendarPreview {
  preview: boolean
  identityIsolated: boolean
  driverId?: string | null
  driverName?: string | null
  days: DriverCalendarDay[]
}

export interface DriverCalendarMutation {
  orderId: string
  orderNo: string
  driverId?: string | null
  updatedDayCount: number
  warnings: string[]
}
