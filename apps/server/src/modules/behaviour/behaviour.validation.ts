import { z } from 'zod'
import { BEHAVIOUR_DEVICES, BEHAVIOUR_SOURCES } from '../../lib/behaviour.js'
import { isCalendarDate } from '../../lib/booking-ops.js'
import { rangeDays } from '../../lib/stats.js'

/** The longest period the tab reads: it groups every event of every visit in it. */
export const MAX_BEHAVIOUR_DAYS = 92

const istDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
  .refine(isCalendarDate, 'That date does not exist')

/**
 * GET /admin/stats/behaviour: IST dates, both included (the page sends the
 * last 7 or 30 days), and the Source and Device filters.
 */
export const behaviourQuerySchema = z
  .object({
    from: istDateSchema,
    to: istDateSchema,
    source: z.enum(BEHAVIOUR_SOURCES).default('all'),
    device: z.enum(BEHAVIOUR_DEVICES).default('all'),
  })
  .superRefine((range, ctx) => {
    if (range.from > range.to) {
      ctx.addIssue({ code: 'custom', message: "'from' must be on or before 'to'", path: ['from'] })
    } else if (rangeDays(range) > MAX_BEHAVIOUR_DAYS) {
      ctx.addIssue({ code: 'custom', message: `Pick ${MAX_BEHAVIOUR_DAYS} days or fewer`, path: ['to'] })
    }
  })

export type BehaviourQuery = z.infer<typeof behaviourQuerySchema>
