import { describe, expect, test } from 'bun:test'
import {
  digestLookbacks,
  isMorningTick,
  planPendingDigest,
  type PendingBookingRow,
} from './pending-digest.js'

const IST = (time: string, date = '2026-10-05') => new Date(`${date}T${time}+05:30`)
const MIN = 60_000

function row(waitingSince: Date, scheduledAt: Date, id = 'b1'): PendingBookingRow {
  return {
    id,
    scheduledAt,
    waitingSince,
    bookingType: 'dropin',
    amount: '799.00',
    garageName: 'Marina Auto Spa',
    garagePhone: '9876500011',
  }
}

describe('planPendingDigest', () => {
  const start = IST('16:00:00')

  test('nudges on the run where a booking reaches 30 minutes of waiting', () => {
    const paid = IST('11:05:00')
    const rows = [row(paid, start)]
    // Due at 11:35, so the 11:40 run is the first to see it.
    expect(planPendingDigest(IST('11:30:00').getTime(), rows).post).toBe(false)
    const due = planPendingDigest(IST('11:40:02').getTime(), rows)
    expect(due).toMatchObject({ post: true, reason: 'new_waiting' })
    expect(due.waiting.map((r) => r.id)).toEqual(['b1'])
    // The next run stays quiet: nothing new.
    expect(planPendingDigest(IST('11:50:00').getTime(), rows)).toMatchObject({
      post: false,
      reason: 'nothing_new',
    })
  })

  test('29 minutes is not yet a nudge, 30 is', () => {
    const at = IST('12:00:00').getTime()
    expect(planPendingDigest(at, [row(new Date(at - 29 * MIN), start)]).waiting).toHaveLength(0)
    expect(planPendingDigest(at, [row(new Date(at - 30 * MIN), start)])).toMatchObject({
      post: true,
      reason: 'new_waiting',
    })
  })

  test('reminds on the hour while a booking is still waiting', () => {
    const rows = [row(IST('11:05:00'), start)]
    expect(planPendingDigest(IST('12:00:00').getTime(), rows)).toMatchObject({
      post: true,
      reason: 'hourly',
    })
  })

  test('flags a booking whose time passed with nobody accepting', () => {
    const rows = [row(IST('09:00:00'), IST('12:30:00'))]
    const plan = planPendingDigest(IST('12:30:00').getTime(), rows)
    expect(plan).toMatchObject({ post: true, reason: 'new_missed' })
    expect(plan.missed.map((r) => r.id)).toEqual(['b1'])
    expect(plan.waiting).toHaveLength(0)
  })

  test('stays quiet at night and rolls everything up at 7 am', () => {
    const rows = [row(IST('21:40:00', '2026-10-04'), IST('10:00:00'))]
    expect(planPendingDigest(IST('22:10:00', '2026-10-04').getTime(), rows)).toMatchObject({
      post: false,
      reason: 'quiet_hours',
    })
    expect(planPendingDigest(IST('06:50:00').getTime(), rows).reason).toBe('quiet_hours')
    expect(planPendingDigest(IST('07:00:00').getTime(), rows)).toMatchObject({
      post: true,
      reason: 'morning',
    })
  })

  test('says nothing when nothing is waiting', () => {
    expect(planPendingDigest(IST('12:00:00').getTime(), [])).toMatchObject({
      post: false,
      reason: 'empty',
    })
  })

  test('a refund-due booking whose crossing run failed comes back at the next hour', () => {
    const rows = [row(IST('09:00:00'), IST('15:00:00'))]
    // Suppose the 15:00 run failed or never came: 15:10 has nothing new...
    expect(planPendingDigest(IST('15:10:00').getTime(), rows)).toMatchObject({
      post: false,
      reason: 'nothing_new',
    })
    // ...and 16:00 lists it again, with nothing else waiting.
    const plan = planPendingDigest(IST('16:00:00').getTime(), rows)
    expect(plan).toMatchObject({ post: true, reason: 'hourly' })
    expect(plan.missed.map((r) => r.id)).toEqual(['b1'])
  })

  test('a failed 7 am roll-up is covered at 8', () => {
    const rows = [row(IST('21:40:00', '2026-10-04'), IST('10:00:00'))]
    expect(planPendingDigest(IST('08:00:00').getTime(), rows)).toMatchObject({
      post: true,
      reason: 'hourly',
    })
  })

  test('a booking that reaches 30 minutes at night waits for the 7 am roll-up', () => {
    const rows = [row(IST('21:25:00'), IST('12:00:00', '2026-10-06'))]
    expect(planPendingDigest(IST('21:50:00').getTime(), rows).post).toBe(false)
    expect(planPendingDigest(IST('22:00:00').getTime(), rows).reason).toBe('quiet_hours')
    expect(planPendingDigest(IST('07:00:00', '2026-10-06').getTime(), rows)).toMatchObject({
      post: true,
      reason: 'morning',
    })
  })

  describe('pickup & drop not collected', () => {
    // A pickup job whose slot is 11:00, accepted and paid, never picked up.
    const pickup = (scheduledAt: Date, id = 'p1') => ({
      ...row(scheduledAt, scheduledAt, id),
      bookingType: 'pickup',
    })

    test('posts on the run where it is 30 minutes past its time', () => {
      const rows = [pickup(IST('11:00:00'))]
      // 11:20: late, but not yet the 30 minutes the digest waits.
      expect(planPendingDigest(IST('11:20:00').getTime(), [], rows)).toMatchObject({
        post: false,
        reason: 'empty',
      })
      const due = planPendingDigest(IST('11:30:00').getTime(), [], rows)
      expect(due).toMatchObject({ post: true, reason: 'new_late_pickup' })
      expect(due.latePickups.map((r) => r.id)).toEqual(['p1'])
      // Then it is listed on the hour until someone acts.
      expect(planPendingDigest(IST('11:40:00').getTime(), [], rows)).toMatchObject({
        post: false,
        reason: 'nothing_new',
      })
      expect(planPendingDigest(IST('12:00:00').getTime(), [], rows)).toMatchObject({
        post: true,
        reason: 'hourly',
      })
    })

    test('rides along with the waiting bookings, one message for everything', () => {
      const plan = planPendingDigest(
        IST('12:00:00').getTime(),
        [row(IST('11:05:00'), start)],
        [pickup(IST('10:00:00'))]
      )
      expect(plan.post).toBe(true)
      expect(plan.waiting).toHaveLength(1)
      expect(plan.latePickups).toHaveLength(1)
    })

    test('stays quiet at night like the rest', () => {
      const rows = [pickup(IST('21:30:00'))]
      expect(planPendingDigest(IST('22:00:00').getTime(), [], rows).reason).toBe('quiet_hours')
    })

    test('a pickup nobody collected is still listed days later, not dropped after a day', () => {
      const now = IST('12:00:00', '2026-10-08')
      const rows = [pickup(IST('11:00:00'))]
      // Three days old: past the pending bookings' one-day lookback…
      const { bookingsSince, pickupsSince } = digestLookbacks(now.getTime())
      expect(rows[0].scheduledAt.getTime()).toBeLessThan(bookingsSince.getTime())
      // …but inside the pickups' own, so the query still returns it.
      expect(rows[0].scheduledAt.getTime()).toBeGreaterThan(pickupsSince.getTime())
      expect(planPendingDigest(now.getTime(), [], rows)).toMatchObject({
        post: true,
        reason: 'hourly',
      })
    })

    test('the pickups look back 14 days, the pending bookings one', () => {
      const now = IST('12:00:00').getTime()
      const { bookingsSince, pickupsSince } = digestLookbacks(now)
      expect(now - bookingsSince.getTime()).toBe(24 * 60 * MIN)
      expect(now - pickupsSince.getTime()).toBe(14 * 24 * 60 * MIN)
    })
  })
})

describe('the morning roll-up and payouts due', () => {
  test('posts at 07:00 for payouts due alone, with no booking waiting', () => {
    expect(planPendingDigest(IST('07:00:30').getTime(), [], [], { morningExtras: true })).toMatchObject({
      post: true,
      reason: 'morning',
    })
    expect(planPendingDigest(IST('07:00:30').getTime(), [])).toMatchObject({ post: false, reason: 'empty' })
  })

  test('only at 07:00: payouts never post on their own at any other time', () => {
    expect(planPendingDigest(IST('08:00:00').getTime(), [], [], { morningExtras: true }).post).toBe(false)
    expect(planPendingDigest(IST('06:50:00').getTime(), [], [], { morningExtras: true }).post).toBe(false)
  })

  test('the morning tick is the 07:00 IST one', () => {
    expect(isMorningTick(IST('07:00:00').getTime())).toBe(true)
    expect(isMorningTick(IST('07:09:59').getTime())).toBe(true)
    expect(isMorningTick(IST('07:10:00').getTime())).toBe(false)
    expect(isMorningTick(IST('19:00:00').getTime())).toBe(false)
  })
})
