import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { categories, createSeedData, seedTrip, tripDays } from '../data/seed'
import type { Category, ChecklistItem, ItineraryAiPatch, ItineraryItem, Reservation, TravelData, Trip } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const isCategory = (value: unknown): value is Category => categories.includes(value as Category)
const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined)
const readTime = (value: unknown) => {
  const text = readString(value)
  return text && /^\d{2}:\d{2}$/.test(text) ? text : undefined
}
const readBudget = (value: unknown) => {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : undefined
}

const TABLES = {
  trips: 'osaka_trips',
  itineraryItems: 'osaka_itinerary_items',
  reservations: 'osaka_reservations',
  checklistItems: 'osaka_checklist_items',
} as const

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

type TripRow = {
  id: string
  title: string
  destination: string
  start_date: string
  end_date: string
  exchange_rate: number | string
}

type ItineraryRow = {
  id: string
  trip_id: string
  day_index: number
  date: string
  start_time: string | null
  end_time: string | null
  place: string | null
  category: ItineraryItem['category']
  title: string | null
  note: string | null
  budget_jpy: number | string | null
  google_place_query: string | null
  sort_order: number | null
}

type ReservationRow = {
  id: string
  trip_id: string
  kind: Reservation['kind']
  title: string
  reference: string
  primary_date: string
  subtitle: string | null
  details: string[] | null
  meta: Record<string, string> | null
  sort_order: number | null
}

type ChecklistRow = {
  id: string
  trip_id: string
  section: ChecklistItem['section']
  kind: ChecklistItem['kind'] | null
  title: string
  done: boolean
  sort_order: number | null
}

const fromTrip = (row: TripRow): Trip => ({
  id: row.id,
  title: row.title,
  destination: row.destination,
  startDate: row.start_date,
  endDate: row.end_date,
  exchangeRate: Number(row.exchange_rate),
})

const toTrip = (trip: Trip, userId: string) => ({
  id: trip.id,
  user_id: userId,
  title: trip.title,
  destination: trip.destination,
  start_date: trip.startDate,
  end_date: trip.endDate,
  exchange_rate: trip.exchangeRate,
})

const fromItinerary = (row: ItineraryRow): ItineraryItem => ({
  id: row.id,
  tripId: row.trip_id,
  dayIndex: row.day_index,
  date: row.date,
  startTime: row.start_time ?? '',
  endTime: row.end_time ?? '',
  place: row.place ?? '',
  category: row.category,
  title: row.title ?? '',
  note: row.note ?? '',
  budgetJpy: Number(row.budget_jpy ?? 0),
  googlePlaceQuery: row.google_place_query ?? '',
  sortOrder: row.sort_order ?? 0,
})

const toItinerary = (item: ItineraryItem, userId: string) => ({
  id: item.id,
  user_id: userId,
  trip_id: item.tripId,
  day_index: item.dayIndex,
  date: item.date,
  start_time: item.startTime || null,
  end_time: item.endTime || null,
  place: item.place.trim(),
  category: item.category,
  title: item.title.trim(),
  note: item.note.trim(),
  budget_jpy: item.budgetJpy,
  google_place_query: item.googlePlaceQuery.trim(),
  sort_order: item.sortOrder,
})

const fromReservation = (row: ReservationRow): Reservation => ({
  id: row.id,
  tripId: row.trip_id,
  kind: row.kind,
  title: row.title,
  reference: row.reference,
  primaryDate: row.primary_date,
  subtitle: row.subtitle ?? '',
  details: row.details ?? [],
  meta: row.meta ?? {},
  sortOrder: row.sort_order ?? 0,
})

const toReservation = (reservation: Reservation, userId: string) => ({
  id: reservation.id,
  user_id: userId,
  trip_id: reservation.tripId,
  kind: reservation.kind,
  title: reservation.title,
  reference: reservation.reference,
  primary_date: reservation.primaryDate,
  subtitle: reservation.subtitle,
  details: reservation.details,
  meta: reservation.meta,
  sort_order: reservation.sortOrder,
})

const fromChecklist = (row: ChecklistRow): ChecklistItem => ({
  id: row.id,
  tripId: row.trip_id,
  section: row.section,
  kind: row.kind ?? 'task',
  title: row.title,
  done: row.done,
  sortOrder: row.sort_order ?? 0,
})

const toChecklist = (item: ChecklistItem, userId: string) => ({
  id: item.id,
  user_id: userId,
  trip_id: item.tripId,
  section: item.section,
  kind: item.kind,
  title: item.title,
  done: item.done,
  sort_order: item.sortOrder,
})

export const getSession = async (): Promise<Session | null> => {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export const signInWithGoogle = async () => {
  if (!supabase) return
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  })
}

export const signOut = async () => {
  if (!supabase) return
  await supabase.auth.signOut()
}

export const loadSupabaseData = async (session: Session): Promise<TravelData> => {
  if (!supabase) return createSeedData()
  const userId = session.user.id

  const { data: existingTrips, error: tripLookupError } = await supabase.from(TABLES.trips).select('*').eq('id', seedTrip.id).limit(1)
  if (tripLookupError) throw tripLookupError

  if (!existingTrips?.length) {
    const seed = createSeedData()
    await supabase.from(TABLES.trips).upsert(toTrip(seed.trip, userId))
    await supabase.from(TABLES.itineraryItems).upsert(seed.itineraryItems.map((item) => toItinerary(item, userId)))
    await supabase.from(TABLES.reservations).upsert(seed.reservations.map((reservation) => toReservation(reservation, userId)))
    await supabase.from(TABLES.checklistItems).upsert(seed.checklistItems.map((item) => toChecklist(item, userId)))
  }

  const [trip, itinerary, reservations, checklist] = await Promise.all([
    supabase.from(TABLES.trips).select('*').eq('id', seedTrip.id).single(),
    supabase.from(TABLES.itineraryItems).select('*').eq('trip_id', seedTrip.id).order('day_index').order('sort_order'),
    supabase.from(TABLES.reservations).select('*').eq('trip_id', seedTrip.id).order('sort_order'),
    supabase.from(TABLES.checklistItems).select('*').eq('trip_id', seedTrip.id).order('sort_order'),
  ])

  if (trip.error) throw trip.error
  if (itinerary.error) throw itinerary.error
  if (reservations.error) throw reservations.error
  if (checklist.error) throw checklist.error

  return {
    trip: fromTrip(trip.data as TripRow),
    days: tripDays,
    itineraryItems: ((itinerary.data ?? []) as ItineraryRow[]).map(fromItinerary),
    reservations: ((reservations.data ?? []) as ReservationRow[]).map(fromReservation),
    checklistItems: ((checklist.data ?? []) as ChecklistRow[]).map(fromChecklist),
  }
}

export const saveTrip = async (trip: Trip, session: Session) => {
  if (!supabase) return
  const { error } = await supabase.from(TABLES.trips).upsert(toTrip(trip, session.user.id))
  if (error) throw error
}

export const saveItineraryItem = async (item: ItineraryItem, session: Session) => {
  if (!supabase) return
  const { error } = await supabase.from(TABLES.itineraryItems).upsert(toItinerary(item, session.user.id))
  if (error) throw error
}

export const deleteItineraryItem = async (id: string) => {
  if (!supabase) return
  const { error } = await supabase.from(TABLES.itineraryItems).delete().eq('id', id)
  if (error) throw error
}

export const saveChecklistItem = async (item: ChecklistItem, session: Session) => {
  if (!supabase) return
  const { error } = await supabase.from(TABLES.checklistItems).upsert(toChecklist(item, session.user.id))
  if (error) throw error
}

export const deleteChecklistItem = async (id: string) => {
  if (!supabase) return
  const { error } = await supabase.from(TABLES.checklistItems).delete().eq('id', id)
  if (error) throw error
}

export const fillItineraryWithAi = async (command: string, currentItem: ItineraryItem, dayItems: ItineraryItem[] = []): Promise<ItineraryAiPatch> => {
  if (!supabase) throw new Error('AI 기능은 Supabase 연결 후 사용할 수 있습니다.')

  const { data, error } = await supabase.functions.invoke('parse-itinerary-command', {
    body: {
      command,
      currentItem: {
        dayIndex: currentItem.dayIndex,
        date: currentItem.date,
        startTime: currentItem.startTime,
        endTime: currentItem.endTime,
        place: currentItem.place,
        category: currentItem.category,
        title: currentItem.title,
        note: currentItem.note,
        budgetJpy: currentItem.budgetJpy,
        googlePlaceQuery: currentItem.googlePlaceQuery,
      },
      dayContext: dayItems
        .filter((item) => item.date === currentItem.date || item.dayIndex === currentItem.dayIndex)
        .map((item) => ({
          startTime: item.startTime,
          endTime: item.endTime,
          place: item.place,
          category: item.category,
          title: item.title,
          note: item.note,
          googlePlaceQuery: item.googlePlaceQuery,
        })),
      categories,
      trip: {
        title: seedTrip.title,
        destination: seedTrip.destination,
        startDate: seedTrip.startDate,
        endDate: seedTrip.endDate,
      },
    },
  })

  if (error) throw error
  if (!data || typeof data !== 'object') throw new Error('AI 응답 형식이 올바르지 않습니다.')

  const response = data as Record<string, unknown>
  const patch: ItineraryAiPatch = {}
  const startTime = readTime(response.startTime)
  const endTime = readTime(response.endTime)
  const place = readString(response.place)
  const category = response.category
  const title = readString(response.title)
  const note = readString(response.note)
  const budgetJpy = readBudget(response.budgetJpy)
  const googlePlaceQuery = readString(response.googlePlaceQuery)

  if (startTime) patch.startTime = startTime
  if (endTime) patch.endTime = endTime
  if (place !== undefined) patch.place = place
  if (isCategory(category)) patch.category = category
  if (title !== undefined) patch.title = title
  if (note !== undefined) patch.note = note
  if (budgetJpy !== undefined) patch.budgetJpy = budgetJpy
  if (googlePlaceQuery !== undefined) patch.googlePlaceQuery = googlePlaceQuery

  return patch
}
