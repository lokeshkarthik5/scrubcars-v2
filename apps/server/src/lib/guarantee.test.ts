import { describe, expect, test } from 'bun:test'
import { bannedPhraseIn } from './copy-rules.js'
import {
  GUARANTEE_RULES,
  withdrawRefusal,
  withdrawnClaim,
  CLOSED_STATUSES,
  REDO_MONEY,
  REDO_WORDS,
  approvedForRedo,
  canBeRedone,
  claimDeadline,
  claimInputProblem,
  claimOverdue,
  claimRefusal,
  claimRefusalMessage,
  claimsLeft,
  customerStatusLine,
  decidableFrom,
  decisionRefusal,
  garageAnswerRefusal,
  garageReviewBy,
  garageTimedOut,
  isClaimPhotoKey,
  limitReached,
  nextClaimMove,
  redoBookBy,
  redoDates,
  redoTimeRefusal,
  reviewFlags,
  routeClaim,
  type ClaimableBooking,
  type CustomerClaimHistory,
} from './guarantee.js'
import type { GarageCalendar } from './response-deadline.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Mon 12 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-12T06:30:00Z')
const COMPLETED = new Date(NOW.getTime() - 2 * HOUR)

function booking(overrides: Partial<ClaimableBooking> = {}): ClaimableBooking {
  return {
    status: 'completed',
    completedAt: COMPLETED,
    markedTestAt: null,
    guaranteeRedo: false,
    paymentMethod: 'online',
    payment: { status: 'paid', amount: '600.00', creditAmount: '0.00', refundedAmount: null },
    items: [{ category: 'car_wash', pricingType: 'fixed', memberCategories: [] }],
    ...overrides,
  }
}

const OPEN = { hasClaim: false, limitReached: false, now: NOW }

function history(overrides: Partial<CustomerClaimHistory> = {}): CustomerClaimHistory {
  return {
    completedBookings: 5,
    completedBefore: 4,
    claimsBefore: 0,
    approvedRecently: 0,
    undecided: 0,
    ...overrides,
  }
}

// A garage open 09:00–21:00 IST every day, no holidays, not paused.
const EVERY_DAY: GarageCalendar = {
  pausedAt: null,
  closures: [],
  hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00:00',
    closeTime: '21:00:00',
    isClosed: false,
  })),
}

describe('rule 1: which jobs can be claimed on', () => {
  test('a completed, paid car wash is eligible', () => {
    expect(claimRefusal(booking(), OPEN)).toBeNull()
  })

  test('detailing, and a package of only washes and detailing, are eligible', () => {
    expect(canBeRedone([{ category: 'detailing', pricingType: 'fixed' }])).toBe(true)
    expect(
      canBeRedone([{ category: 'package', pricingType: 'fixed', memberCategories: ['car_wash', 'detailing'] }])
    ).toBe(true)
  })

  test('coating, scratch removal, others and inspection jobs go through complaints', () => {
    for (const category of ['coating', 'scratch_removal', 'others'] as const) {
      expect(claimRefusal(booking({ items: [{ category, pricingType: 'fixed' }] }), OPEN)).toBe('not_redoable')
    }
    expect(claimRefusal(booking({ items: [{ category: 'detailing', pricingType: 'on_inspection' }] }), OPEN)).toBe(
      'not_redoable'
    )
    // A wash with a coating on the same booking: the coating cannot be "redone".
    expect(
      claimRefusal(
        booking({ items: [{ category: 'car_wash', pricingType: 'fixed' }, { category: 'coating', pricingType: 'fixed' }] }),
        OPEN
      )
    ).toBe('not_redoable')
    // A package with a coating inside it, or with no members read.
    expect(canBeRedone([{ category: 'package', pricingType: 'fixed', memberCategories: ['car_wash', 'coating'] }])).toBe(false)
    expect(canBeRedone([{ category: 'package', pricingType: 'fixed', memberCategories: [] }])).toBe(false)
    expect(canBeRedone([])).toBe(false)
  })

  test('only a completed job', () => {
    for (const status of ['pending', 'confirmed', 'in_progress', 'cancelled']) {
      expect(claimRefusal(booking({ status }), OPEN)).toBe('not_completed')
    }
    expect(claimRefusal(booking({ completedAt: null }), OPEN)).toBe('not_completed')
  })

  test('never a Test-marked booking, nor a redo itself', () => {
    expect(claimRefusal(booking({ markedTestAt: NOW }), OPEN)).toBe('test_booking')
    expect(claimRefusal(booking({ guaranteeRedo: true }), OPEN)).toBe('is_redo')
  })

  test('paid through Detlio: online, money landed, not refunded', () => {
    expect(claimRefusal(booking({ paymentMethod: 'cash', payment: { status: 'collected', amount: '600.00' } }), OPEN)).toBe(
      'not_paid'
    )
    expect(claimRefusal(booking({ payment: null }), OPEN)).toBe('not_paid')
    expect(claimRefusal(booking({ payment: { status: 'pending', amount: '600.00' } }), OPEN)).toBe('not_paid')
    expect(claimRefusal(booking({ payment: { status: 'paid', amount: '0.00', creditAmount: '0.00' } }), OPEN)).toBe(
      'not_paid'
    )
    // Paid wholly with Detlio credit is paid through Detlio.
    expect(claimRefusal(booking({ payment: { status: 'paid', amount: '0.00', creditAmount: '600.00' } }), OPEN)).toBeNull()
    expect(claimRefusal(booking({ payment: { status: 'refunded', amount: '600.00', refundedAmount: '600.00' } }), OPEN)).toBe(
      'refunded'
    )
    expect(claimRefusal(booking({ payment: { status: 'paid', amount: '600.00', refundedAmount: '100.00' } }), OPEN)).toBe(
      'refunded'
    )
  })

  test('one claim per booking', () => {
    expect(claimRefusal(booking(), { ...OPEN, hasClaim: true })).toBe('already_claimed')
  })
})

describe('rule 2: within 48 hours of completion', () => {
  test('the deadline is completion plus 48 hours, inclusive', () => {
    expect(claimDeadline(COMPLETED).getTime()).toBe(COMPLETED.getTime() + 48 * HOUR)
    const atDeadline = new Date(COMPLETED.getTime() + 48 * HOUR)
    expect(claimRefusal(booking(), { ...OPEN, now: atDeadline })).toBeNull()
    const after = new Date(atDeadline.getTime() + 1)
    expect(claimRefusal(booking(), { ...OPEN, now: after })).toBe('window_closed')
  })
})

describe('rule 3: evidence', () => {
  const keys = (n: number) => Array.from({ length: n }, (_, i) => `k${i}`)

  test('at least 2 photos, at most 6, no duplicates', () => {
    expect(claimInputProblem({ issues: ['missed_spots'], photoKeys: keys(1) })).toBe('too_few_photos')
    expect(claimInputProblem({ issues: ['missed_spots'], photoKeys: keys(2) })).toBeNull()
    expect(claimInputProblem({ issues: ['missed_spots'], photoKeys: keys(6) })).toBeNull()
    expect(claimInputProblem({ issues: ['missed_spots'], photoKeys: keys(7) })).toBe('too_many_photos')
    expect(claimInputProblem({ issues: ['missed_spots'], photoKeys: ['a', 'a'] })).toBe('duplicate_photos')
  })

  test('what is wrong, from the list; "Something else" needs words', () => {
    expect(claimInputProblem({ issues: [], photoKeys: keys(2) })).toBe('no_issue')
    expect(claimInputProblem({ issues: ['other'], otherText: '  ', photoKeys: keys(2) })).toBe('other_needs_text')
    expect(claimInputProblem({ issues: ['other'], otherText: 'Seats wet', photoKeys: keys(2) })).toBeNull()
  })

  test("a photo key must be this booking's claim folder, minted by the presign", () => {
    const vendor = 'e2e00000-0000-4000-8000-000000003110'
    const job = 'e2e00000-0000-4000-8000-000000003120'
    const good = `vendors/${vendor}/job-photos/${job}/guarantee/0b9a4c1e-1111-4222-8333-444455556666.jpg`
    expect(isClaimPhotoKey(good, vendor, job)).toBe(true)
    // The garage's own photos, the customer's condition photos, another job, another garage.
    expect(isClaimPhotoKey(good.replace('/guarantee/', '/'), vendor, job)).toBe(false)
    expect(isClaimPhotoKey(good.replace('/guarantee/', '/customer/'), vendor, job)).toBe(false)
    expect(isClaimPhotoKey(good, vendor, 'e2e00000-0000-4000-8000-000000003121')).toBe(false)
    expect(isClaimPhotoKey(good, 'e2e00000-0000-4000-8000-000000003111', job)).toBe(false)
    expect(isClaimPhotoKey(`${good}/../../x.jpg`, vendor, job)).toBe(false)
  })
})

describe('rule 4: photos decide the route', () => {
  test("the garage's before and after photos send it to the garage", () => {
    const routed = routeClaim({ garagePhotos: { before: 2, after: 3 }, photosWaived: false, history: history() })
    expect(routed).toEqual({ route: 'garage', reasons: ['garage_photos'], status: 'waiting_garage' })
  })

  test('no photos, or only half of them, approve the redo at once: no photos, no defence', () => {
    for (const garagePhotos of [{ before: 0, after: 0 }, { before: 2, after: 1 }, { before: 1, after: 4 }]) {
      const routed = routeClaim({ garagePhotos, photosWaived: false, history: history() })
      expect(routed).toEqual({ route: 'auto', reasons: ['no_garage_photos'], status: 'redo_approved' })
    }
  })

  test('a job whose photos Detlio waived goes to Detlio', () => {
    const routed = routeClaim({ garagePhotos: { before: 0, after: 0 }, photosWaived: true, history: history() })
    expect(routed).toEqual({ route: 'detlio', reasons: ['photos_waived'], status: 'needs_detlio' })
  })
})

describe('rule 7: misuse limits', () => {
  test('at most 2 approved claims in 6 months, counting the ones still waiting', () => {
    expect(limitReached({ approvedRecently: 1, undecided: 0 })).toBe(false)
    expect(limitReached({ approvedRecently: 2, undecided: 0 })).toBe(true)
    expect(limitReached({ approvedRecently: 1, undecided: 1 })).toBe(true)
    expect(limitReached({ approvedRecently: 0, undecided: 2 })).toBe(true)
    expect(claimRefusal(booking(), { ...OPEN, limitReached: true })).toBe('limit_reached')
    expect(GUARANTEE_RULES.approvedClaimsWindowDays).toBe(183)
  })

  test('claims left is for admin only, and never below zero', () => {
    expect(claimsLeft({ approvedRecently: 0, undecided: 0 })).toBe(2)
    expect(claimsLeft({ approvedRecently: 1, undecided: 0 })).toBe(1)
    expect(claimsLeft({ approvedRecently: 3, undecided: 1 })).toBe(0)
  })

  test("the customer is never told it was the limit", () => {
    const message = claimRefusalMessage('limit_reached')
    expect(message).not.toMatch(/limit|2|two|6 months|claims left/i)
  })

  test("a customer's first-ever booking always goes to Detlio, even with no garage photos", () => {
    const first = history({ completedBookings: 1, completedBefore: 0 })
    expect(reviewFlags(first)).toEqual(['first_booking'])
    const routed = routeClaim({ garagePhotos: { before: 0, after: 0 }, photosWaived: false, history: first })
    expect(routed.route).toBe('detlio')
    expect(routed.status).toBe('needs_detlio')
    expect(routed.reasons).toEqual(['first_booking', 'no_garage_photos'])
    // And with photos: still Detlio, never the garage alone.
    expect(routeClaim({ garagePhotos: { before: 2, after: 2 }, photosWaived: false, history: first }).route).toBe('detlio')
  })

  test('claims over 30% of completed bookings (with 3 or more) need Detlio every time', () => {
    // 3 bookings, this is the 2nd claim: 2/3 = 67%.
    const often = history({ completedBookings: 3, completedBefore: 2, claimsBefore: 1 })
    expect(reviewFlags(often)).toEqual(['high_claim_rate'])
    expect(routeClaim({ garagePhotos: { before: 0, after: 0 }, photosWaived: false, history: often }).route).toBe('detlio')
    // 10 bookings, 3rd claim: exactly 30% is not over.
    expect(reviewFlags(history({ completedBookings: 10, completedBefore: 9, claimsBefore: 2 }))).toEqual([])
    // 10 bookings, 4th claim: 40%.
    expect(reviewFlags(history({ completedBookings: 10, completedBefore: 9, claimsBefore: 3 }))).toEqual(['high_claim_rate'])
    // Under 3 completed bookings the rate is not judged (the first-booking rule covers new customers).
    expect(reviewFlags(history({ completedBookings: 2, completedBefore: 1, claimsBefore: 1 }))).toEqual([])
  })

  test('a redo cannot be claimed on', () => {
    expect(claimRefusal(booking({ guaranteeRedo: true }), OPEN)).toBe('is_redo')
  })
})

describe("rule 5: the garage's 12 hours", () => {
  test('12 hours of opening hours, walking over closing time', () => {
    // Claimed at 12:00 IST on a 09–21 garage: 9 h today, 3 h tomorrow → 12:00 IST tomorrow.
    expect(garageReviewBy(NOW, EVERY_DAY).toISOString()).toBe('2026-10-13T06:30:00.000Z')
    // Claimed at 22:00 IST (shut): the clock starts at 09:00 and runs to 21:00 tomorrow.
    const night = new Date('2026-10-12T16:30:00Z')
    expect(garageReviewBy(night, EVERY_DAY).toISOString()).toBe('2026-10-13T15:30:00.000Z')
  })

  test('never more than 48 hours away, and a plain 12 hours for a garage that never opens', () => {
    const shortDays: GarageCalendar = {
      ...EVERY_DAY,
      hours: EVERY_DAY.hours.map((row) => ({ ...row, openTime: '10:00:00', closeTime: '12:00:00' })),
    }
    expect(garageReviewBy(NOW, shortDays).getTime()).toBe(NOW.getTime() + 48 * HOUR)
    const paused: GarageCalendar = { ...EVERY_DAY, pausedAt: NOW }
    expect(garageReviewBy(NOW, paused).getTime()).toBe(NOW.getTime() + 12 * HOUR)
    const neverOpen: GarageCalendar = { ...EVERY_DAY, hours: [] }
    expect(garageReviewBy(NOW, neverOpen).getTime()).toBe(NOW.getTime() + 12 * HOUR)
  })

  test('accept any time while waiting; dispute only inside the time', () => {
    const waiting = { status: 'waiting_garage' as const, garageRespondBy: new Date(NOW.getTime() + HOUR) }
    expect(garageAnswerRefusal(waiting, 'accept', NOW)).toBeNull()
    expect(garageAnswerRefusal(waiting, 'dispute', NOW)).toBeNull()
    const late = new Date(NOW.getTime() + 2 * HOUR)
    expect(garageAnswerRefusal(waiting, 'dispute', late)).toBe('time_passed')
    expect(garageAnswerRefusal(waiting, 'accept', late)).toBeNull()
    expect(garageAnswerRefusal({ ...waiting, status: 'needs_detlio' }, 'accept', NOW)).toBe('not_waiting')
  })

  test('no answer in time is treated as accepted', () => {
    const waiting = {
      status: 'waiting_garage' as const,
      garageRespondBy: new Date(NOW.getTime() - 1),
      redoBookBy: null,
      redoBookingId: null,
    }
    expect(garageTimedOut(waiting, NOW)).toBe(true)
    const move = nextClaimMove(waiting, null, NOW)
    expect(move).toEqual({
      status: 'redo_approved',
      approvedAt: NOW,
      redoBookBy: new Date(NOW.getTime() + 7 * DAY),
      garageResponse: 'timed_out',
    })
    // Still inside the time: nothing moves.
    expect(nextClaimMove({ ...waiting, garageRespondBy: new Date(NOW.getTime() + 1) }, null, NOW)).toBeNull()
  })

  test('accepting approves a redo to book within 7 days', () => {
    expect(approvedForRedo(NOW)).toEqual({ status: 'redo_approved', approvedAt: NOW, redoBookBy: redoBookBy(NOW) })
    expect(redoBookBy(NOW).getTime() - NOW.getTime()).toBe(7 * DAY)
  })
})

describe("rule 6: Detlio's decision", () => {
  test('anything while undecided; only a refund once a redo is approved; nothing once booked or closed', () => {
    for (const decision of ['redo', 'refund', 'reject'] as const) {
      expect(decisionRefusal('needs_detlio', decision)).toBeNull()
      expect(decisionRefusal('waiting_garage', decision)).toBeNull()
      expect(decisionRefusal('redo_booked', decision)).toBe('redo_booked')
      for (const closed of ['redo_done', 'refund_approved', 'rejected', 'lapsed'] as const) {
        expect(decisionRefusal(closed, decision)).toBe('closed')
      }
    }
    expect(decisionRefusal('redo_approved', 'refund')).toBeNull()
    expect(decisionRefusal('redo_approved', 'redo')).toBe('not_for_approved')
    expect(decisionRefusal('redo_approved', 'reject')).toBe('not_for_approved')
  })

  test("the write's states match the rule", () => {
    expect(decidableFrom('refund')).toEqual(['waiting_garage', 'needs_detlio', 'redo_approved'])
    expect(decidableFrom('redo')).toEqual(['waiting_garage', 'needs_detlio'])
    expect(decidableFrom('reject')).toEqual(['waiting_garage', 'needs_detlio'])
  })

  test('overdue: Detlio past its 24 hours, or the garage past its time', () => {
    expect(
      claimOverdue({ status: 'needs_detlio', garageRespondBy: null, detlioDecideBy: new Date(NOW.getTime() - 1) }, NOW)
    ).toBe(true)
    expect(
      claimOverdue({ status: 'needs_detlio', garageRespondBy: null, detlioDecideBy: new Date(NOW.getTime() + 1) }, NOW)
    ).toBe(false)
    expect(
      claimOverdue({ status: 'waiting_garage', garageRespondBy: new Date(NOW.getTime() - 1), detlioDecideBy: null }, NOW)
    ).toBe(true)
    expect(claimOverdue({ status: 'redo_booked', garageRespondBy: null, detlioDecideBy: null }, NOW)).toBe(false)
  })
})

describe('the redo', () => {
  test('costs nothing on every figure', () => {
    expect(REDO_MONEY.amount).toBe('0.00')
    expect(REDO_MONEY.subtotalAmount).toBe('0.00')
    expect(REDO_MONEY.discountAmount).toBe('0.00')
    expect(REDO_MONEY.payment).toEqual({ amount: '0.00', creditAmount: '0.00', status: 'paid' })
  })

  test('only inside the 7 days, at a time the slot rule offers', () => {
    const bookBy = redoBookBy(NOW)
    const base = { status: 'redo_approved' as const, redoBookBy: bookBy, scheduledAt: new Date(NOW.getTime() + DAY), offered: true, now: NOW }
    expect(redoTimeRefusal(base)).toBeNull()
    expect(redoTimeRefusal({ ...base, offered: false })).toBe('not_offered')
    expect(redoTimeRefusal({ ...base, scheduledAt: new Date(bookBy.getTime() + 1) })).toBe('past_window')
    expect(redoTimeRefusal({ ...base, now: new Date(bookBy.getTime() + 1) })).toBe('too_late')
    expect(redoTimeRefusal({ ...base, status: 'waiting_garage' })).toBe('not_approved')
    expect(redoTimeRefusal({ ...base, status: 'redo_booked' })).toBe('not_approved')
  })

  test('the days on offer: today to the last day of the window', () => {
    const days = redoDates(NOW, redoBookBy(NOW))
    expect(days[0]).toBe('2026-10-12')
    expect(days.at(-1)).toBe('2026-10-19')
    expect(days.length).toBe(8)
  })

  const booked = {
    status: 'redo_booked' as const,
    garageRespondBy: null,
    redoBookBy: new Date(NOW.getTime() + 3 * DAY),
    redoBookingId: 'r1',
  }
  const redo = (overrides: object = {}) => ({
    status: 'confirmed',
    noShow: null,
    cancelledBy: null,
    cancelledOnBehalfOf: null,
    ...overrides,
  }) as Parameters<typeof nextClaimMove>[1]

  test('done when the redo is completed', () => {
    expect(nextClaimMove(booked, redo({ status: 'completed' }), NOW)).toEqual({ status: 'redo_done', closeReason: 'redo_done' })
    expect(nextClaimMove(booked, redo(), NOW)).toBeNull()
  })

  test('a customer no-show on the redo closes the claim, with nothing more owed', () => {
    expect(
      nextClaimMove(booked, redo({ status: 'cancelled', noShow: 'customer', cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio' }), NOW)
    ).toEqual({ status: 'lapsed', closeReason: 'redo_no_show' })
  })

  test('the customer cancelling lets them pick again inside the window, else it closes', () => {
    expect(nextClaimMove(booked, redo({ status: 'cancelled', cancelledBy: 'user' }), NOW)).toEqual({
      status: 'redo_approved',
      clearRedo: true,
    })
    expect(
      nextClaimMove(booked, redo({ status: 'cancelled', cancelledBy: 'admin', cancelledOnBehalfOf: 'customer' }), NOW)
    ).toEqual({ status: 'redo_approved', clearRedo: true })
    const past = { ...booked, redoBookBy: new Date(NOW.getTime() - 1) }
    expect(nextClaimMove(past, redo({ status: 'cancelled', cancelledBy: 'user' }), NOW)).toEqual({
      status: 'lapsed',
      closeReason: 'redo_not_booked',
      clearRedo: true,
    })
  })

  test("the garage's side (a garage no-show, its cancel or Detlio's) goes back to Detlio", () => {
    for (const r of [
      redo({ status: 'cancelled', noShow: 'garage', cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio' }),
      redo({ status: 'cancelled', cancelledBy: 'vendor' }),
      redo({ status: 'cancelled', cancelledBy: 'admin', cancelledOnBehalfOf: 'garage' }),
      redo({ status: 'cancelled', cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio' }),
    ]) {
      expect(nextClaimMove(booked, r, NOW)).toEqual({
        status: 'needs_detlio',
        detlioDecideBy: new Date(NOW.getTime() + 24 * HOUR),
        clearRedo: true,
      })
    }
  })

  test('an approved redo not booked in 7 days closes', () => {
    const approved = { status: 'redo_approved' as const, garageRespondBy: null, redoBookBy: new Date(NOW.getTime() - 1), redoBookingId: null }
    expect(nextClaimMove(approved, null, NOW)).toEqual({ status: 'lapsed', closeReason: 'redo_not_booked' })
    expect(nextClaimMove({ ...approved, redoBookBy: new Date(NOW.getTime() + 1) }, null, NOW)).toBeNull()
  })

  test('a redo booking that is gone (the test-data reset) is as if never booked', () => {
    expect(nextClaimMove(booked, null, NOW)).toEqual({ status: 'redo_approved', clearRedo: true })
  })
})

describe('words', () => {
  test("notifications and Updates say free redo, never the banned word", () => {
    const lines = [
      REDO_WORDS.sentTitle,
      REDO_WORDS.sentBodyGarage('Shine Hub', NOW),
      REDO_WORDS.sentBodyDetlio,
      REDO_WORDS.approvedTitle,
      REDO_WORDS.approvedBody('Shine Hub'),
      REDO_WORDS.refundTitle,
      REDO_WORDS.notApprovedTitle,
      REDO_WORDS.notApprovedBody,
      REDO_WORDS.closedTitle,
    ]
    for (const line of lines) expect(bannedPhraseIn(line)).toBeNull()
  })

  test("the customer's status line for each state", () => {
    const base = {
      garageName: 'Shine Hub',
      garageRespondBy: new Date('2026-10-13T06:30:00Z'),
      redoBookBy: null,
      redoScheduledAt: null,
      closeReason: null,
      decisionReason: null,
    }
    expect(customerStatusLine({ ...base, status: 'waiting_garage' }).title).toBe('Waiting for Shine Hub')
    expect(customerStatusLine({ ...base, status: 'waiting_garage' }).body).toContain('Tue 13 Oct, 12 PM')
    expect(customerStatusLine({ ...base, status: 'redo_booked', redoScheduledAt: new Date('2026-10-14T04:30:00Z') }).title).toBe(
      'Redo booked for Wed 14 Oct, 10 AM'
    )
    expect(customerStatusLine({ ...base, status: 'refund_approved' }).title).toBe('Refund approved')
    expect(customerStatusLine({ ...base, status: 'rejected', decisionReason: 'The photos show a clean car.' })).toEqual({
      title: 'Not approved',
      body: 'The photos show a clean car.',
    })
    expect(customerStatusLine({ ...base, status: 'lapsed', closeReason: 'redo_no_show' }).body).toMatch(/missed/)
  })
})

describe('the customer withdraws (0066): only while nobody has answered', () => {
  const now = new Date('2026-10-13T06:00:00Z')
  const unanswered = { garageResponse: null, decision: null } as const
  const later = new Date(now.getTime() + 60 * 60 * 1000)
  const earlier = new Date(now.getTime() - 60 * 1000)

  test('waiting for the garage, inside its time: yes', () => {
    expect(withdrawRefusal({ status: 'waiting_garage', garageRespondBy: later, ...unanswered }, now)).toBeNull()
  })

  test("the garage's time ran out: its silence approved the redo, so no", () => {
    expect(withdrawRefusal({ status: 'waiting_garage', garageRespondBy: earlier, ...unanswered }, now)).toBe('answered')
  })

  test('with Detlio and not decided: yes; disputed by the garage: no', () => {
    expect(withdrawRefusal({ status: 'needs_detlio', garageRespondBy: null, ...unanswered }, now)).toBeNull()
    expect(
      withdrawRefusal({ status: 'needs_detlio', garageRespondBy: earlier, garageResponse: 'disputed', decision: null }, now)
    ).toBe('answered')
  })

  test('approved, decided or closed: no', () => {
    for (const status of ['redo_approved', 'redo_booked', 'redo_done', 'refund_approved', 'rejected', 'lapsed', 'withdrawn'] as const) {
      expect(withdrawRefusal({ status, garageRespondBy: null, ...unanswered }, now)).toBe('answered')
    }
    expect(withdrawRefusal({ status: 'needs_detlio', garageRespondBy: null, garageResponse: null, decision: 'redo' }, now)).toBe(
      'answered'
    )
  })

  test('the write closes it as withdrawn, never approved, and it counts as closed', () => {
    expect(withdrawnClaim(now)).toEqual({ status: 'withdrawn', closedAt: now, closeReason: 'withdrawn' })
    expect(CLOSED_STATUSES).toContain('withdrawn')
    expect(
      customerStatusLine({
        status: 'withdrawn',
        garageName: 'Shine Hub',
        garageRespondBy: null,
        redoBookBy: null,
        redoScheduledAt: null,
        closeReason: 'withdrawn',
        decisionReason: null,
      })
    ).toEqual({ title: 'Claim withdrawn', body: 'You withdrew this claim.' })
  })
})
