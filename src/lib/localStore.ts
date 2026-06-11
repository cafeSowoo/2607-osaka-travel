import { createSeedData } from '../data/seed'
import type { TravelData } from '../types'

const STORAGE_KEY = 'osaka-travel-pwa:data:v4'

const normalizeTravelData = (data: TravelData): TravelData => ({
  ...data,
  checklistItems: data.checklistItems.map((item) => ({
    ...item,
    kind: item.kind ?? 'task',
  })),
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
