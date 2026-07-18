import { getVendorBookings } from './bookings'
import { getVendorReviews } from './reviews'
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

/** Fetches bookings + reviews in parallel and derives both summary and recent jobs. */
export async function getEarningsData(
  vendorId: string,
  period: 'week' | 'month' = 'week'
): Promise<{ summary: EarningsSummary; jobs: EarningsJob[] }> {
  try {
    const [bookings, reviews] = await Promise.all([
      getVendorBookings(),
      getVendorReviews(vendorId).catch(() => []),
    ])
    return {
      summary: computeEarningsSummary(bookings, reviews, period),
      jobs: computeRecentEarningsJobs(bookings),
    }
  } catch {
    return { summary: EMPTY_EARNINGS_SUMMARY, jobs: [] }
  }
}
