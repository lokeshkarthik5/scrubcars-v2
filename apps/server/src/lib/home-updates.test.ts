import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  BANK_DAYS,
  deriveUpdates,
  firstNameOf,
  hasUnread,
  MY_COMPLAINTS_PATH,
  reminderTimeFor,
  rupees,
  type HubBooking,
  type HubComplaint,
  type HubSlotAlert,
} from './home-updates.js'
import { bannedPhraseIn } from './copy-rules.js'
import type { NoticeRow } from './notices.js'

// Fixed clock: Mon 12 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-12T06:30:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const ahead = (ms: number) => new Date(NOW.getTime() + ms)
const LONG_AGO = new Date('2026-01-01T00:00:00Z')

function booking(overrides: Partial<HubBooking> = {}): HubBooking {
  return {
    id: 'b1',
    status: 'completed',
    bookingType: 'dropin',
    // Sat 10 Oct, 10:00 IST.
    scheduledAt: new Date('2026-10-10T04:30:00Z'),
    createdAt: new Date('2026-10-08T04:30:00Z'),
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelledOnBehalfOf: null,
    noShow: null,
    rescheduledFromId: null,
    rescheduleCount: 0,
    moved: false,
    reviewPromptDismissedAt: null,
    hasReview: false,
    vehicleId: 'car1',
    vehicleName: 'Hyundai i20',
    vendorId: 'v1',
    vendorName: 'Next Level',
    vendorPausedAt: null,
    serviceLabel: 'Express Wash',
    payment: null,
    charges: [],
    photos: { count: 0, before: 0, after: 0, lastAt: null },
    refunds: [],
    ...overrides,
  }
}

const paid = (paidAt = new Date('2026-10-08T04:31:00Z')) => ({
  status: 'paid',
  amount: '499.00',
  paidAt,
  refundedAmount: null,
  refundedAt: null,
})

const feed = (bookings: HubBooking[], options: { notices?: NoticeRow[]; seenAt?: Date } = {}) =>
  deriveUpdates({ bookings, notices: options.notices ?? [], seenAt: options.seenAt ?? LONG_AGO, now: NOW })

const kinds = (items: Array<{ kind: string }>) => items.map((item) => item.kind)

describe('each step of a booking is a row', () => {
  test('accepted, reminder, started, done, photos and receipt, newest first', () => {
    const items = feed([
      booking({
        status: 'completed',
        acceptedAt: new Date('2026-10-08T05:00:00Z'),
        startedAt: new Date('2026-10-10T04:35:00Z'),
        completedAt: new Date('2026-10-10T05:20:00Z'),
        photos: { count: 4, before: 2, after: 2, lastAt: new Date('2026-10-10T05:15:00Z') },
        payment: paid(),
      }),
    ])
    expect(kinds(items)).toEqual(['completed', 'photos', 'started', 'reminder', 'accepted', 'receipt_ready'])
    expect(items.find((i) => i.kind === 'accepted')).toMatchObject({
      title: 'Next Level accepted your booking',
      body: 'Express Wash · Sat 10 Oct, 10 AM',
      bookingId: 'b1',
    })
    expect(items.find((i) => i.kind === 'photos')).toMatchObject({ body: '4 photos' })
    expect(items.find((i) => i.kind === 'completed')).toMatchObject({ title: 'Your car is done' })
  })

  test('a step with no recorded time is skipped, never guessed', () => {
    // A job from before 0028: completed, but no times.
    const items = feed([booking({ status: 'completed', payment: paid() })])
    expect(kinds(items)).toEqual(['reminder', 'receipt_ready'])
  })

  test('photos show only once the customer can see them', () => {
    const items = feed([
      booking({ status: 'confirmed', scheduledAt: ahead(DAY * 3), createdAt: ago(DAY), photos: { count: 2, before: 2, after: 0, lastAt: ago(HOUR) } }),
    ])
    expect(kinds(items)).not.toContain('photos')
  })
})

describe('pickup & drop', () => {
  const steps = {
    pickedUpAt: new Date('2026-10-10T04:40:00Z'),
    atGarageAt: new Date('2026-10-10T05:00:00Z'),
    outForDeliveryAt: new Date('2026-10-10T07:00:00Z'),
    deliveredAt: new Date('2026-10-10T07:30:00Z'),
  }

  test('each handover step is a row, in its place in the job', () => {
    const items = feed([
      booking({
        bookingType: 'pickup',
        status: 'completed',
        acceptedAt: new Date('2026-10-08T05:00:00Z'),
        startedAt: new Date('2026-10-10T05:10:00Z'),
        completedAt: steps.deliveredAt,
        pickup: steps,
      }),
    ])
    expect(kinds(items)).toEqual([
      'completed',
      'out_for_delivery',
      'started',
      'at_garage',
      'picked_up',
      'reminder',
      'accepted',
    ])
    expect(items.find((i) => i.kind === 'picked_up')).toMatchObject({
      title: 'Next Level collected your car',
      body: 'Express Wash',
      bookingId: 'b1',
    })
    expect(items.find((i) => i.kind === 'at_garage')).toMatchObject({ title: 'Your car is at Next Level' })
    expect(items.find((i) => i.kind === 'out_for_delivery')).toMatchObject({
      title: 'Your car is on its way back',
      body: 'Next Level',
    })
    // Delivered completes the job: said once, in the customer's words.
    expect(items.find((i) => i.kind === 'completed')).toMatchObject({ title: 'Your car is back' })
  })

  test('a step not reached is not a row', () => {
    const items = feed([
      booking({
        bookingType: 'pickup',
        status: 'confirmed',
        scheduledAt: ahead(HOUR),
        createdAt: ago(DAY),
        acceptedAt: ago(DAY - HOUR),
        pickup: { pickedUpAt: ago(10 * 60_000), atGarageAt: null, outForDeliveryAt: null, deliveredAt: null },
      }),
    ])
    expect(kinds(items)).toContain('picked_up')
    expect(kinds(items)).not.toContain('at_garage')
    expect(kinds(items)).not.toContain('out_for_delivery')
  })

  test('only a pickup job has handover rows, whatever a row carries', () => {
    const items = feed([booking({ bookingType: 'doorstep', pickup: steps })])
    expect(kinds(items)).not.toContain('picked_up')
  })
})

describe('the reminder', () => {
  test('is dated 18:00 IST the day before the slot', () => {
    expect(reminderTimeFor(new Date('2026-10-10T04:30:00Z')).toISOString()).toBe('2026-10-09T12:30:00.000Z')
    // A 00:30 IST slot: the day before is still the previous IST day.
    expect(reminderTimeFor(new Date('2026-10-09T19:00:00Z')).toISOString()).toBe('2026-10-09T12:30:00.000Z')
  })

  test('is skipped for a booking made after 18:00 the day before', () => {
    const items = feed([
      booking({ status: 'confirmed', createdAt: new Date('2026-10-09T13:00:00Z'), payment: paid() }),
    ])
    expect(kinds(items)).not.toContain('reminder')
  })

  test('is never dated before the booking was accepted', () => {
    const acceptedAt = new Date('2026-10-09T14:00:00Z')
    const items = feed([booking({ status: 'confirmed', acceptedAt })])
    expect(items.find((i) => i.kind === 'reminder')?.at).toBe(acceptedAt.toISOString())
  })

  test('is skipped for a booking accepted on the day of its slot: it is not tomorrow any more', () => {
    // Booked Mon for Wed 14 Oct 11:00 IST; the garage accepts at 08:00 IST
    // on the Wednesday itself.
    const now = new Date('2026-10-14T03:00:00Z')
    const items = deriveUpdates({
      bookings: [
        booking({
          status: 'confirmed',
          scheduledAt: new Date('2026-10-14T05:30:00Z'),
          createdAt: new Date('2026-10-12T06:00:00Z'),
          acceptedAt: new Date('2026-10-14T02:30:00Z'),
        }),
      ],
      notices: [],
      seenAt: LONG_AGO,
      now,
    })
    expect(kinds(items)).toEqual(['accepted'])

    // Accepted at 23:50 IST the night before: still the day before, so it stays.
    const lateNight = deriveUpdates({
      bookings: [
        booking({
          status: 'confirmed',
          scheduledAt: new Date('2026-10-14T05:30:00Z'),
          createdAt: new Date('2026-10-12T06:00:00Z'),
          acceptedAt: new Date('2026-10-13T18:20:00Z'),
        }),
      ],
      notices: [],
      seenAt: LONG_AGO,
      now,
    })
    expect(lateNight.find((i) => i.kind === 'reminder')?.at).toBe('2026-10-13T18:20:00.000Z')
  })

  test('is not shown before its time, nor for a booking never accepted', () => {
    expect(kinds(feed([booking({ status: 'confirmed', scheduledAt: ahead(3 * DAY), createdAt: ago(DAY) })]))).not.toContain('reminder')
    expect(kinds(feed([booking({ status: 'pending' })]))).not.toContain('reminder')
  })
})

describe('the window and the read marker', () => {
  test('only the last 30 days', () => {
    const old = booking({
      id: 'old',
      status: 'completed',
      scheduledAt: ago(40 * DAY),
      createdAt: ago(41 * DAY),
      acceptedAt: ago(41 * DAY),
      completedAt: ago(29 * DAY),
    })
    expect(kinds(feed([old]))).toEqual(['completed'])
  })

  test('unread is anything after the moment Updates was last opened', () => {
    const items = feed(
      [booking({ status: 'confirmed', acceptedAt: new Date('2026-10-08T05:00:00Z') })],
      { seenAt: new Date('2026-10-09T00:00:00Z') }
    )
    expect(items.find((i) => i.kind === 'accepted')?.unread).toBe(false)
    expect(items.find((i) => i.kind === 'reminder')?.unread).toBe(true)
    expect(hasUnread(items, null, new Date('2026-10-09T00:00:00Z'))).toBe(true)
    expect(hasUnread(items.filter((i) => !i.unread), null, NOW)).toBe(false)
  })

  test('a pinned notice newer than the marker lights the bell with no bookings at all', () => {
    expect(hasUnread([], { startsAt: ago(HOUR) }, ago(DAY))).toBe(true)
    expect(hasUnread([], { startsAt: ago(DAY * 2) }, ago(DAY))).toBe(false)
  })
})

describe('money rows', () => {
  test('a bill to pay, a bill with nothing more to pay, and a paid bill', () => {
    const charge = (id: string, status: string, extra: object = {}) => ({
      id,
      kind: 'final_bill',
      status,
      amountDue: '1250.50',
      createdAt: ago(DAY),
      paidAt: null,
      gatewayPaymentId: null,
      refundedAmount: null,
      refundedAt: null,
      ...extra,
    })
    const items = feed([
      booking({
        charges: [
          charge('c1', 'due'),
          charge('c2', 'not_needed', { createdAt: ago(2 * DAY) }),
          charge('c3', 'paid', { paidAt: ago(HOUR) }),
          charge('c4', 'cancelled'),
        ],
      }),
    ])
    expect(items.find((i) => i.id === 'bill:c1')).toMatchObject({
      kind: 'bill_due',
      title: 'Bill from Next Level: ₹1,250.50 to pay',
      chargeId: 'c1',
    })
    expect(items.find((i) => i.id === 'bill:c2')).toMatchObject({ kind: 'bill_not_needed', body: 'Nothing more to pay' })
    expect(items.find((i) => i.id === 'bill_paid:c3')).toMatchObject({ title: 'Bill paid: ₹1,250.50' })
    expect(items.some((i) => i.id === 'bill:c4')).toBe(false)
  })

  test("a booking the garage didn't accept in time says so, with the refund (0042)", () => {
    const missed = booking({
      status: 'cancelled',
      cancelledBy: 'vendor',
      cancelledAt: ago(HOUR),
      responseMissedAt: ago(HOUR),
      payment: paid(),
    })
    expect(feed([missed]).find((i) => i.id === `cancelled:${missed.id}`)).toMatchObject({
      kind: 'declined',
      title: "Next Level didn't accept in time",
      body: 'Refund due: ₹499',
      amount: '499.00',
    })
  })

  test('"Refund due" only when lib/refunds.ts says money is owed', () => {
    const declined = booking({
      status: 'cancelled',
      cancelledBy: 'vendor',
      cancelledAt: ago(HOUR),
      payment: paid(),
    })
    expect(feed([declined]).find((i) => i.kind === 'declined')).toMatchObject({
      title: "Next Level couldn't take your booking",
      body: 'Refund due: ₹499',
      amount: '499.00',
    })

    const unpaid = booking({ status: 'cancelled', cancelledBy: 'vendor', cancelledAt: ago(HOUR) })
    expect(feed([unpaid]).find((i) => i.kind === 'declined')?.body).toBe('Sat 10 Oct, 10 AM')

    const refunded = booking({
      status: 'cancelled',
      cancelledBy: 'vendor',
      acceptedAt: ago(2 * DAY),
      cancelledAt: ago(DAY),
      payment: { ...paid(), status: 'refunded', refundedAmount: '499.00', refundedAt: ago(HOUR) },
      refunds: [{ id: 'r1', amount: '499.00', recordedAt: ago(HOUR), refundRef: 'rfnd_Abc123XYZ' }],
    })
    const rows = feed([refunded])
    expect(rows.find((i) => i.kind === 'cancelled')?.body).toBe('Sat 10 Oct, 10 AM')
    // Hedged, as on the booking page: the bank decides when it shows.
    expect(rows.find((i) => i.kind === 'refunded')).toMatchObject({
      title: '₹499 refunded',
      body: 'Next Level. It can take 5–7 working days to show in your account.',
      amount: '499.00',
    })
  })

  test('a refund paid outside Razorpay says so, with no bank delay', () => {
    const direct = booking({
      status: 'cancelled',
      cancelledBy: 'vendor',
      acceptedAt: ago(2 * DAY),
      cancelledAt: ago(DAY),
      payment: { ...paid(), status: 'refunded', refundedAmount: '499.00', refundedAt: ago(HOUR) },
      refunds: [{ id: 'r2', amount: '499.00', recordedAt: ago(HOUR), refundRef: null }],
    })
    expect(feed([direct]).find((i) => i.kind === 'refunded')).toMatchObject({
      title: '₹499 refunded',
      body: 'Next Level. Refunded directly by Detlio.',
    })
  })

  test("the bank's timing is word for word the app's", () => {
    // packages/core imports through workspace paths, so it is read as text.
    const core = readFileSync(new URL('../../../../packages/core/src/refunds.ts', import.meta.url), 'utf8')
    expect(core).toContain(`export const BANK_DAYS = '${BANK_DAYS}'`)
  })

  test("a garage no-show is the customer's money back; their own cancellations and no-shows are not rows", () => {
    const garageNoShow = booking({
      status: 'cancelled',
      cancelledBy: 'admin',
      cancelledOnBehalfOf: 'detlio',
      noShow: 'garage',
      acceptedAt: ago(2 * DAY),
      cancelledAt: ago(HOUR),
      payment: paid(),
    })
    expect(feed([garageNoShow]).find((i) => i.kind === 'cancelled')).toMatchObject({
      title: 'Your booking at Next Level was cancelled',
      body: 'Refund due: ₹499',
    })

    const own = booking({ status: 'cancelled', cancelledBy: 'user', cancelledAt: ago(HOUR), payment: paid() })
    const customerNoShow = booking({
      status: 'cancelled',
      cancelledBy: 'admin',
      cancelledOnBehalfOf: 'detlio',
      noShow: 'customer',
      cancelledAt: ago(HOUR),
      payment: paid(),
    })
    expect(kinds(feed([own, customerNoShow]))).not.toContain('cancelled')
  })

  test('a moved booking has no receipt of its own, and its new booking says it moved', () => {
    const from = booking({ id: 'from', status: 'cancelled', cancelledBy: 'user', cancelledAt: ago(HOUR), moved: true, payment: paid() })
    const to = booking({
      id: 'to',
      status: 'pending',
      rescheduledFromId: 'from',
      createdAt: ago(HOUR),
      scheduledAt: new Date('2026-10-15T04:30:00Z'),
      payment: paid(),
    })
    const items = feed([from, to])
    expect(items.find((i) => i.id === 'receipt:from')).toBeUndefined()
    expect(items.find((i) => i.kind === 'moved')).toMatchObject({ title: 'Booking moved to Thu 15 Oct, 10 AM', bookingId: 'to' })
  })
})

describe('a paused garage', () => {
  test('says a booking still to come stands', () => {
    const items = feed([
      booking({ status: 'confirmed', scheduledAt: new Date('2026-10-15T04:30:00Z'), createdAt: ago(DAY), vendorPausedAt: ago(HOUR) }),
    ])
    expect(items.find((i) => i.kind === 'garage_paused')).toMatchObject({
      title: "Next Level isn't taking new bookings",
      body: 'Your Thu booking stands.',
    })
  })

  test('also for the garage behind a Book again tile, however old its last job', () => {
    const items = deriveUpdates({
      bookings: [],
      notices: [],
      pausedGarages: [{ vendorId: 'v9', vendorName: 'Old Haunt', pausedAt: ago(DAY) }],
      seenAt: LONG_AGO,
      now: NOW,
    })
    expect(items).toEqual([
      expect.objectContaining({ kind: 'garage_paused', title: "Old Haunt isn't taking new bookings", body: null }),
    ])
  })

  test('says only that, for a garage booked before', () => {
    const items = feed([booking({ status: 'completed', vendorPausedAt: ago(HOUR) })])
    expect(items.find((i) => i.kind === 'garage_paused')).toMatchObject({ body: null })
  })
})

describe('notices', () => {
  const notice = (overrides: Partial<NoticeRow> = {}): NoticeRow => ({
    id: 'n1',
    title: 'Slot may move: rain',
    body: 'Heavy rain on Thursday. The garage may call to move your time.',
    linkUrl: null,
    linkLabel: null,
    audience: 'with_booking_between',
    vendorId: 'v1',
    bookingFrom: new Date('2026-10-15T00:00:00Z'),
    bookingTo: new Date('2026-10-16T00:00:00Z'),
    startsAt: ago(2 * DAY),
    endsAt: ahead(5 * DAY),
    isActive: true,
    ...overrides,
  })

  test('a notice about their own booking is the first row, whatever its age', () => {
    const items = feed(
      [booking({ status: 'confirmed', scheduledAt: new Date('2026-10-15T04:30:00Z'), createdAt: ago(DAY), acceptedAt: ago(HOUR) })],
      { notices: [notice()] }
    )
    expect(items[0]).toMatchObject({ kind: 'notice', noticeId: 'n1', bookingId: 'b1', title: 'Slot may move: rain' })
    expect(items[1].kind).toBe('accepted')
  })

  test('a season-long notice stays the first row past 30 days: it is still live', () => {
    const season = notice({
      startsAt: new Date('2026-09-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T18:30:00Z'),
      bookingFrom: new Date('2026-09-01T00:00:00Z'),
      bookingTo: new Date('2026-12-31T18:30:00Z'),
    })
    const items = feed(
      [booking({ status: 'confirmed', scheduledAt: new Date('2026-10-15T04:30:00Z'), createdAt: ago(DAY) })],
      { notices: [season] }
    )
    expect(items[0]).toMatchObject({ kind: 'notice', noticeId: 'n1' })
  })

  test('is dated no earlier than the booking, so a booking made after the last look lights the bell', () => {
    // Posted two days ago; Updates opened yesterday; booked an hour ago.
    const seenAt = ago(DAY)
    const items = feed(
      [booking({ status: 'pending', scheduledAt: new Date('2026-10-15T04:30:00Z'), createdAt: ago(HOUR) })],
      { notices: [notice()], seenAt }
    )
    expect(items[0]).toMatchObject({ kind: 'notice', at: ago(HOUR).toISOString(), unread: true })
    expect(hasUnread(items, null, seenAt)).toBe(true)
  })

  test('is not a row for a booking outside the window or at another garage', () => {
    const later = booking({ status: 'confirmed', scheduledAt: new Date('2026-10-20T04:30:00Z'), createdAt: ago(DAY) })
    const elsewhere = booking({ status: 'confirmed', vendorId: 'v2', scheduledAt: new Date('2026-10-15T04:30:00Z'), createdAt: ago(DAY) })
    expect(kinds(feed([later, elsewhere], { notices: [notice()] }))).not.toContain('notice')
  })
})

describe('wording helpers', () => {
  test('money is shown exactly', () => {
    expect(rupees('499.00')).toBe('₹499')
    expect(rupees('1250.5')).toBe('₹1,250.50')
    expect(rupees('125000')).toBe('₹1,25,000')
  })

  test('the first name skips initials', () => {
    expect(firstNameOf('R. Karthik')).toBe('Karthik')
    expect(firstNameOf('Priya Ramesh')).toBe('Priya')
    expect(firstNameOf('  J  ')).toBe('J')
    expect(firstNameOf('A. B.')).toBe('A. B.')
  })
})

describe("the team's answers to complaints", () => {
  function complaint(overrides: Partial<HubComplaint> = {}): HubComplaint {
    return {
      id: 'c1',
      number: 123,
      status: 'acknowledged',
      acknowledgedAt: ago(2 * DAY),
      resolvedAt: null,
      closedAt: null,
      hasAnswer: false,
      ...overrides,
    }
  }
  const complaintFeed = (complaints: HubComplaint[], seenAt = LONG_AGO) =>
    deriveUpdates({ bookings: [], notices: [], complaints, seenAt, now: NOW })

  test('acknowledged: "We\'re looking into" it, opening My complaints', () => {
    const [row] = complaintFeed([complaint()])
    expect(row).toMatchObject({
      id: 'complaint_ack:c1',
      kind: 'complaint_acknowledged',
      title: "We're looking into complaint C-000123",
      body: null,
      linkUrl: MY_COMPLAINTS_PATH,
      linkLabel: null,
      bookingId: null,
      at: ago(2 * DAY).toISOString(),
    })
  })

  test('acknowledged, then resolved: two rows, the answer newest', () => {
    const items = complaintFeed([
      complaint({ status: 'resolved', resolvedAt: ago(DAY), hasAnswer: true }),
    ])
    expect(kinds(items)).toEqual(['complaint_resolved', 'complaint_acknowledged'])
    expect(items[0]!.title).toBe('Complaint C-000123 resolved — see our answer')
    expect(items[0]!.linkUrl).toBe(MY_COMPLAINTS_PATH)
  })

  test('resolved straight from open stamps the acknowledgement then: one row, not two', () => {
    const at = ago(DAY)
    const items = complaintFeed([
      complaint({ status: 'resolved', acknowledgedAt: at, resolvedAt: at, hasAnswer: true }),
    ])
    expect(kinds(items)).toEqual(['complaint_resolved'])
  })

  test('closed: with a note of its own it says so; after a resolution it is only closed', () => {
    const at = ago(DAY)
    const withNote = complaintFeed([
      complaint({ status: 'closed', acknowledgedAt: at, closedAt: at, hasAnswer: true }),
    ])
    expect(kinds(withNote)).toEqual(['complaint_closed'])
    expect(withNote[0]!.title).toBe('Complaint C-000123 closed — see our note')

    const plain = complaintFeed([
      complaint({ status: 'closed', acknowledgedAt: at, closedAt: at, hasAnswer: false }),
    ])
    expect(plain[0]!.title).toBe('Complaint C-000123 closed')

    const afterResolve = complaintFeed([
      complaint({ status: 'closed', resolvedAt: ago(DAY), closedAt: ago(HOUR), hasAnswer: true }),
    ])
    expect(kinds(afterResolve)).toEqual(['complaint_closed', 'complaint_resolved', 'complaint_acknowledged'])
    expect(afterResolve[0]!.title).toBe('Complaint C-000123 closed')
  })

  test('an open complaint has no row: nothing has happened to it yet', () => {
    expect(complaintFeed([complaint({ status: 'open', acknowledgedAt: null })])).toEqual([])
  })

  test('older than 30 days falls out, and unread is after the read marker', () => {
    expect(complaintFeed([complaint({ acknowledgedAt: ago(31 * DAY) })])).toEqual([])
    const [row] = complaintFeed([complaint({ acknowledgedAt: ago(HOUR) })], ago(2 * HOUR))
    expect(row!.unread).toBe(true)
    const [seen] = complaintFeed([complaint({ acknowledgedAt: ago(3 * HOUR) })], ago(2 * HOUR))
    expect(seen!.unread).toBe(false)
  })

  test('mixed in with the booking rows, newest first', () => {
    const items = deriveUpdates({
      bookings: [booking({ status: 'confirmed', acceptedAt: ago(3 * DAY), scheduledAt: ahead(5 * DAY) })],
      notices: [],
      complaints: [complaint({ acknowledgedAt: ago(DAY) })],
      seenAt: LONG_AGO,
      now: NOW,
    })
    expect(kinds(items)).toEqual(['complaint_acknowledged', 'accepted'])
  })

  test('every line passes the copy rules', () => {
    const at = ago(DAY)
    const items = complaintFeed([
      complaint({ id: 'a' }),
      complaint({ id: 'b', status: 'resolved', resolvedAt: at, hasAnswer: true }),
      complaint({ id: 'c', status: 'closed', acknowledgedAt: at, closedAt: at, hasAnswer: true }),
    ])
    for (const item of items) expect(bannedPhraseIn(item.title)).toBeNull()
  })
})

describe('suggested times and extra work (0041)', () => {
  const extra = (id: string, status: string, overrides: object = {}) => ({
    id,
    kind: 'extra_work',
    status,
    amountDue: '450.00',
    createdAt: ago(3 * HOUR),
    paidAt: null,
    gatewayPaymentId: null,
    refundedAmount: null,
    refundedAt: null,
    description: 'Replace wiper blades',
    cancelledAt: null,
    cancelReason: null,
    ...overrides,
  })

  test('a live suggestion asks; an answered one is history', () => {
    // Sat 17 Oct, 10:00 IST booked; two other times offered.
    const scheduledAt = new Date('2026-10-17T04:30:00Z')
    const proposal = {
      id: 'p1',
      status: 'open',
      slots: ['2026-10-17T08:30:00.000Z', '2026-10-17T10:30:00.000Z'],
      expiresAt: ahead(4 * HOUR),
      createdAt: ago(HOUR),
      resolvedAt: null,
    }
    const live = feed([booking({ status: 'pending', scheduledAt, payment: paid(), proposal })])
    expect(live.find((i) => i.id === 'proposal:p1')).toMatchObject({
      kind: 'time_proposal',
      title: "Next Level can't do 10 AM — pick another time",
      bookingId: 'b1',
    })
    expect(live.find((i) => i.id === 'proposal:p1')?.body).toBe('Sat 17 Oct, 2 PM · Sat 17 Oct, 4 PM')

    const answered = feed([
      booking({ status: 'cancelled', scheduledAt, payment: paid(), proposal: { ...proposal, status: 'withdrawn' } }),
    ])
    expect(answered.find((i) => i.id === 'proposal:p1')?.title).toBe('Next Level suggested other times')
  })

  test('none of the times worked, or nobody answered: the cancellation says so, with the refund', () => {
    const base = {
      status: 'cancelled',
      cancelledBy: 'vendor' as const,
      cancelledAt: ago(HOUR),
      payment: paid(),
    }
    const proposal = {
      id: 'p1',
      slots: ['2026-10-17T08:30:00.000Z'],
      expiresAt: ago(HOUR),
      createdAt: ago(5 * HOUR),
      resolvedAt: ago(HOUR),
    }
    const declined = feed([booking({ ...base, proposal: { ...proposal, status: 'declined' } })])
    expect(declined.find((i) => i.id === 'cancelled:b1')).toMatchObject({
      kind: 'declined',
      title: "None of Next Level's times worked, so your booking was cancelled",
      body: 'Refund due: ₹499',
    })
    const expired = feed([booking({ ...base, proposal: { ...proposal, status: 'expired' } })])
    expect(expired.find((i) => i.id === 'cancelled:b1')?.title).toBe(
      'No time was picked, so your booking at Next Level was cancelled'
    )
  })

  test('extra work: asked (while the job is on), paid, declined, withdrawn; never a bill row', () => {
    const items = feed([
      booking({
        status: 'in_progress',
        payment: paid(),
        charges: [
          extra('x1', 'due'),
          extra('x2', 'paid', { paidAt: ago(HOUR) }),
          extra('x3', 'cancelled', { cancelledAt: ago(2 * HOUR), cancelReason: 'declined' }),
          extra('x4', 'cancelled', { cancelledAt: ago(2 * HOUR), cancelReason: 'withdrawn' }),
          extra('x5', 'cancelled', { cancelledAt: ago(2 * HOUR), cancelReason: 'booking_closed' }),
        ],
      }),
    ])
    expect(items.find((i) => i.id === 'extra_work:x1')).toMatchObject({
      kind: 'extra_work_due',
      title: 'Next Level asks for extra work: ₹450',
      body: 'Replace wiper blades',
      chargeId: 'x1',
      amount: '450.00',
    })
    expect(items.find((i) => i.id === 'extra_work_paid:x2')?.title).toBe('Extra work approved and paid: ₹450')
    expect(items.find((i) => i.id === 'extra_work_declined:x3')?.title).toBe('You declined extra work from Next Level')
    expect(items.find((i) => i.id === 'extra_work_withdrawn:x4')?.title).toBe('Next Level withdrew its extra-work request')
    expect(items.filter((i) => i.chargeId === 'x5')).toEqual([])
    expect(items.filter((i) => i.kind.startsWith('bill'))).toEqual([])
    for (const item of items) expect(bannedPhraseIn(item.title)).toBeNull()

    // Due on a job that is no longer on: nothing to ask.
    const off = feed([booking({ status: 'cancelled', charges: [extra('x1', 'due')] })])
    expect(off.find((i) => i.id === 'extra_work:x1')).toBeUndefined()
  })
})

describe('slot alerts (0047)', () => {
  const told: HubSlotAlert = {
    id: 'a1',
    vendorId: 'v1',
    vendorName: 'Marina Auto Spa',
    date: '2026-10-13',
    bookingType: 'doorstep',
    serviceIds: ['s1', 's2'],
    notifiedAt: ago(2 * HOUR),
    // Tue 13 Oct, 10:30 IST.
    notifiedSlotAt: new Date('2026-10-13T05:00:00Z'),
  }

  test('a time that opened is a row when it was told, in the push’s words, opening checkout on that day', () => {
    const [row] = deriveUpdates({ bookings: [], notices: [], slotAlerts: [told], seenAt: ago(3 * HOUR), now: NOW })
    expect(row).toMatchObject({
      id: 'slot_opened:a1',
      kind: 'slot_opened',
      at: told.notifiedAt.toISOString(),
      unread: true,
      title: 'A slot opened at Marina Auto Spa',
      body: 'Tue 13 Oct — 10:30 AM. Book before it goes.',
      vendorId: 'v1',
      bookingId: null,
      linkUrl: '/book/v1?service=s1%2Cs2&date=2026-10-13&mode=doorstep',
    })
    expect(bannedPhraseIn(`${row.title} ${row.body}`)).toBeNull()
  })

  test('older than the window, it is gone', () => {
    const old = { ...told, notifiedAt: ago(31 * DAY) }
    expect(deriveUpdates({ bookings: [], notices: [], slotAlerts: [old], seenAt: LONG_AGO, now: NOW })).toEqual([])
  })
})
