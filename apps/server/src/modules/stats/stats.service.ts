import {
  commissionRules,
  garageCommissionStatus,
  queuePositions,
} from '../../lib/commission.js'
import { AppError, hasPgCode } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  bookingsPerDay,
  busyHoursGrid,
  collectedPerPeriod,
  commissionByChain,
  counted,
  isPaid,
  itemsByChain,
  previousRange,
  rangeDays,
  rangeInstants,
  summariseFunnel,
  summariseGarages,
  summariseKpis,
  summariseServiceTypes,
  type StatsRange,
} from '../../lib/stats.js'
import { statsRepository, type StatsReads } from './stats.repository.js'
import type { StatsOverviewQuery, StatsRangeQuery } from './stats.validation.js'

const log = logger.child({ module: 'stats' })

/** Postgres's query_canceled: the statement ran past statement_timeout. */
const TIMED_OUT = '57014'

/**
 * Runs the reads in their read-only transaction. A read that ran out of time
 * is the admin's 503 with something to do about it, not a 500: the period
 * was too long for one go.
 */
async function readOnly<T>(work: (reads: StatsReads) => Promise<T>): Promise<T> {
  try {
    return await statsRepository.readOnly(work)
  } catch (error) {
    if (hasPgCode(error, TIMED_OUT)) {
      log.warn({ err: error }, 'stats:timed_out')
      throw new AppError(
        503,
        'These numbers took too long to work out. Try a shorter period or one garage.',
        'STATS_TIMEOUT'
      )
    }
    throw error
  }
}

/** A range as the page shows it. */
function describe(range: StatsRange) {
  return { from: range.from, to: range.to, days: rangeDays(range) }
}

/** The chains booked in a period, their items and the checkouts that never became one. */
async function periodRows(reads: StatsReads, range: StatsRange, vendorId?: string) {
  const { start, end } = rangeInstants(range)
  const chains = await reads.chains(start, end, vendorId)
  const items = itemsByChain(await reads.chainItems(start, end, vendorId))
  const open = await reads.openCheckouts(start, end, vendorId)
  return { chains, items, open }
}

/**
 * The admin's Statistics, read-only. Every definition is in lib/stats.ts and
 * lib/commission.ts; this only reads the rows those need, in order, inside
 * one read-only transaction per request.
 */
export const statsService = {
  /**
   * The Overview tab: the six tiles, bookings per day and collected per
   * week, and with `compare` the same for the period before (a whole month
   * against the month before, anything else against as many days just
   * before it; lib/stats.ts previousRange).
   */
  async overview(query: StatsOverviewQuery) {
    const range = { from: query.from, to: query.to }
    const previous = query.compare ? previousRange(range) : null

    return readOnly(async (reads) => {
      const current = await periodRows(reads, range, query.vendorId)
      const before = previous ? await periodRows(reads, previous, query.vendorId) : null
      // Each garage's free 25 are counted from its first booking, so the
      // queue reaches back past both periods. The previous period ends
      // before this one does, so one read covers both.
      const positions = queuePositions(await reads.queue(rangeInstants(range).end, query.vendorId))

      const tiles = (period: NonNullable<typeof before>) =>
        summariseKpis(
          period.chains,
          period.open,
          commissionByChain(period.chains, period.items, positions)
        )

      return {
        range: describe(range),
        previous: previous ? describe(previous) : null,
        kpis: tiles(current),
        previousKpis: before ? tiles(before) : null,
        perDay: bookingsPerDay(current.chains, range),
        previousPerDay: before && previous ? bookingsPerDay(before.chains, previous) : null,
        collected: collectedPerPeriod(current.chains, range),
      }
    })
  },

  /**
   * The Breakdown tab: the funnel, garages, service types and busy hours.
   * Money and the funnel go by the day the booking was made; busy hours by
   * the day of the slot.
   */
  async breakdown(query: StatsRangeQuery) {
    const range = { from: query.from, to: query.to }
    const { start, end } = rangeInstants(range)

    return readOnly(async (reads) => {
      const { chains, items, open } = await periodRows(reads, range, query.vendorId)
      const ratings = await reads.ratings(end, query.vendorId)
      const busy = await reads.busyHours(start, end, query.vendorId)

      return {
        range: describe(range),
        funnel: summariseFunnel(chains, open),
        garages: summariseGarages(chains, ratings),
        services: summariseServiceTypes(chains, items),
        busyHours: busyHoursGrid(busy),
      }
    })
  },

  /**
   * The Commission tab: the rule, Detlio's commission on the period's
   * bookings, and which garages pay it and which are still in their free 25
   * as the period ends. For reporting only: nothing here touches a payout.
   */
  async commission(query: StatsRangeQuery) {
    const range = { from: query.from, to: query.to }
    const { start, end } = rangeInstants(range)

    return readOnly(async (reads) => {
      const chains = await reads.chains(start, end, query.vendorId)
      const items = itemsByChain(await reads.chainItems(start, end, query.vendorId))
      const queue = await reads.queue(end, query.vendorId)

      const commission = commissionByChain(chains, items, queuePositions(queue))
      const totals = summariseKpis(chains, { pending: 0, failed: 0 }, commission)
      const garages = garageCommissionStatus(
        queue,
        counted(chains).map((chain) => ({
          rootId: chain.rootId,
          vendorId: chain.vendorId,
          paid: isPaid(chain),
          commission: commission.get(chain.rootId) ?? 0,
        })),
        range
      )

      return {
        range: describe(range),
        rules: commissionRules(),
        commission: totals.commission,
        collected: totals.collected,
        bookings: totals.bookings,
        active: garages.active,
        free: garages.free,
      }
    })
  },
}
