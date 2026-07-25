import { createSeedData, tripDays } from '../data/seed'
import { sortItineraryItems } from './itinerarySort'
import type { TravelData } from '../types'

const STORAGE_KEY = 'osaka-travel-pwa:data:v4'

const normalizeTravelData = (data: TravelData): TravelData => ({
  ...data,
  days: tripDays.map((day) => ({ ...day })),
  itineraryItems: sortItineraryItems(data.itineraryItems.map((item) => ({
    ...item,
    googlePlaceId: item.googlePlaceId ?? '',
    googleMapsUri: item.googleMapsUri ?? '',
    formattedAddress: item.formattedAddress ?? '',
    lat: item.lat ?? null,
    lng: item.lng ?? null,
    confirmed: Boolean(item.confirmed),
  }))),
  checklistItems: data.checklistItems.map((item) => ({
    ...item,
    kind: item.kind ?? 'task',
    listType: item.listType ?? 'todo',
    packingCategory: item.packingCategory ?? null,
  })),
  memos: (data.memos ?? []).map((memo) => ({ ...memo })),
})

export const readLocalData = (): TravelData => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return createSeedData()

  try {
    return normalizeTravelData(JSON.parse(raw) as TravelData)
  } catch {
    return createSeedData()
  }
}

export const writeLocalData = (data: TravelData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
