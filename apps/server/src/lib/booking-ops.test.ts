import { describe, expect, test } from 'bun:test'
import {
  adminCancellationNote,
  bookingReference,
  checkNoShow,
  isAdminCancellable,
  isCalendarDate,
  istDateRange,
  noShowNote,
  parseBookingListCursor,
  parseBookingSearch,
  waitingMinutes,
} from './booking-ops.js'

const MIN = 60_000
// A fixed clock: 12:45 pm IST on 4 Oct 2026.
const NOW = new Date('2026-10-04T07:15:00Z').getTime()

describe('bookingReference', () => {
  test('is the first eight characters of the id, upper-cased', () => {
    expect(bookingReference('3f2a9c1b-0000-4000-8000-000000000001')).toBe(
      '3F2A9C1B'
    )
  })
})

describe('parseBookingSearch', () => {
  test('nothing to search is no search at all', () => {
    expect(parseBookingSearch(undefined)).toBeNull()
    expect(parseBookingSearch('   ')).toBeNull()
  })

  test('a reference matches however it was read out', () => {
    expect(parseBookingSearch('#3F2A9C1B')?.idPrefix).toBe('3f2a9c1b')
    expect(parseBookingSearch('3f2a')?.idPrefix).toBe('3f2a')
    // A whole id pasted from a URL works too.
    expect(
      parseBookingSearch('3f2a9c1b-0000-4000-8000-000000000001')?.idPrefix
    ).toBe('3f2a9c1b-0000-4000-8000-000000000001')
  })

  test('too short, or not hex, is not a reference', () => {
    expect(parseBookingSearch('3f2')?.idPrefix).toBeNull()
    expect(parseBookingSearch('Priya')?.idPrefix).toBeNull()
  })

  test('a phone number loses its formatting and country code', () => {
    expect(parseBookingSearch('+91 98765-43210')?.phoneDigits).toBe(
      '9876543210'
    )
    expect(parseBookingSearch('98765 43210')?.phoneDigits).toBe('9876543210')
    // A partial number is still worth matching.
    expect(parseBookingSearch('43210')?.phoneDigits).toBe('43210')
  })

  test('text with letters is not a phone number', () => {
    expect(parseBookingSearch('Marina 2')?.phoneDigits).toBeNull()
    expect(parseBookingSearch('123')?.phoneDigits).toBeNull()
  })

  test('the text itself is always kept for name matches', () => {
    expect(parseBookingSearch('  Marina Auto ')?.text).toBe('Marina Auto')
    // All-digit text can be a reference and a phone at once; both are tried.
    expect(parseBookingSearch('98765432')).toEqual({
      text: '98765432',
      idPrefix: '98765432',
      phoneDigits: '98765432',
    })
  })
})

describe('parseBookingListCursor', () => {
  const ID = 'ad5ea7c1-0000-4000-8000-000000000001'

  test('reads the scheduled time and id of the last row', () => {
    expect(parseBookingListCursor(`2026-10-04T10:30:00.000Z_${ID}`)).toEqual({
      scheduledAt: new Date('2026-10-04T10:30:00.000Z'),
      id: ID,
    })
  })

  test('the id is lowercased, as ids are stored', () => {
    expect(
      parseBookingListCursor(`2026-10-04T10:30:00Z_${ID.toUpperCase()}`)?.id
    ).toBe(ID)
  })

  test('anything else is not a cursor', () => {
    expect(parseBookingListCursor('2')).toBeNull()
    expect(parseBookingListCursor(`2026-10-04_${ID}`)).toBeNull()
    expect(
      parseBookingListCursor('2026-10-04T10:30:00.000Z_not-an-id')
    ).toBeNull()
    expect(parseBookingListCursor(`2026-13-04T10:30:00.000Z_${ID}`)).toBeNull()
  })
})

describe('isCalendarDate', () => {
  test('a real day is a date', () => {
    expect(isCalendarDate('2026-10-04')).toBe(true)
    expect(isCalendarDate('2028-02-29')).toBe(true)
  })

  test('a month or day that does not exist is not', () => {
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('2026-02-31')).toBe(false)
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2026-10-4')).toBe(false)
  })
})

describe('waitingMinutes', () => {
  const createdAt = new Date(NOW - 45 * MIN)

  test('counts from creation for a normal checkout', () => {
    expect(
      waitingMinutes({ status: 'pending', createdAt, paidAt: createdAt }, NOW)
    ).toBe(45)
  })

  test('counts from the payment when it came later', () => {
    const paidAt = new Date(NOW - 10 * MIN)
    expect(waitingMinutes({ status: 'pending', createdAt, paidAt }, NOW)).toBe(
      10
    )
  })

  test('works with no payment row at all', () => {
    expect(
      waitingMinutes({ status: 'pending', createdAt, paidAt: null }, NOW)
    ).toBe(45)
  })

  test('only a pending booking is waiting', () => {
    expect(waitingMinutes({ status: 'confirmed', createdAt }, NOW)).toBeNull()
    expect(waitingMinutes({ status: 'cancelled', createdAt }, NOW)).toBeNull()
  })

  test('never goes negative on a clock skew', () => {
    expect(
      waitingMinutes({ status: 'pending', createdAt: new Date(NOW + MIN) }, NOW)
    ).toBe(0)
  })
})

describe('isAdminCancellable', () => {
  test('anything still live can be cancelled by ops', () => {
    expect(isAdminCancellable('pending')).toBe(true)
    expect(isAdminCancellable('confirmed')).toBe(true)
    expect(isAdminCancellable('in_progress')).toBe(true)
  })

  test('finished or already-off bookings cannot', () => {
    expect(isAdminCancellable('completed')).toBe(false)
    expect(isAdminCancellable('cancelled')).toBe(false)
    expect(isAdminCancellable('rescheduled')).toBe(false)
  })
})

describe('checkNoShow', () => {
  const started = new Date(NOW - 2 * 60 * MIN)
  const later = new Date(NOW + 60 * MIN)

  test('an accepted booking whose time has passed can be marked', () => {
    expect(
      checkNoShow({ status: 'confirmed', scheduledAt: started }, NOW)
    ).toBe('ok')
    expect(
      checkNoShow({ status: 'in_progress', scheduledAt: started }, NOW)
    ).toBe('ok')
  })

  test('the start time itself counts as passed', () => {
    expect(
      checkNoShow({ status: 'confirmed', scheduledAt: new Date(NOW) }, NOW)
    ).toBe('ok')
  })

  test('before the start time nobody has failed to turn up yet', () => {
    expect(checkNoShow({ status: 'confirmed', scheduledAt: later }, NOW)).toBe(
      'too_early'
    )
    expect(
      checkNoShow({ status: 'confirmed', scheduledAt: new Date(NOW + 1) }, NOW)
    ).toBe('too_early')
  })

  test('a booking that was never accepted, or is already over, cannot be a no-show', () => {
    expect(checkNoShow({ status: 'pending', scheduledAt: started }, NOW)).toBe(
      'wrong_status'
    )
    expect(
      checkNoShow({ status: 'completed', scheduledAt: started }, NOW)
    ).toBe('wrong_status')
    expect(
      checkNoShow({ status: 'cancelled', scheduledAt: started }, NOW)
    ).toBe('wrong_status')
  })

  test('the status is checked before the time', () => {
    expect(checkNoShow({ status: 'pending', scheduledAt: later }, NOW)).toBe(
      'wrong_status'
    )
  })
})

describe('istDateRange', () => {
  test('covers whole Chennai days, the end exclusive', () => {
    const { start, end } = istDateRange('2026-10-04', '2026-10-05')
    expect(start?.toISOString()).toBe('2026-10-03T18:30:00.000Z')
    expect(end?.toISOString()).toBe('2026-10-05T18:30:00.000Z')
  })

  test('a 2 am IST booking belongs to its IST day, not the UTC one', () => {
    const { start, end } = istDateRange('2026-10-04', '2026-10-04')
    const twoAm = new Date('2026-10-04T02:00:00+05:30')
    expect(twoAm >= start! && twoAm < end!).toBe(true)
  })

  test('either side can be left open', () => {
    expect(istDateRange(undefined, '2026-10-04').start).toBeNull()
    expect(istDateRange('2026-10-04', undefined).end).toBeNull()
  })
})

describe('notes left by actions', () => {
  test('a cancellation names whose call it was and why', () => {
    expect(adminCancellationNote('garage', 'Power cut')).toBe(
      'Cancelled on behalf of the garage. Reason: Power cut'
    )
    expect(adminCancellationNote('detlio', 'Duplicate')).toBe(
      "Cancelled by Detlio's own decision. Reason: Duplicate"
    )
  })

  test('a no-show states the money consequence', () => {
    expect(noShowNote('customer')).toContain('Payment kept, no refund')
    expect(noShowNote('garage')).toContain('Refund the customer in full')
  })

  test("ops' own words follow on a new line, when there are any", () => {
    expect(noShowNote('garage', '  Called twice, no answer ')).toMatch(
      /\nCalled twice, no answer$/
    )
    expect(noShowNote('garage', '   ')).not.toContain('\n')
  })
})
