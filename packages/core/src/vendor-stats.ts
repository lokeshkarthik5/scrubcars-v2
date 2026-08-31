import type { Booking, Review } from '@repo/core/types'

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
