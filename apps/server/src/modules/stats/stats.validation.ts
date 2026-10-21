import { z } from 'zod'
import { isCalendarDate } from '../../lib/booking-ops.js'
import { MAX_RANGE_DAYS, rangeDays } from '../../lib/stats.js'

// The page's filters live in its URL, so a hand-edited date arrives here. One
// that doesn't exist is a 400, not an Invalid Date for the query to choke on.
const istDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
  .refine(isCalendarDate, 'That date does not exist')

/**
 * Every Statistics read: IST calendar dates, both included, and optionally
 * one garage. A range is capped at a year (and a day, for a leap year): each
 * read scans it on the one database connection checkout also uses.
 */
const rangeShape = {
  from: istDateSchema,
  to: istDateSchema,
  vendorId: z.string().uuid().optional(),
}

function checkRange(range: { from: string; to: string }, ctx: z.RefinementCtx) {
  if (range.from > range.to) {
    ctx.addIssue({ code: 'custom', message: "'from' must be on or before 'to'", path: ['from'] })
  } else if (rangeDays(range) > MAX_RANGE_DAYS) {
    ctx.addIssue({
      code: 'custom',
      message: `Pick ${MAX_RANGE_DAYS} days or fewer`,
      path: ['to'],
    })
  }
}

export const statsRangeQuerySchema = z.object(rangeShape).superRefine(checkRange)

/** Overview also takes `compare=1`, for the same figures over the period before. */
export const statsOverviewQuerySchema = z
  .object({
    ...rangeShape,
    compare: z
      .enum(['0', '1'])
      .default('0')
      .transform((value) => value === '1'),
  })
  .superRefine(checkRange)

export type StatsRangeQuery = z.infer<typeof statsRangeQuerySchema>
export type StatsOverviewQuery = z.infer<typeof statsOverviewQuerySchema>
