import type { Booking, EarningsJob, EarningsSummary, Review } from '@/lib/types'

// Earnings read `vendorPayoutAmount`, never `servicePrice`. When Detlio funds a
// promo code the garage is still owed the full pre-discount price, so paying
// them the charged amount would silently dock them for a campaign they did not
// run. The server decides which figure applies; this file just uses it.

function isSettledPayment(status: Booking['paymentStatus']) {
  return status === 'paid' || status === 'collected'
}

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

function isWithinDays(iso: string, days: number) {
  const scheduled = new Date(iso)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return scheduled >= cutoff
}

function isWithinMonths(iso: string, months: number) {
  const scheduled = new Date(iso)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return scheduled >= cutoff
}

function averageRating(reviews: Review[]) {
  if (reviews.length === 0) return 0
  return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
}

function completedBookings(bookings: Booking[]) {
  return bookings.filter((booking) => booking.status === 'completed')
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

  const weekEarnings = completedBookings(bookings)
    .filter((booking) => isWithinDays(booking.scheduledAtIso, 7))
    .filter((booking) => isSettledPayment(booking.paymentStatus))
    .reduce((sum, booking) => sum + booking.vendorPayoutAmount, 0)

  return {
    todaysJobs,
    pendingRequests: pending.length,
    weekEarnings,
    avgRating: averageRating(reviews),
    reviewCount: reviews.length,
  }
}

export function computeEarningsSummary(
  bookings: Booking[],
  reviews: Review[],
  period: 'week' | 'month'
): EarningsSummary {
  const completed = completedBookings(bookings)
  const inPeriod = completed.filter((booking) =>
    period === 'week'
      ? isWithinDays(booking.scheduledAtIso, 7)
      : isWithinMonths(booking.scheduledAtIso, 1)
  )

  const settled = inPeriod.filter((booking) =>
    isSettledPayment(booking.paymentStatus)
  )
  const pending = inPeriod.filter(
    (booking) => !isSettledPayment(booking.paymentStatus)
  )

  return {
    totalEarned: settled.reduce(
      (sum, booking) => sum + booking.vendorPayoutAmount,
      0
    ),
    jobsDone: inPeriod.length,
    pending: pending.reduce(
      (sum, booking) => sum + booking.vendorPayoutAmount,
      0
    ),
    avgRating: averageRating(reviews),
  }
}

export function computeRecentEarningsJobs(bookings: Booking[]): EarningsJob[] {
  return completedBookings(bookings)
    .sort(
      (a, b) =>
        new Date(b.scheduledAtIso).getTime() - new Date(a.scheduledAtIso).getTime()
    )
    .slice(0, 10)
    .map((booking) => ({
      id: booking.id,
      serviceName: booking.serviceName,
      customerName: booking.customerName ?? 'Customer',
      date: booking.scheduledAt,
      type: booking.bookingType,
      amount: booking.vendorPayoutAmount,
      settled: isSettledPayment(booking.paymentStatus),
    }))
}
