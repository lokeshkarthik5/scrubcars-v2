import { getVendorBookings } from './bookings'
import { getVendorReviews } from './reviews'
import { getMyVendor } from './vendors'
import {
  computeEarningsSummary,
  computeRecentEarningsJobs,
} from '@/lib/vendor-stats'
import type { EarningsJob, EarningsSummary } from '@/lib/types'

export const EMPTY_EARNINGS_SUMMARY: EarningsSummary = {
  totalEarned: 0,
  jobsDone: 0,
  pending: 0,
  avgRating: 0,
}

async function getVendorReviewData() {
  try {
    const vendor = await getMyVendor()
    return getVendorReviews(vendor.id)
  } catch {
    return []
  }
}

/** Derived from vendor bookings + reviews until a dedicated earnings API exists. */
export async function getEarningsSummary(
  period: 'week' | 'month' = 'week'
): Promise<EarningsSummary> {
  try {
    const [bookings, reviews] = await Promise.all([
      getVendorBookings(),
      getVendorReviewData(),
    ])

    return computeEarningsSummary(bookings, reviews, period)
  } catch {
    return EMPTY_EARNINGS_SUMMARY
  }
}

/** Derived from completed vendor bookings. */
export async function getRecentEarningsJobs(): Promise<EarningsJob[]> {
  try {
    const bookings = await getVendorBookings()
    return computeRecentEarningsJobs(bookings)
  } catch {
    return []
  }
}
