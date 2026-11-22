import type { Booking } from './types'

/** Still to happen (or happening): the next one is shown on Profile's bookings tile. */
const UPCOMING = new Set<Booking['status']>(['pending', 'confirmed', 'rescheduled', 'in_progress'])

/**
 * Profile's figures (22 Nov 2026, the Home look): how many bookings (not
 * the cancelled ones), how many garages the customer has finished a job at,
 * and the next booking still to come (one started up to an hour ago still
 * counts). The web and the customer app both read them here.
 */
export function bookingFigures(bookings: readonly Booking[], now: number = Date.now()) {
  const kept = bookings.filter((b) => b.status !== 'cancelled')
  const garages = new Set(kept.filter((b) => b.status === 'completed').map((b) => b.vendorId))
  const next = kept
    .filter((b) => UPCOMING.has(b.status) && Date.parse(b.scheduledAt) >= now - 60 * 60_000)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0]
  return { count: kept.length, garagesTried: garages.size, next: next ?? null }
}
