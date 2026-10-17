import { describe, expect, test } from 'bun:test'
import {
  MAX_PROPOSAL_SLOTS,
  PROPOSAL_MAX_OPEN_MS,
  PROPOSAL_MIN_ANSWER_MS,
  checkProposedSlots,
  isProposalLive,
  latestProposal,
  liveOptions,
  pickRefusal,
  proposalExpiresAt,
  proposalRefusal,
  proposalSweepAction,
  toProposalView,
  type ProposalRecord,
} from './time-proposals.js'

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000
/** Fri 16 Oct 2026, 09:00 IST. */
const NOW = Date.parse('2026-10-16T03:30:00.000Z')
const at = (ms: number) => new Date(NOW + ms).toISOString()
const BOOKED = new Date(NOW + 2 * HOUR)

describe('proposalRefusal', () => {
  test('only on a pending booking that is paid, with none open', () => {
    expect(proposalRefusal({ status: 'pending', paymentStatus: 'paid', hasOpenProposal: false })).toBeNull()
    expect(proposalRefusal({ status: 'pending', paymentStatus: 'collected', hasOpenProposal: false })).toBeNull()
    expect(proposalRefusal({ status: 'confirmed', paymentStatus: 'paid', hasOpenProposal: false })).toBe('not_pending')
    expect(proposalRefusal({ status: 'cancelled', paymentStatus: 'paid', hasOpenProposal: false })).toBe('not_pending')
    expect(proposalRefusal({ status: 'pending', paymentStatus: 'pending', hasOpenProposal: false })).toBe('not_paid')
    expect(proposalRefusal({ status: 'pending', paymentStatus: null, hasOpenProposal: false })).toBe('not_paid')
    expect(proposalRefusal({ status: 'pending', paymentStatus: 'paid', hasOpenProposal: true })).toBe('already_open')
  })
})

describe('checkProposedSlots', () => {
  const booking = { scheduledAt: BOOKED, bookingType: 'dropin' as const }

  test('one to three distinct times, returned soonest first', () => {
    const result = checkProposedSlots([at(6 * HOUR), at(4 * HOUR)], booking, NOW)
    expect(result).toEqual({
      ok: true,
      slots: [at(4 * HOUR), at(6 * HOUR)],
      // 4h less the 1h drop-in notice is sooner than 12h.
      expiresAt: new Date(NOW + 3 * HOUR),
    })
  })

  test('refuses none, too many, a repeat, nonsense and the booked time itself', () => {
    expect(checkProposedSlots([], booking, NOW)).toEqual({ ok: false, refusal: 'none' })
    const four = [1, 2, 3, 4].map((n) => at((n + 3) * HOUR))
    expect(four.length).toBeGreaterThan(MAX_PROPOSAL_SLOTS)
    expect(checkProposedSlots(four, booking, NOW)).toEqual({ ok: false, refusal: 'too_many' })
    expect(checkProposedSlots([at(4 * HOUR), at(4 * HOUR)], booking, NOW)).toEqual({ ok: false, refusal: 'duplicate' })
    // The same moment written two ways is still the same time.
    expect(
      checkProposedSlots([at(4 * HOUR), '2026-10-16T13:00:00.000+05:30'], booking, NOW)
    ).toEqual({ ok: false, refusal: 'duplicate' })
    expect(checkProposedSlots(['soon'], booking, NOW)).toEqual({ ok: false, refusal: 'invalid' })
    expect(checkProposedSlots([BOOKED.toISOString()], booking, NOW)).toEqual({ ok: false, refusal: 'same_as_booked' })
  })

  test('refuses a set whose soonest time would leave the customer under half an hour to answer', () => {
    // Drop-in: 1h notice. 1h20m away leaves 20 minutes.
    expect(checkProposedSlots([at(HOUR + 20 * MIN)], booking, NOW)).toEqual({ ok: false, refusal: 'too_soon' })
    // Exactly half an hour is enough.
    const edge = checkProposedSlots([at(HOUR + PROPOSAL_MIN_ANSWER_MS)], booking, NOW)
    expect(edge.ok).toBe(true)
    // Doorstep needs 3h of notice, so the same time is too soon there.
    expect(
      checkProposedSlots([at(3 * HOUR + 10 * MIN)], { scheduledAt: BOOKED, bookingType: 'doorstep' }, NOW)
    ).toEqual({ ok: false, refusal: 'too_soon' })
  })
})

describe('proposalExpiresAt', () => {
  test('the earliest option less its booking type’s notice', () => {
    const created = new Date(NOW)
    expect(proposalExpiresAt([at(8 * HOUR), at(5 * HOUR)], 'dropin', created)).toEqual(new Date(NOW + 4 * HOUR))
    expect(proposalExpiresAt([at(8 * HOUR)], 'doorstep', created)).toEqual(new Date(NOW + 5 * HOUR))
    expect(proposalExpiresAt([at(8 * HOUR)], 'pickup', created)).toEqual(new Date(NOW + 5 * HOUR))
  })

  test('or 12 hours after it was made, whichever is sooner', () => {
    const created = new Date(NOW)
    expect(proposalExpiresAt([at(48 * HOUR)], 'dropin', created)).toEqual(new Date(NOW + PROPOSAL_MAX_OPEN_MS))
    expect(PROPOSAL_MAX_OPEN_MS).toBe(12 * HOUR)
  })
})

describe('liveOptions and isProposalLive', () => {
  test('options that no longer give the notice drop out', () => {
    const slots = [at(2 * HOUR), at(5 * HOUR)]
    expect(liveOptions(slots, 'dropin', NOW)).toEqual(slots)
    expect(liveOptions(slots, 'doorstep', NOW)).toEqual([at(5 * HOUR)])
    expect(liveOptions(slots, 'dropin', NOW + 90 * MIN)).toEqual([at(5 * HOUR)])
  })

  test('live only while open, in time, and the booking still pending', () => {
    const open = { status: 'open', expiresAt: new Date(NOW + HOUR) }
    expect(isProposalLive(open, 'pending', NOW)).toBe(true)
    expect(isProposalLive(open, 'pending', NOW + HOUR)).toBe(false)
    expect(isProposalLive(open, 'cancelled', NOW)).toBe(false)
    expect(isProposalLive({ ...open, status: 'withdrawn' }, 'pending', NOW)).toBe(false)
  })
})

describe('proposalSweepAction', () => {
  const open = { status: 'open', expiresAt: new Date(NOW) }

  test('run out with the booking pending: expire (the booking is cancelled)', () => {
    expect(proposalSweepAction(open, 'pending', NOW)).toBe('expire')
    expect(proposalSweepAction(open, 'pending', NOW - 1)).toBeNull()
  })

  test('a booking that changed some other way: close, whatever the time', () => {
    expect(proposalSweepAction(open, 'cancelled', NOW - HOUR)).toBe('close')
    expect(proposalSweepAction(open, 'confirmed', NOW)).toBe('close')
  })

  test('anything already answered is left alone', () => {
    for (const status of ['accepted', 'declined', 'expired', 'withdrawn', 'closed']) {
      expect(proposalSweepAction({ ...open, status }, 'pending', NOW)).toBeNull()
    }
  })
})

describe('pickRefusal', () => {
  const proposal = { status: 'open', expiresAt: new Date(NOW + 3 * HOUR), slots: [at(4 * HOUR), at(6 * HOUR)] }

  test('one of the offered times, while open', () => {
    expect(pickRefusal(proposal, 'pending', 'dropin', at(6 * HOUR), NOW)).toBeNull()
    // Written another way, the same moment.
    expect(pickRefusal(proposal, 'pending', 'dropin', '2026-10-16T13:00:00+05:30', NOW)).toBeNull()
  })

  test('nothing open, a time never offered, or one now too soon', () => {
    expect(pickRefusal(null, 'pending', 'dropin', at(4 * HOUR), NOW)).toBe('not_open')
    expect(pickRefusal(proposal, 'cancelled', 'dropin', at(4 * HOUR), NOW)).toBe('not_open')
    expect(pickRefusal({ ...proposal, status: 'withdrawn' }, 'pending', 'dropin', at(4 * HOUR), NOW)).toBe('not_open')
    expect(pickRefusal(proposal, 'pending', 'dropin', at(5 * HOUR), NOW)).toBe('not_offered')
    // A later option on a suggestion that has not run out, but whose own
    // notice has passed (only possible when the earliest was dropped).
    const late = { ...proposal, expiresAt: new Date(NOW + 10 * HOUR) }
    expect(pickRefusal(late, 'pending', 'dropin', at(4 * HOUR), NOW + 3 * HOUR + 30 * MIN)).toBe('too_soon')
  })
})

describe('toProposalView', () => {
  const record: ProposalRecord = {
    id: 'p1',
    status: 'open',
    slots: [at(4 * HOUR), at(6 * HOUR)],
    note: 'Bay 2 is busy at 11',
    expiresAt: new Date(NOW + 3 * HOUR),
    chosenSlot: null,
    resultBookingId: null,
    resolvedAt: null,
    createdAt: new Date(NOW - HOUR),
  }

  test('open while it can be answered, with the times still on offer', () => {
    expect(toProposalView(record, { status: 'pending', bookingType: 'dropin' }, NOW)).toMatchObject({
      id: 'p1',
      status: 'open',
      options: record.slots,
      note: 'Bay 2 is busy at 11',
      expiresAt: new Date(NOW + 3 * HOUR).toISOString(),
    })
  })

  test('past its time but not yet swept reads expired; one whose booking changed reads closed', () => {
    expect(toProposalView(record, { status: 'pending', bookingType: 'dropin' }, NOW + 3 * HOUR).status).toBe('expired')
    expect(toProposalView(record, { status: 'cancelled', bookingType: 'dropin' }, NOW).status).toBe('closed')
  })

  test('an answered one keeps every time it offered, and what was chosen', () => {
    const accepted = { ...record, status: 'accepted' as const, chosenSlot: new Date(at(6 * HOUR)), resolvedAt: new Date(NOW) }
    expect(toProposalView(accepted, { status: 'cancelled', bookingType: 'dropin' }, NOW + 5 * HOUR)).toMatchObject({
      status: 'accepted',
      options: record.slots,
      chosenSlot: at(6 * HOUR),
    })
  })

  test('the newest of several', () => {
    const older = { ...record, id: 'old', createdAt: new Date(NOW - 5 * HOUR) }
    expect(latestProposal([older, record])?.id).toBe('p1')
    expect(latestProposal([])).toBeNull()
    expect(latestProposal(undefined)).toBeNull()
  })
})
