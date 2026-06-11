import { createSeedData } from '../data/seed'
import type { TravelData } from '../types'

const STORAGE_KEY = 'osaka-travel-pwa:data:v3'

export const readLocalData = (): TravelData => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return createSeedData()

  try {
    return JSON.parse(raw) as TravelData
  } catch {
    return createSeedData()
  }
}

export const writeLocalData = (data: TravelData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
