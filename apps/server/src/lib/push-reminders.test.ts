import { describe, expect, test } from 'bun:test'
import { hourBeforeRange, isDayBeforeRun, scheduledPushDue, tomorrowRange, type ReminderCandidate } from './push-reminders.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)
const ON = { autoCancelOn: true }

const confirmed = (scheduledAt: Date, createdAt = IST('2026-10-10T09:00:00')): ReminderCandidate => ({
  status: 'confirmed',
  scheduledAt,
  createdAt,
})

describe('the evening before (IST)', () => {
  test('only the runs from 18:00 to 18:59 IST send it', () => {
    expect(isDayBeforeRun(IST('2026-10-16T17:50:00'))).toBe(false)
    expect(isDayBeforeRun(IST('2026-10-16T18:00:00'))).toBe(true)
    expect(isDayBeforeRun(IST('2026-10-16T18:50:00'))).toBe(true)
    expect(isDayBeforeRun(IST('2026-10-16T19:00:00'))).toBe(false)
    // 18:00 IST is 12:30 UTC: the server's own clock is never the IST one.
    expect(isDayBeforeRun(new Date('2026-10-16T12:30:00Z'))).toBe(true)
    expect(isDayBeforeRun(new Date('2026-10-16T18:00:00Z'))).toBe(false)
  })

  test('tomorrow is the next IST calendar day, midnight to midnight', () => {
    const range = tomorrowRange(IST('2026-10-16T18:10:00'))
    expect(range.from.toISOString()).toBe(IST('2026-10-17T00:00:00').toISOString())
    expect(range.to.toISOString()).toBe(IST('2026-10-18T00:00:00').toISOString())
  })

  test('for confirmed bookings on the next day, made before 18:00 that evening', () => {
    const now = IST('2026-10-16T18:10:00')
    expect(scheduledPushDue('day_before', confirmed(IST('2026-10-17T00:00:00')), now, ON)).toBe(true)
    expect(scheduledPushDue('day_before', confirmed(IST('2026-10-17T10:00:00')), now, ON)).toBe(true)
    expect(scheduledPushDue('day_before', confirmed(IST('2026-10-17T23:30:00')), now, ON)).toBe(true)
    // Not today, not the day after.
    expect(scheduledPushDue('day_before', confirmed(IST('2026-10-16T20:00:00')), now, ON)).toBe(false)
    expect(scheduledPushDue('day_before', confirmed(IST('2026-10-18T00:00:00')), now, ON)).toBe(false)
    // Booked after 18:00 the day before: it has only just been made.
    expect(
      scheduledPushDue('day_before', confirmed(IST('2026-10-17T10:00:00'), IST('2026-10-16T18:05:00')), now, ON)
    ).toBe(false)
    // Outside the 18:00 hour, nothing.
    expect(scheduledPushDue('day_before', confirmed(IST('2026-10-17T10:00:00')), IST('2026-10-16T19:00:00'), ON)).toBe(false)
  })

  test('confirmed only', () => {
    const now = IST('2026-10-16T18:10:00')
    for (const status of ['pending', 'in_progress', 'completed', 'cancelled']) {
      expect(scheduledPushDue('day_before', { ...confirmed(IST('2026-10-17T10:00:00')), status }, now, ON)).toBe(false)
    }
  })
})

describe('about an hour before', () => {
  const now = IST('2026-10-17T09:00:00')

  test('the window is (now + 30 min, now + 70 min]', () => {
    const range = hourBeforeRange(now)
    expect(range.from.toISOString()).toBe(IST('2026-10-17T09:30:00').toISOString())
    expect(range.to.toISOString()).toBe(IST('2026-10-17T10:10:00').toISOString())
  })

  test('a run every ten minutes sends it 60–70 minutes ahead; a late run still catches it', () => {
    expect(scheduledPushDue('hour_before', confirmed(IST('2026-10-17T10:10:00')), now, ON)).toBe(true)
    expect(scheduledPushDue('hour_before', confirmed(IST('2026-10-17T10:00:00')), now, ON)).toBe(true)
    expect(scheduledPushDue('hour_before', confirmed(IST('2026-10-17T09:31:00')), now, ON)).toBe(true)
    // Too far off yet: the next run.
    expect(scheduledPushDue('hour_before', confirmed(IST('2026-10-17T10:11:00')), now, ON)).toBe(false)
    // Too close: under half an hour is not "an hour before".
    expect(scheduledPushDue('hour_before', confirmed(IST('2026-10-17T09:30:00')), now, ON)).toBe(false)
    expect(scheduledPushDue('hour_before', confirmed(IST('2026-10-17T08:30:00')), now, ON)).toBe(false)
  })

  test('consecutive runs leave no gap: every slot falls in exactly one run’s window first', () => {
    // Slots every 5 minutes; runs every 10. Each is due at its first run
    // 60–70 minutes before it.
    for (let minutes = 60; minutes <= 180; minutes += 5) {
      const slot = new Date(now.getTime() + minutes * 60_000)
      const firstRun = [...Array(30).keys()]
        .map((i) => new Date(now.getTime() + i * 10 * 60_000))
        .find((run) => scheduledPushDue('hour_before', confirmed(slot), run, ON))
      expect(firstRun).toBeDefined()
      const ahead = (slot.getTime() - firstRun!.getTime()) / 60_000
      expect(ahead).toBeGreaterThanOrEqual(60)
      expect(ahead).toBeLessThanOrEqual(70)
    }
  })

  test('confirmed only', () => {
    for (const status of ['pending', 'in_progress', 'cancelled']) {
      expect(scheduledPushDue('hour_before', { ...confirmed(IST('2026-10-17T10:00:00')), status }, now, ON)).toBe(false)
    }
  })
})

describe("the garage's 'accept within 10 min'", () => {
  const now = IST('2026-10-16T18:00:00')
  const waiting = (respondBy: Date, over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
    status: 'pending',
    scheduledAt: IST('2026-10-17T10:00:00'),
    createdAt: IST('2026-10-16T17:30:00'),
    respondBy,
    paymentStatus: 'paid',
    hasOpenProposal: false,
    ...over,
  })

  test('a paid pending booking whose time to answer ends in 2–12 minutes', () => {
    expect(scheduledPushDue('respond_soon', waiting(IST('2026-10-16T18:10:00')), now, ON)).toBe(true)
    expect(scheduledPushDue('respond_soon', waiting(IST('2026-10-16T18:12:00')), now, ON)).toBe(true)
    expect(scheduledPushDue('respond_soon', waiting(IST('2026-10-16T18:13:00')), now, ON)).toBe(false)
    expect(scheduledPushDue('respond_soon', waiting(IST('2026-10-16T18:02:00')), now, ON)).toBe(false)
  })

  test('never while AUTO_CANCEL_UNANSWERED is off: nothing would be cancelled', () => {
    expect(scheduledPushDue('respond_soon', waiting(IST('2026-10-16T18:10:00')), now, { autoCancelOn: false })).toBe(false)
  })

  test('not for an unpaid, answered, suggested-times or brand-new booking', () => {
    const at = IST('2026-10-16T18:10:00')
    expect(scheduledPushDue('respond_soon', waiting(at, { paymentStatus: 'pending' }), now, ON)).toBe(false)
    expect(scheduledPushDue('respond_soon', waiting(at, { status: 'confirmed' }), now, ON)).toBe(false)
    expect(scheduledPushDue('respond_soon', waiting(at, { hasOpenProposal: true }), now, ON)).toBe(false)
    expect(scheduledPushDue('respond_soon', waiting(at, { respondBy: null }), now, ON)).toBe(false)
    expect(scheduledPushDue('respond_soon', waiting(at, { createdAt: IST('2026-10-16T17:57:00') }), now, ON)).toBe(false)
  })
})
