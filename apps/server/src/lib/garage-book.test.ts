import { describe, expect, test } from 'bun:test'
import {
  DETLIO_PUSH_EVERY_DAYS,
  canMoveJob,
  dueFor,
  fillReminder,
  formatIndianPlate,
  hasLink,
  messageRefusal,
  monthBounds,
  parseCustomerRef,
  percentChange,
  plateKey,
  previousMonth,
  pushAllowed,
  rupeesToPaise,
} from './garage-book.js'

const ID = '0b6b5f0e-1d1a-4c43-9d5b-4a9c2f3e8a11'
const at = (iso: string) => new Date(iso)

describe('walk-in status', () => {
  test('booked → in progress → done, or cancelled; done and cancelled are the end', () => {
    expect(canMoveJob('booked', 'in_progress')).toBe(true)
    expect(canMoveJob('booked', 'done')).toBe(true)
    expect(canMoveJob('in_progress', 'done')).toBe(true)
    expect(canMoveJob('in_progress', 'cancelled')).toBe(true)
    expect(canMoveJob('done', 'booked')).toBe(false)
    expect(canMoveJob('done', 'cancelled')).toBe(false)
    expect(canMoveJob('cancelled', 'booked')).toBe(false)
    expect(canMoveJob('done', 'done')).toBe(true)
  })
})

describe('the reminder message', () => {
  test('is refused empty, too long, or with any kind of link', () => {
    expect(messageRefusal('  ')).not.toBeNull()
    expect(messageRefusal('x'.repeat(501))).not.toBeNull()
    for (const text of ['see https://x.in', 'www.mygarage.in', 'book at mygarage.com', 'wa.me/919840000000']) {
      expect(hasLink(text)).toBe(true)
      expect(messageRefusal(text)).not.toBeNull()
    }
    expect(messageRefusal('Hi {name}, your {car} is due. Call 98400 00000.')).toBeNull()
  })

  test('fills the first name, car, garage and phone', () => {
    expect(
      fillReminder('Hi {name}, your {car} is due at {garage}. Call {phone}.', {
        name: 'Suresh Kumar',
        car: 'Hyundai Creta',
        garage: 'Sample Car Care',
        phone: '98400 00000',
      })
    ).toBe('Hi Suresh, your Hyundai Creta is due at Sample Car Care. Call 98400 00000.')
    expect(fillReminder('Hi {name}, your {car}. Call {phone}.', { name: '', car: null, garage: 'G', phone: null })).toBe(
      'Hi there, your car. Call.'
    )
  })
})

describe('plates', () => {
  test('are written the way Indian plates are laid out, and searched by letters and digits', () => {
    expect(formatIndianPlate('tn09ab4521')).toBe('TN 09 AB 4521')
    expect(formatIndianPlate('TN 7 CD 9036')).toBe('TN 07 CD 9036')
    expect(formatIndianPlate('22bh1234aa')).toBe('22 BH 1234 AA')
    expect(plateKey('TN 09 AB-4521')).toBe('TN09AB4521')
  })
})

describe('customer refs', () => {
  test('own: and detlio: with a uuid, nothing else', () => {
    expect(parseCustomerRef(`own:${ID}`)).toEqual({ kind: 'own', id: ID })
    expect(parseCustomerRef(`detlio:${ID.toUpperCase()}`)).toEqual({ kind: 'detlio', id: ID })
    expect(parseCustomerRef(ID)).toBeNull()
    expect(parseCustomerRef(`admin:${ID}`)).toBeNull()
    expect(parseCustomerRef(`own:${ID}:x`)).toBeNull()
    expect(parseCustomerRef('own:nope')).toBeNull()
  })
})

describe('when a car is due', () => {
  const now = at('2026-11-09T10:00:00+05:30')
  test('from the last visit and its interval, in IST days', () => {
    expect(dueFor({ lastVisitAt: at('2026-10-10T18:00:00+05:30'), intervalDays: 30, remindedAt: null, now })).toEqual({
      dueOn: '2026-11-09',
      daysSince: 30,
      state: 'due_today',
    })
    expect(dueFor({ lastVisitAt: at('2026-10-01T18:00:00+05:30'), intervalDays: 30, remindedAt: null, now }).state).toBe('overdue')
    expect(dueFor({ lastVisitAt: at('2026-10-12T09:00:00+05:30'), intervalDays: 30, remindedAt: null, now }).state).toBe('due_soon')
    expect(dueFor({ lastVisitAt: at('2026-11-01T09:00:00+05:30'), intervalDays: 30, remindedAt: null, now }).state).toBe('ok')
  })
  test('no visit, or no reminder asked for, is none; a reminder since the visit makes it ok', () => {
    expect(dueFor({ lastVisitAt: null, intervalDays: 30, remindedAt: null, now }).state).toBe('none')
    expect(dueFor({ lastVisitAt: at('2026-09-01T09:00:00+05:30'), intervalDays: null, remindedAt: null, now }).state).toBe('none')
    expect(
      dueFor({ lastVisitAt: at('2026-09-01T09:00:00+05:30'), intervalDays: 30, remindedAt: at('2026-11-08T09:00:00+05:30'), now }).state
    ).toBe('ok')
  })
})

describe('the Detlio push limit', () => {
  const now = at('2026-11-09T10:00:00Z')
  test(`one per customer every ${DETLIO_PUSH_EVERY_DAYS} days`, () => {
    expect(pushAllowed(null, now)).toEqual({ ok: true, nextAt: null })
    const three = new Date(now.getTime() - 3 * 86_400_000)
    expect(pushAllowed(three, now)).toEqual({ ok: false, nextAt: new Date(three.getTime() + 7 * 86_400_000) })
    expect(pushAllowed(new Date(now.getTime() - 7 * 86_400_000), now).ok).toBe(true)
  })
})

describe('money and months', () => {
  test('rupees to paise, month bounds in IST, percent change', () => {
    expect(rupeesToPaise('499.00')).toBe(49_900)
    expect(rupeesToPaise('0.105')).toBe(11)
    expect(rupeesToPaise(null)).toBe(0)
    const nov = monthBounds('2026-11')!
    expect(nov.start.toISOString()).toBe('2026-10-31T18:30:00.000Z')
    expect(nov.end.toISOString()).toBe('2026-11-30T18:30:00.000Z')
    expect(nov.days).toBe(30)
    expect(monthBounds('2026-13')).toBeNull()
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(percentChange(112, 100)).toBe(12)
    expect(percentChange(5, 0)).toBeNull()
  })
})
