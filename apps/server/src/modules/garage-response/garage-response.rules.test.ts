import { describe, expect, test } from 'bun:test'
import { AppError } from '../../lib/errors.js'
import { RESPONSE_SWEEP_LIMIT } from '../../lib/response-deadline.js'
import {
  assertCanStillAnswer,
  garageResponseWith,
  type GarageResponseStore,
  type OverdueRow,
} from './garage-response.rules.js'

// The auto-cancel's rules over an in-memory store that answers as the SQL
// and the conditional write do (garage-response.repository.ts listOverdue,
// bookingsRepository.cancelNotAcceptedInTime).

const ist = (time: string) => new Date(`2026-10-19T${time}:00+05:30`)
const NOW = ist('11:00')

const row = (id: string, over: Partial<OverdueRow> = {}): OverdueRow => ({
  id,
  status: 'pending',
  paymentStatus: 'paid',
  respondBy: ist('10:42'),
  hasOpenProposal: false,
  pickedUpAt: null,
  ...over,
})

function memory(rows: OverdueRow[], options: { enabled?: boolean; lost?: Set<string>; broken?: Set<string> } = {}) {
  const cancelled: string[] = []
  const after: string[] = []
  const errors: Array<{ id: string; step: string }> = []
  let askedLimit: number | null = null
  const store: GarageResponseStore = {
    async listOverdue(now, limit) {
      askedLimit = limit
      return rows
        .filter((r) => r.respondBy !== null && r.respondBy <= now)
        .sort((a, b) => a.respondBy!.getTime() - b.respondBy!.getTime())
        .slice(0, limit)
    },
    async cancel(bookingId) {
      if (options.broken?.has(bookingId)) throw new Error('connection reset')
      // Lost the race: an Accept (or the customer) got there first.
      if (options.lost?.has(bookingId)) return false
      cancelled.push(bookingId)
      return true
    },
  }
  const rules = garageResponseWith({
    store,
    enabled: options.enabled ?? true,
    afterCancel: async (id) => {
      after.push(id)
    },
    onError: (_error, id, step) => errors.push({ id, step }),
  })
  return { rules, cancelled, after, errors, limit: () => askedLimit }
}

describe('the sweep', () => {
  test('off (the default): nothing is read or cancelled', async () => {
    const m = memory([row('a')], { enabled: false })
    expect(await m.rules.sweep({ dryRun: false }, NOW)).toEqual({ enabled: false })
    expect(m.cancelled).toEqual([])
    expect(m.limit()).toBeNull()
  })

  test('cancels overdue paid pending bookings, oldest deadline first, a bounded batch', async () => {
    const m = memory([row('late', { respondBy: ist('10:55') }), row('oldest', { respondBy: ist('09:30') }), row('soon', { respondBy: ist('11:05') })])
    const summary = await m.rules.sweep({ dryRun: false }, NOW)
    expect(m.limit()).toBe(RESPONSE_SWEEP_LIMIT)
    expect(RESPONSE_SWEEP_LIMIT).toBe(20)
    expect(m.cancelled).toEqual(['oldest', 'late'])
    expect(m.after).toEqual(['oldest', 'late'])
    expect(summary).toEqual({ enabled: true, candidates: 2, cancelled: 2, skipped: 0, failed: 0 })
  })

  test('a dry run only counts', async () => {
    const m = memory([row('a'), row('b')])
    expect(await m.rules.sweep({ dryRun: true }, NOW)).toEqual({
      enabled: true,
      candidates: 2,
      cancelled: 0,
      skipped: 0,
      failed: 0,
    })
    expect(m.cancelled).toEqual([])
  })

  test('leaves alone a row the rule does not agree is overdue', async () => {
    const m = memory([
      row('proposal', { hasOpenProposal: true }),
      row('unpaid', { paymentStatus: 'pending' }),
      row('accepted', { status: 'confirmed' }),
      row('due'),
    ])
    const summary = await m.rules.sweep({ dryRun: false }, NOW)
    expect(m.cancelled).toEqual(['due'])
    expect(summary.enabled && summary.skipped).toBe(3)
  })

  test('an Accept that won the race is skipped, not counted as cancelled', async () => {
    const m = memory([row('accepted-meanwhile'), row('due', { respondBy: ist('10:50') })], {
      lost: new Set(['accepted-meanwhile']),
    })
    const summary = await m.rules.sweep({ dryRun: false }, NOW)
    expect(m.cancelled).toEqual(['due'])
    expect(m.after).toEqual(['due'])
    expect(summary).toEqual({ enabled: true, candidates: 2, cancelled: 1, skipped: 1, failed: 0 })
  })

  test('one failing cancel does not stop the rest', async () => {
    const m = memory([row('broken', { respondBy: ist('10:00') }), row('due')], { broken: new Set(['broken']) })
    const summary = await m.rules.sweep({ dryRun: false }, NOW)
    expect(m.cancelled).toEqual(['due'])
    expect(m.errors).toEqual([{ id: 'broken', step: 'cancel' }])
    expect(summary.enabled && summary.failed).toBe(1)
  })

  test('a failure after the cancel committed is logged, never a failed cancel', async () => {
    const store: GarageResponseStore = {
      listOverdue: async () => [row('a')],
      cancel: async () => true,
    }
    const errors: string[] = []
    const rules = garageResponseWith({
      store,
      enabled: true,
      afterCancel: async () => {
        throw new Error('telegram down')
      },
      onError: (_e, _id, step) => errors.push(step),
    })
    expect(await rules.sweep({ dryRun: false }, NOW)).toEqual({
      enabled: true,
      candidates: 1,
      cancelled: 1,
      skipped: 0,
      failed: 0,
    })
    expect(errors).toEqual(['after_cancel'])
  })
})

describe('the 409 on Accept and Suggest times', () => {
  const pending = { status: 'pending', respondBy: ist('10:42'), responseMissedAt: null }

  function refusal(fn: () => void): AppError | null {
    try {
      fn()
      return null
    } catch (error) {
      return error as AppError
    }
  }

  test('past the deadline with the switch on: 409 RESPONSE_TIME_PASSED', () => {
    const error = refusal(() => assertCanStillAnswer(pending, true, NOW.getTime()))
    expect(error).toBeInstanceOf(AppError)
    expect(error?.statusCode).toBe(409)
    expect(error?.code).toBe('RESPONSE_TIME_PASSED')
  })

  test('the cron already cancelled it: 409 whatever the switch says', () => {
    const swept = { status: 'cancelled', respondBy: ist('10:42'), responseMissedAt: ist('10:50') }
    expect(refusal(() => assertCanStillAnswer(swept, false, NOW.getTime()))?.code).toBe('RESPONSE_TIME_PASSED')
  })

  test('before the deadline, with no deadline, or with the switch off: allowed', () => {
    expect(refusal(() => assertCanStillAnswer({ ...pending, respondBy: ist('11:30') }, true, NOW.getTime()))).toBeNull()
    expect(refusal(() => assertCanStillAnswer({ ...pending, respondBy: null }, true, NOW.getTime()))).toBeNull()
    expect(refusal(() => assertCanStillAnswer(pending, false, NOW.getTime()))).toBeNull()
  })
})

describe('how an auto-cancel is represented', () => {
  // The cron cancels with cancelled_by 'vendor' and response_missed_at
  // (bookingsRepository.cancelNotAcceptedInTime). Pinned here: that is what
  // makes the payment owed back in full, the automatic mode treat it as a
  // clear-cut garage decline, and Statistics count it with garage declines.
  const autoCancelled = {
    status: 'cancelled',
    noShow: null,
    cancelledBy: 'vendor' as const,
    cancelledOnBehalfOf: null,
    moved: false,
  }

  test('a full refund is owed', async () => {
    const { bookingPaymentOwed, bookingRefundReason } = await import('../../lib/refunds.js')
    const payment = { status: 'paid', amount: '799.00', refundedAmount: null }
    expect(bookingPaymentOwed(autoCancelled, payment as never)).toBe('799.00')
    expect(bookingRefundReason({ ...autoCancelled, responseMissedAt: ist('10:45') })).toBe('Not accepted in time')
  })

  test('AUTO_REFUNDS reads it as a garage decline', async () => {
    const { autoRefundCause } = await import('../../lib/refund-sending.js')
    expect(autoRefundCause(autoCancelled)).toBe('garage_declined')
  })

  test('the pilot numbers count it with the garage', async () => {
    const { cancelledBy } = await import('../../lib/pilot-stats.js')
    expect(cancelledBy({ ...autoCancelled, cancelledOnBehalfOf: null })).toBe('garage')
  })
})
