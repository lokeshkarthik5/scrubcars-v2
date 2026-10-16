import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { statsService } from './stats.service.js'
import type { StatsOverviewQuery, StatsRangeQuery } from './stats.validation.js'

type StatsContext = Context<{ Variables: AuthVariables }>

export async function getOverview(c: StatsContext, query: StatsOverviewQuery) {
  const data = await statsService.overview(query)
  return c.json({ success: true, data })
}

export async function getBreakdown(c: StatsContext, query: StatsRangeQuery) {
  const data = await statsService.breakdown(query)
  return c.json({ success: true, data })
}

export async function getCommission(c: StatsContext, query: StatsRangeQuery) {
  const data = await statsService.commission(query)
  return c.json({ success: true, data })
}
