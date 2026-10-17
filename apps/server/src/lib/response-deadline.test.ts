import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_RESPONSE_MINUTES,
  OTHER_GARAGES_LIMIT,
  RESPONSE_FLOOR_MS,
  afterWithdraw,
  calendarRange,
  garageRespondBy,
  isAutoCancelOn,
  isOverdueUnanswered,
  openHoursOn,
  otherGaragesOrigin,
  parseResponseMinutes,
  responseDeadlineView,
  responseTimePassed,
  wantedCategories,
  type GarageCalendar,
} from './response-deadline.js'

/** An IST wall-clock moment: ist('2026-10-19', '10:12'). */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`)

// 19 Oct 2026 is a Monday.
const MON = '2026-10-19'
const TUE = '2026-10-20'
const WED = '2026-10-21'

/** Open 09:00–18:00 every day of the week. */
const allWeek = (open = '09:00:00', close = '18:00:00') =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, openTime: open, closeTime: close, isClosed: false }))

const calendar = (over: Partial<GarageCalendar> = {}): GarageCalendar => ({
  pausedAt: null,
  hours: allWeek(),
  closures: [],
  ...over,
})

const deadline = (from: Date, scheduledAt: Date, cal = calendar(), windowMins = 30) =>
  garageRespondBy({ from, scheduledAt, windowMins, calendar: cal })

describe('garageRespondBy', () => {
  test('paid while open: payment + 30 minutes', () => {
    const result = deadline(ist(MON, '10:12'), ist(TUE, '11:00'))
    expect(result.respondBy).toEqual(ist(MON, '10:42'))
    expect(result.clockStartsAt).toEqual(ist(MON, '10:12'))
    expect(result.rule).toBe('opening_hours')
  })

  test('paid before opening the same day: 30 minutes after it opens', () => {
    const result = deadline(ist(MON, '07:40'), ist(TUE, '11:00'))
    expect(result.respondBy).toEqual(ist(MON, '09:30'))
    expect(result.clockStartsAt).toEqual(ist(MON, '09:00'))
  })

  test('paid overnight, after closing: 30 minutes after the next morning opens', () => {
    expect(deadline(ist(MON, '21:15'), ist(WED, '11:00')).respondBy).toEqual(ist(TUE, '09:30'))
    // Just after midnight IST is already the next IST day.
    expect(deadline(ist(TUE, '00:20'), ist(WED, '11:00')).respondBy).toEqual(ist(TUE, '09:30'))
  })

  test('paid just before closing: the clock stops at closing and runs on at opening', () => {
    // 10 minutes tonight, 20 tomorrow morning.
    const result = deadline(ist(MON, '17:50'), ist(WED, '11:00'))
    expect(result.respondBy).toEqual(ist(TUE, '09:20'))
    expect(result.clockStartsAt).toEqual(ist(MON, '17:50'))
  })

  test('exactly at closing counts as closed', () => {
    expect(deadline(ist(MON, '18:00'), ist(WED, '11:00')).respondBy).toEqual(ist(TUE, '09:30'))
  })

  test('a weekly off day is skipped', () => {
    const hours = allWeek().map((row) => (row.dayOfWeek === 2 ? { ...row, isClosed: true } : row))
    // Paid Monday night; Tuesday is off; Wednesday opens at 9.
    expect(deadline(ist(MON, '20:00'), ist('2026-10-22', '11:00'), calendar({ hours })).respondBy).toEqual(
      ist(WED, '09:30')
    )
  })

  test('a day with no hours row is a weekly off day', () => {
    const hours = allWeek().filter((row) => row.dayOfWeek !== 2)
    expect(deadline(ist(MON, '20:00'), ist('2026-10-22', '11:00'), calendar({ hours })).respondBy).toEqual(
      ist(WED, '09:30')
    )
  })

  test('a holiday (vendor_closures) is skipped, even when paid during its usual hours', () => {
    const result = deadline(ist(MON, '10:00'), ist(WED, '15:00'), calendar({ closures: [MON] }))
    expect(result.respondBy).toEqual(ist(TUE, '09:30'))
    expect(result.clockStartsAt).toEqual(ist(TUE, '09:00'))
  })

  test('hours that do not run forwards are no hours', () => {
    const hours = allWeek().map((row) => (row.dayOfWeek === 1 ? { ...row, openTime: '22:00:00', closeTime: '02:00:00' } : row))
    expect(deadline(ist(MON, '10:00'), ist(WED, '15:00'), calendar({ hours })).respondBy).toEqual(ist(TUE, '09:30'))
  })

  test('short "HH:MM" times read like Postgres "HH:MM:SS"', () => {
    const hours = allWeek('09:00', '18:00')
    expect(deadline(ist(MON, '10:12'), ist(TUE, '11:00'), calendar({ hours })).respondBy).toEqual(ist(MON, '10:42'))
  })

  test('paused: no next opening, so only the slot margin sets it', () => {
    const result = deadline(ist(MON, '10:00'), ist(MON, '16:00'), calendar({ pausedAt: ist(MON, '08:00') }))
    expect(result.respondBy).toEqual(ist(MON, '15:00'))
    expect(result.clockStartsAt).toBeNull()
    expect(result.rule).toBe('slot_margin')
  })

  test('never later than 1 hour before the slot', () => {
    // Paid at night for 9:30 next morning: opening + 30 would be 9:30, the
    // slot itself; the margin brings it to 8:30.
    const result = deadline(ist(MON, '21:00'), ist(TUE, '09:30'))
    expect(result.respondBy).toEqual(ist(TUE, '08:30'))
    expect(result.rule).toBe('slot_margin')
  })

  test('the margin is not lifted when it still leaves 15 minutes or more', () => {
    // Paid 10:00 for 11:20: the margin is 10:20, exactly 20 minutes on.
    const result = deadline(ist(MON, '10:00'), ist(MON, '11:20'))
    expect(result.respondBy).toEqual(ist(MON, '10:20'))
    expect(result.rule).toBe('slot_margin')
  })

  test('the 15-minute floor: the margin would leave under 15 minutes, so 15 from payment', () => {
    // Paid 10:00 for 11:10 (an at-garage booking just over its 1h notice):
    // the margin is 10:10, so the garage gets until 10:15.
    const result = deadline(ist(MON, '10:00'), ist(MON, '11:10'))
    expect(result.respondBy).toEqual(ist(MON, '10:15'))
    expect(result.rule).toBe('floor')
  })

  test('the floor applies while shut too', () => {
    // Paid at 06:00 for a 07:05 slot at a garage that opens at 9.
    const result = deadline(ist(MON, '06:00'), ist(MON, '07:05'))
    expect(result.respondBy).toEqual(ist(MON, '06:15'))
    expect(result.rule).toBe('floor')
  })

  test('never past the slot start, even with the floor', () => {
    // A move to a slot 10 minutes away (only possible for old data): the
    // floor would be 15 minutes, the slot comes first.
    const result = deadline(ist(MON, '10:00'), ist(MON, '10:10'))
    expect(result.respondBy).toEqual(ist(MON, '10:10'))
    expect(result.rule).toBe('slot_start')
  })

  test('the floor never lengthens a window the opening hours set', () => {
    const result = deadline(ist(MON, '10:00'), ist(TUE, '10:00'), calendar(), 10)
    expect(result.respondBy).toEqual(ist(MON, '10:10'))
    expect(result.rule).toBe('opening_hours')
  })

  test('shut every day until the slot: the margin sets it', () => {
    const result = deadline(ist(MON, '10:00'), ist(WED, '12:00'), calendar({ closures: [MON, TUE, WED] }))
    expect(result.respondBy).toEqual(ist(WED, '11:00'))
    expect(result.clockStartsAt).toBeNull()
  })

  test('a reschedule back to pending is measured from the move', () => {
    // Paid on Monday morning (deadline 10:42, long gone), moved by the
    // customer on Tuesday at 13:05: a fresh 30 minutes from the move.
    const paid = deadline(ist(MON, '10:12'), ist(TUE, '11:00'))
    const moved = deadline(ist(TUE, '13:05'), ist(WED, '15:00'))
    expect(paid.respondBy).toEqual(ist(MON, '10:42'))
    expect(moved.respondBy).toEqual(ist(TUE, '13:35'))
  })

  test('a wider window from GARAGE_RESPONSE_MINUTES spans a closing', () => {
    // 45 minutes from 17:30: 30 tonight, 15 tomorrow.
    expect(deadline(ist(MON, '17:30'), ist(WED, '15:00'), calendar(), 45).respondBy).toEqual(ist(TUE, '09:15'))
  })
})

describe('openHoursOn and calendarRange', () => {
  test('reads the weekday of the IST date', () => {
    expect(openHoursOn(MON, calendar())).toEqual({
      start: ist(MON, '09:00').getTime(),
      end: ist(MON, '18:00').getTime(),
    })
    expect(openHoursOn(MON, calendar({ closures: [MON] }))).toBeNull()
  })

  test('covers the paid day to the slot day, in IST', () => {
    expect(calendarRange(ist(MON, '00:10'), ist(WED, '23:50'))).toEqual({ first: MON, last: WED })
  })
})

describe('switches', () => {
  test('GARAGE_RESPONSE_MINUTES: whole minutes in range, else 30', () => {
    expect(parseResponseMinutes(undefined)).toBe(DEFAULT_RESPONSE_MINUTES)
    expect(parseResponseMinutes('')).toBe(30)
    expect(parseResponseMinutes('45')).toBe(45)
    expect(parseResponseMinutes(' 20 ')).toBe(20)
    expect(parseResponseMinutes('2')).toBe(30)
    expect(parseResponseMinutes('1000')).toBe(30)
    expect(parseResponseMinutes('12.5')).toBe(30)
    expect(parseResponseMinutes('soon')).toBe(30)
  })

  test('AUTO_CANCEL_UNANSWERED is off unless exactly on', () => {
    expect(isAutoCancelOn(undefined)).toBe(false)
    expect(isAutoCancelOn('')).toBe(false)
    expect(isAutoCancelOn('off')).toBe(false)
    expect(isAutoCancelOn('true')).toBe(false)
    expect(isAutoCancelOn('1')).toBe(false)
    expect(isAutoCancelOn('on')).toBe(true)
    expect(isAutoCancelOn(' ON ')).toBe(true)
  })
})

describe('responseTimePassed (the 409 on Accept and Suggest times)', () => {
  const now = ist(MON, '10:50').getTime()
  const pending = { status: 'pending', respondBy: ist(MON, '10:42'), responseMissedAt: null }

  test('refused once the deadline has passed, with the switch on', () => {
    expect(responseTimePassed(pending, true, now)).toBe(true)
    expect(responseTimePassed({ ...pending, respondBy: ist(MON, '10:50') }, true, now)).toBe(true)
  })

  test('not refused before the deadline', () => {
    expect(responseTimePassed({ ...pending, respondBy: ist(MON, '10:51') }, true, now)).toBe(false)
  })

  test('only guidance while the switch is off', () => {
    expect(responseTimePassed(pending, false, now)).toBe(false)
  })

  test('a booking with no deadline (from before 0042) is never refused for it', () => {
    expect(responseTimePassed({ ...pending, respondBy: null }, true, now)).toBe(false)
  })

  test('already cancelled for it: refused whatever the switch says now', () => {
    const swept = { status: 'cancelled', respondBy: ist(MON, '10:42'), responseMissedAt: ist(MON, '10:45') }
    expect(responseTimePassed(swept, true, now)).toBe(true)
    expect(responseTimePassed(swept, false, now)).toBe(true)
  })
})

describe('isOverdueUnanswered (the sweep picks)', () => {
  const now = ist(MON, '11:00').getTime()
  const row = {
    status: 'pending',
    paymentStatus: 'paid',
    respondBy: ist(MON, '10:42'),
    hasOpenProposal: false,
    pickedUpAt: null,
  }

  test('a paid pending booking past its deadline', () => {
    expect(isOverdueUnanswered(row, now)).toBe(true)
    expect(isOverdueUnanswered({ ...row, respondBy: ist(MON, '11:00') }, now)).toBe(true)
  })

  test('not before its deadline', () => {
    expect(isOverdueUnanswered({ ...row, respondBy: ist(MON, '11:01') }, now)).toBe(false)
  })

  test('not without a deadline', () => {
    expect(isOverdueUnanswered({ ...row, respondBy: null }, now)).toBe(false)
  })

  test('not unpaid, refunded or cash', () => {
    for (const paymentStatus of ['pending', 'failed', 'refunded', 'collected', null]) {
      expect(isOverdueUnanswered({ ...row, paymentStatus }, now)).toBe(false)
    }
  })

  test('not once accepted, cancelled or done', () => {
    for (const status of ['confirmed', 'in_progress', 'completed', 'cancelled']) {
      expect(isOverdueUnanswered({ ...row, status }, now)).toBe(false)
    }
  })

  test('not while suggested times wait for the customer', () => {
    expect(isOverdueUnanswered({ ...row, hasOpenProposal: true }, now)).toBe(false)
  })
})

describe('afterWithdraw', () => {
  test('keeps a deadline still ahead', () => {
    expect(afterWithdraw(ist(MON, '10:42'), ist(TUE, '10:00'), ist(MON, '10:20'))).toEqual(ist(MON, '10:42'))
  })

  test('gives at least 15 minutes from the withdrawal', () => {
    const now = ist(MON, '11:30')
    expect(afterWithdraw(ist(MON, '10:42'), ist(TUE, '10:00'), now)?.getTime()).toBe(now.getTime() + RESPONSE_FLOOR_MS)
  })

  test('never past the slot start, and null stays null', () => {
    expect(afterWithdraw(ist(MON, '10:42'), ist(MON, '11:35'), ist(MON, '11:30'))).toEqual(ist(MON, '11:35'))
    expect(afterWithdraw(null, ist(TUE, '10:00'), ist(MON, '11:30'))).toBeNull()
  })
})

describe('payload and other garages', () => {
  test('the view carries the switch and the window, or nothing', () => {
    expect(responseDeadlineView({ respondBy: ist(MON, '10:42') }, { enforced: true, windowMins: 30 })).toEqual({
      respondBy: ist(MON, '10:42').toISOString(),
      enforced: true,
      windowMins: 30,
    })
    expect(responseDeadlineView({ respondBy: null }, { enforced: true, windowMins: 30 })).toBeNull()
  })

  test("other garages are looked for from the customer's address, or the garage's pin for a drop-in", () => {
    const base = { lat: 13.05, lng: 80.25, vendorLat: 13.08, vendorLng: 80.27 }
    expect(otherGaragesOrigin({ ...base, bookingType: 'doorstep' })).toEqual({ lat: 13.05, lng: 80.25 })
    expect(otherGaragesOrigin({ ...base, bookingType: 'pickup' })).toEqual({ lat: 13.05, lng: 80.25 })
    expect(otherGaragesOrigin({ ...base, bookingType: 'dropin' })).toEqual({ lat: 13.08, lng: 80.27 })
    expect(otherGaragesOrigin({ ...base, bookingType: 'dropin', vendorLat: null })).toBeNull()
    expect(otherGaragesOrigin({ ...base, bookingType: 'doorstep', lat: null })).toBeNull()
    expect(OTHER_GARAGES_LIMIT).toBe(3)
  })

  test("a package stands for its members' categories", () => {
    expect(
      wantedCategories([
        { category: 'car_wash' },
        { category: 'package', memberCategories: ['detailing', 'car_wash'] },
        { category: 'coating' },
      ])
    ).toEqual(['car_wash', 'detailing', 'coating'])
    expect(wantedCategories([{ category: 'package' }])).toEqual([])
  })
})
