import { describe, expect, test } from 'bun:test'
import { AppError } from '../../lib/errors.js'
import { pickBookingByReference, planLoggedComplaint, type ReferencedBooking } from './complaints.logging.js'
import type { LogComplaintInput } from './complaints.validation.js'

const NOW = new Date('2026-10-20T04:30:00.000Z')
const HOUR = 60 * 60 * 1000

const KARTHIK = { id: 'e2e00000-0000-4000-8000-000000000101', name: 'Karthik Raja' }
const SOMEONE_ELSE = 'e2e00000-0000-4000-8000-000000000102'

const booking = (id: string, userId: string): ReferencedBooking => ({
  id,
  userId,
  vendorId: 'e2e00000-0000-4000-8000-000000000301',
  garageName: 'Marina Auto Spa',
})
const HIS = booking('c0a10001-0000-4000-8000-000000000001', KARTHIK.id)
const NOT_HIS = booking('c0a10001-0000-4000-8000-000000000002', SOMEONE_ELSE)

const INPUT: LogComplaintInput = {
  phone: '9876543210',
  source: 'phone',
  category: 'service_quality',
  message: 'The interior was still dusty after the deep clean.',
  loggedBy: 'Ravi',
}

function refusal(run: () => unknown): AppError {
  try {
    run()
  } catch (err) {
    expect(err).toBeInstanceOf(AppError)
    return err as AppError
  }
  throw new Error('expected the log to be refused')
}

describe('planLoggedComplaint: who it belongs to', () => {
  test('a phone with an account: the complaint is theirs, under their account name', () => {
    const plan = planLoggedComplaint(
      { ...INPUT, customerName: 'Karthi (typed)' },
      { account: KARTHIK, bookings: [] },
      NOW
    )
    expect(plan.userId).toBe(KARTHIK.id)
    expect(plan.customerName).toBe('Karthik Raja')
    expect(plan.customerPhone).toBe('9876543210')
  })

  test('a phone with no account: only the name and phone typed are kept', () => {
    const plan = planLoggedComplaint(
      { ...INPUT, customerName: 'Selvi' },
      { account: null, bookings: [] },
      NOW
    )
    expect(plan.userId).toBeNull()
    expect(plan.customerName).toBe('Selvi')
  })

  test('no account and no name is refused, so a complaint always says who made it', () => {
    const err = refusal(() => planLoggedComplaint(INPUT, { account: null, bookings: [] }, NOW))
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('COMPLAINT_NAME_REQUIRED')
  })

  test('how it came and who logged it are kept', () => {
    const plan = planLoggedComplaint(INPUT, { account: KARTHIK, bookings: [] }, NOW)
    expect(plan.source).toBe('phone')
    expect(plan.loggedBy).toBe('Ravi')
  })
})

describe('planLoggedComplaint: the booking', () => {
  test('a reference attaches the booking and its garage', () => {
    const plan = planLoggedComplaint(
      { ...INPUT, bookingRef: 'c0a10001' },
      { account: KARTHIK, bookings: [HIS, NOT_HIS] },
      NOW
    )
    expect(plan.bookingId).toBe(HIS.id)
    expect(plan.bookingRef).toBe('C0A10001')
    expect(plan.vendorId).toBe(HIS.vendorId)
    expect(plan.garageName).toBe('Marina Auto Spa')
  })

  test("with an account, someone else's booking is refused", () => {
    const err = refusal(() =>
      planLoggedComplaint({ ...INPUT, bookingRef: 'c0a10001' }, { account: KARTHIK, bookings: [NOT_HIS] }, NOW)
    )
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('COMPLAINT_BOOKING_NOT_THEIRS')
  })

  test('without an account, the one booking with that reference is attached', () => {
    const plan = planLoggedComplaint(
      { ...INPUT, customerName: 'Selvi', bookingRef: 'c0a10001' },
      { account: null, bookings: [NOT_HIS] },
      NOW
    )
    expect(plan.userId).toBeNull()
    expect(plan.bookingId).toBe(NOT_HIS.id)
  })

  test('an unknown reference is a 404, two bookings nobody can tell apart a 409', () => {
    expect(
      refusal(() => planLoggedComplaint({ ...INPUT, bookingRef: 'c0a10001' }, { account: KARTHIK, bookings: [] }, NOW))
        .code
    ).toBe('BOOKING_NOT_FOUND')
    expect(
      refusal(() =>
        planLoggedComplaint(
          { ...INPUT, customerName: 'Selvi', bookingRef: 'c0a10001' },
          { account: null, bookings: [HIS, NOT_HIS] },
          NOW
        )
      ).code
    ).toBe('COMPLAINT_BOOKING_AMBIGUOUS')
  })

  test('no reference, no booking', () => {
    const plan = planLoggedComplaint(INPUT, { account: KARTHIK, bookings: [] }, NOW)
    expect(plan.bookingId).toBeNull()
    expect(plan.vendorId).toBeNull()
  })
})

describe('planLoggedComplaint: when it was received', () => {
  test('now when not given', () => {
    expect(planLoggedComplaint(INPUT, { account: KARTHIK, bookings: [] }, NOW).receivedAt).toEqual(NOW)
  })

  test('as given, up to 7 days back: the clock runs from there', () => {
    const saturdayNight = new Date(NOW.getTime() - 36 * HOUR)
    const plan = planLoggedComplaint(
      { ...INPUT, receivedAt: saturdayNight.toISOString() },
      { account: KARTHIK, bookings: [] },
      NOW
    )
    expect(plan.receivedAt).toEqual(saturdayNight)
  })

  test('further back than 7 days, or in the future, is refused', () => {
    for (const at of [new Date(NOW.getTime() - 7 * 24 * HOUR - 1000), new Date(NOW.getTime() + HOUR)]) {
      const err = refusal(() =>
        planLoggedComplaint({ ...INPUT, receivedAt: at.toISOString() }, { account: KARTHIK, bookings: [] }, NOW)
      )
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('COMPLAINT_RECEIVED_AT_INVALID')
    }
  })
})

describe('pickBookingByReference', () => {
  test("the customer's own one of two that share a reference", () => {
    expect(pickBookingByReference([NOT_HIS, HIS], KARTHIK.id)).toEqual({ booking: HIS })
  })
})
