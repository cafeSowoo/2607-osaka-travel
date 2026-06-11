import type { ChecklistItem, ItineraryItem, Reservation, TravelData, Trip, TripDay } from '../types'

export const categories = ['이동', '식사', '카페', '관광', '쇼핑', '휴식', '기타'] as const

export const tripDays: TripDay[] = [
  { dayIndex: 1, date: '2026-07-26', label: 'Day 1 · 7/26 일' },
  { dayIndex: 2, date: '2026-07-27', label: 'Day 2 · 7/27 월' },
  { dayIndex: 3, date: '2026-07-28', label: 'Day 3 · 7/28 화' },
  { dayIndex: 4, date: '2026-07-29', label: 'Day 4 · 7/29 수' },
  { dayIndex: 5, date: '2026-07-30', label: 'Day 5 · 7/30 목' },
]

export const seedTrip: Trip = {
  id: 'osaka-2026',
  title: '2607 Osaka',
  destination: '오사카',
  startDate: '2026-07-26',
  endDate: '2026-07-30',
  exchangeRate: 9.5,
}

export const seedReservations: Reservation[] = [
  {
    id: 'reservation-flight-jejuair',
    tripId: seedTrip.id,
    kind: 'flight',
    title: '항공권 예약',
    reference: '로그인 후 입력',
    primaryDate: '2026-07-26',
    subtitle: '예약 정보를 Supabase에 저장하세요',
    sortOrder: 10,
    details: [],
    meta: {
      source: 'placeholder',
    },
  },
  {
    id: 'reservation-hotel-agoda',
    tripId: seedTrip.id,
    kind: 'hotel',
    title: '호텔 예약',
    reference: '로그인 후 입력',
    primaryDate: '2026-07-26',
    subtitle: '예약 정보를 Supabase에 저장하세요',
    sortOrder: 20,
    details: [],
    meta: {
      source: 'placeholder',
    },
  },
]

export const seedChecklist: ChecklistItem[] = [
  { id: 'check-passport', tripId: seedTrip.id, section: '출국 전', title: '여권 만료일과 여권 지참 확인', done: false, sortOrder: 10 },
  { id: 'check-esim', tripId: seedTrip.id, section: '출국 전', title: 'eSIM 또는 로밍 준비', done: false, sortOrder: 20 },
  { id: 'check-cash', tripId: seedTrip.id, section: '출국 전', title: 'JPY 현금과 해외 결제 카드 준비', done: false, sortOrder: 30 },
  { id: 'check-kobe-route', tripId: seedTrip.id, section: '여행 중', title: '고베공항 → 숙소 이동 동선 확인', done: false, sortOrder: 40 },
  { id: 'check-kix-route', tripId: seedTrip.id, section: '귀국 전', title: '숙소 → 간사이공항 T2 이동 시간 확인', done: false, sortOrder: 50 },
]

export const seedItineraryItems: ItineraryItem[] = []

export const createSeedData = (): TravelData => ({
  trip: { ...seedTrip },
  days: tripDays.map((day) => ({ ...day })),
  itineraryItems: seedItineraryItems.map((item) => ({ ...item })),
  reservations: seedReservations.map((reservation) => ({ ...reservation, details: [...reservation.details], meta: { ...reservation.meta } })),
  checklistItems: seedChecklist.map((item) => ({ ...item })),
})
