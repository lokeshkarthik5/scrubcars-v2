import { summariseBehaviour } from '../../lib/behaviour.js'
import { AppError, hasPgCode } from '../../lib/errors.js'
import { istDateKey } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { rangeDays, rangeInstants } from '../../lib/stats.js'
import { behaviourRepository } from './behaviour.repository.js'
import type { BehaviourQuery } from './behaviour.validation.js'

const log = logger.child({ module: 'behaviour' })

/** Postgres's query_canceled: the statement ran past statement_timeout. */
const TIMED_OUT = '57014'

export const behaviourService = {
  /**
   * Statistics → Behaviour: the landing → paid funnel by visits, the last
   * step before leaving, and how many visits were left out (the team's,
   * Test bookings'). Every rule is lib/behaviour.ts. `stepsSince` is when
   * the first of these steps was recorded, so the page can say the figures
   * start from the release that added them.
   */
  async report(query: BehaviourQuery) {
    const range = { from: query.from, to: query.to }
    const { start, end } = rangeInstants(range)
    try {
      const first = await behaviourRepository.stepsSince()
      const groups = await behaviourRepository.sessionGroups({
        start,
        end,
        source: query.source,
        device: query.device,
      })
      return {
        range: { ...range, days: rangeDays(range) },
        source: query.source,
        device: query.device,
        stepsSince: first ? istDateKey(first) : null,
        ...summariseBehaviour(groups),
      }
    } catch (error) {
      if (hasPgCode(error, TIMED_OUT)) {
        log.warn({ err: error }, 'behaviour:timed_out')
        throw new AppError(503, 'These numbers took too long to work out. Try 7 days.', 'STATS_TIMEOUT')
      }
      throw error
    }
  },
}
