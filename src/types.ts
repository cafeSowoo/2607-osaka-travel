export type Category = '이동' | '식사' | '카페' | '관광' | '쇼핑' | '휴식' | '기타'

export type ReservationKind = 'flight' | 'hotel'

export type Trip = {
  id: string
  title: string
  destination: string
  startDate: string
  endDate: string
  exchangeRate: number
}

export type TripDay = {
  dayIndex: number
  date: string
  label: string
}

export type ItineraryItem = {
  id: string
  tripId: string
  dayIndex: number
  date: string
  startTime: string
  endTime: string
  place: string
  category: Category
  title: string
  note: string
  budgetJpy: number
  googlePlaceQuery: string
  sortOrder: number
}

export type Reservation = {
  id: string
  tripId: string
  kind: ReservationKind
  title: string
  reference: string
  primaryDate: string
  subtitle: string
  details: string[]
  meta: Record<string, string>
  sortOrder: number
}

export type ChecklistItemKind = 'task' | 'divider'

export type ChecklistItem = {
  id: string
  tripId: string
  section: '출국 전' | '여행 중' | '귀국 전'
  kind: ChecklistItemKind
  title: string
  done: boolean
  sortOrder: number
}

export type TravelData = {
  trip: Trip
  days: TripDay[]
  itineraryItems: ItineraryItem[]
  reservations: Reservation[]
  checklistItems: ChecklistItem[]
}

export type SyncState = {
  configured: boolean
  authenticated: boolean
  loading: boolean
  offline: boolean
  readonly: boolean
  message: string
  user: {
    name: string
    email: string
    avatarUrl: string
  } | null
}
