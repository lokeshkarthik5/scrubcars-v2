import type { PayoutBalance, PayoutLine, PayoutMethod } from './admin'
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

// ─── The statement (0038) ────────────────────────────────────────────────────


/** The garage's Earnings statement: what it is owed, was paid, and each booking. Rupees. */
export interface EarningsStatement {
  /** IST dates, both included: the bookings listed became payable then. */
  range: { from: string; to: string }
  /** Hours within which Detlio pays (24). */
  cycleHours: number
  summary: PayoutBalance & {
    paidThisMonth: number
    /** Bookings received so far toward the free 25 (capped at 25). */
    freeBookings: { used: number; of: number }
  }
  lines: PayoutLine[]
  /** Payouts made in the range, newest first. */
  payouts: Array<{
    id: string
    amount: number
    method: PayoutMethod
    reference: string
    paidAt: string
    coversFrom: string
    coversUpTo: string
  }>
}

/**
 * GET /vendors/me/earnings/statement — vendor_admin only, the active garage's
 * own. With no range, the last 30 days. Unlike getEarningsData this throws:
 * the screen says it could not load rather than showing zeros, which would
 * read as "Detlio owes you nothing".
 */
export async function getEarningsStatement(range?: { from: string; to: string }): Promise<EarningsStatement> {
  return apiClient<EarningsStatement>('/vendors/me/earnings/statement', {
    params: range ? { from: range.from, to: range.to } : undefined,
  })
}
