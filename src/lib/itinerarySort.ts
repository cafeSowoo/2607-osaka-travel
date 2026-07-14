import type { ItineraryItem } from '../types'
import { parseTimeToMinutes } from './time'

const sortableTime = (value: string) => parseTimeToMinutes(value) ?? Number.POSITIVE_INFINITY

export const compareItineraryItems = (a: ItineraryItem, b: ItineraryItem) => (
  a.dayIndex - b.dayIndex
  || sortableTime(a.startTime) - sortableTime(b.startTime)
  || sortableTime(a.endTime) - sortableTime(b.endTime)
  || a.sortOrder - b.sortOrder
  || a.title.localeCompare(b.title)
  || a.id.localeCompare(b.id)
)

export const sortItineraryItems = (items: ItineraryItem[]) => [...items].sort(compareItineraryItems)
