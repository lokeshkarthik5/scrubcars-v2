import { apiClient } from './client'
import type { EarningsJob, EarningsSummary } from '@repo/core/types'
import { formatScheduledAt } from './mappers'
import { formatServiceSummary } from '@repo/core/utils'

export const EMPTY_EARNINGS_SUMMARY: EarningsSummary = {
  totalEarned: 0,
  jobsDone: 0,
  pending: 0,
  avgRating: 0,
}

interface ApiEarnings {
  summary: EarningsSummary
  weekEarnings: number
  jobs: {
    id: string
    serviceName: string
    serviceNames?: string[]
    customerName: string
    scheduledAt: string
    bookingType: string
    amount: number
    settled: boolean
    /** Absent from servers older than no-show earnings. */
    kind?: 'job' | 'customer_no_show'
  }[]
}

export interface EarningsData {
  summary: EarningsSummary
  /** Always the trailing week, whatever period was asked for. */
  weekEarnings: number
  jobs: EarningsJob[]
}

export const EMPTY_EARNINGS: EarningsData = {
  summary: EMPTY_EARNINGS_SUMMARY,
  weekEarnings: 0,
  jobs: [],
}

/**
 * GET /vendors/me/earnings — vendor_admin only.
 *
 * This used to be derived on the client from the vendor booking list. It is a
 * server call now because the figures it needs are no longer in that list: the
 * payout split and discount breakdown are absent from every vendor booking
 * payload, so there is nothing to reconstruct them from. An operator's client
 * never calls this, and would get a 403 if it did.
 */
export async function getEarningsData(
  period: 'week' | 'month' = 'week'
): Promise<EarningsData> {
  try {
    const data = await apiClient<ApiEarnings>('/vendors/me/earnings', {
      params: { period },
    })

    return {
      summary: data.summary,
      weekEarnings: data.weekEarnings,
      jobs: data.jobs.map((job) => ({
        id: job.id,
        // Every service on the job, collapsed to one line. Falls back to the
        // deprecated single name for a response that predates the list.
        serviceName: formatServiceSummary(
          job.serviceNames ?? [job.serviceName]
        ),
        customerName: job.customerName,
        date: formatScheduledAt(job.scheduledAt),
        type: job.bookingType as EarningsJob['type'],
        amount: job.amount,
        settled: job.settled,
        kind: job.kind ?? 'job',
      })),
    }
  } catch {
    return EMPTY_EARNINGS
  }
}
