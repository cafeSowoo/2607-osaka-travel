const TIME_PATTERN = /^(\d{2}):(\d{2})$/

export const normalizeTime = (value: string) => value.trim().slice(0, 5)

export const parseTimeToMinutes = (value: string): number | null => {
  const match = normalizeTime(value).match(TIME_PATTERN)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

export const isValidTime = (value: string) => parseTimeToMinutes(value) !== null

export const formatTimeInput = (value: string, previousValue = '') => {
  const text = value.trim()
  if (/^\d{2}:$/.test(previousValue) && text === previousValue.slice(0, 2)) {
    return text.slice(0, 1)
  }

  const digits = text.replace(/\D/g, '').slice(0, 4)
  if (digits.length < 2) return digits
  if (digits.length === 2) return `${digits}:`
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}
