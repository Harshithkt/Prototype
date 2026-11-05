import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const integer = new Intl.NumberFormat('en-US')
export const formatCount = (value: number) => integer.format(value)

export const formatPct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toFixed(1)}%`

export const formatPts = (value: number | null | undefined) =>
  value === null || value === undefined
    ? '—'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} pts`

// Every date on screen is UTC, matching the database, so a day never shifts
// with the viewer's time zone.
const asDate = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00Z` : value)

export const formatDay = (value: string) =>
  asDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const formatDate = (value: string) =>
  asDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

export const formatTime = (value: string) =>
  asDate(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export const addDays = (day: string, days: number) => {
  const date = asDate(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
