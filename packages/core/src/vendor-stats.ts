import type { Booking, Review } from '@repo/core/types'
import { APP_TIMEZONE } from '@repo/core/utils'

// The earnings computations that used to live here moved to the server, behind
// GET /vendors/me/earnings and a vendor_admin check. They read
// `vendorPayoutAmount`, which the vendor booking payload no longer carries —
// deliberately, so an operator's client cannot reconstruct the money from a
// list of jobs.
//
// What is left is the non-money half of the dashboard, which every member sees.

function startOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function isSameDay(iso: string, date: Date) {
  const scheduled = startOfDay(new Date(iso))
  const target = startOfDay(date)
  return scheduled.getTime() === target.getTime()
}

function averageRating(reviews: Review[]) {
  if (reviews.length === 0) return 0
  return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
}

export function computeVendorDashboardStats(
  bookings: Booking[],
  reviews: Review[]
) {
  const today = new Date()
  const pending = bookings.filter((booking) => booking.status === 'pending')
  const todaysJobs = bookings.filter(
    (booking) =>
      ['confirmed', 'in_progress'].includes(booking.status) &&
      isSameDay(booking.scheduledAtIso, today)
  ).length

  return {
    todaysJobs,
    pendingRequests: pending.length,
    avgRating: averageRating(reviews),
    reviewCount: reviews.length,
  }
}

/**
 * The garage home's hello, by the hour in Chennai rather than the phone's own
 * zone. It said "Good morning" at every hour, which is the kind of small
 * untruth that makes the rest of a screen easier to doubt.
 */
export function greetingFor(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: APP_TIMEZONE,
    }).format(now)
  )
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * An average rating to one decimal: "4.3", and "4.0" rather than "4", so a
 * figure never reads as more exact than it is ("4.333333") or less.
 *
 * Ratings run from 1 to 5, so an average of 0 can only mean nobody has
 * reviewed the garage yet. That is a dash, not "0.0": a zero reads as a
 * zero-star rating, which nobody gave. Every pilot garage starts there.
 */
export function formatRating(average: number): string {
  if (!(average > 0)) return '–'
  return (Math.round(average * 10) / 10).toFixed(1)
}

/** "1 review", "3 reviews", or "No reviews yet" — never "1 reviews". */
export function reviewCountLabel(count: number): string {
  if (count === 0) return 'No reviews yet'
  return `${count} review${count === 1 ? '' : 's'}`
}
