import type { ItineraryItem } from '../types'

const TIME_PATTERN = /^(\d{2}):(\d{2})$/

const timeToMinutes = (value: string) => {
  const match = value.trim().match(TIME_PATTERN)
  if (!match) return Number.POSITIVE_INFINITY

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return Number.POSITIVE_INFINITY

  return hours * 60 + minutes
}

export const compareItineraryItems = (a: ItineraryItem, b: ItineraryItem) => (
  a.dayIndex - b.dayIndex
  || timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  || timeToMinutes(a.endTime) - timeToMinutes(b.endTime)
  || a.sortOrder - b.sortOrder
  || a.title.localeCompare(b.title)
  || a.id.localeCompare(b.id)
)

export const sortItineraryItems = (items: ItineraryItem[]) => [...items].sort(compareItineraryItems)
