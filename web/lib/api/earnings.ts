import { apiClient } from './client'
import { MOCK_EARNINGS, MOCK_EARNINGS_JOBS } from '@/lib/mock/data'
import type { EarningsJob, EarningsSummary } from '@/lib/types'

/** GET /vendor/earnings */
export async function getEarningsSummary(
  period: 'week' | 'month' = 'week'
): Promise<EarningsSummary> {
  // TODO: return apiClient<EarningsSummary>('/vendor/earnings', { params: { period } })
  void period
  return MOCK_EARNINGS
}

/** GET /vendor/earnings/jobs */
export async function getRecentEarningsJobs(): Promise<EarningsJob[]> {
  // TODO: return apiClient<EarningsJob[]>('/vendor/earnings/jobs')
  return MOCK_EARNINGS_JOBS
}
