import { describe, expect, test } from 'bun:test'
import type { GarageCalendar } from './response-deadline.js'
import {
  REPAIR_QUOTE_RULES,
  adminQuoteFilter,
  answerRefusal,
  billsMatchQuotes,
  bookRefusal,
  daysLabel,
  garageAnswerBy,
  isOwnRepairMediaKey,
  openLimitReached,
  priceRangeLabel,
  quoteState,
  repairMediaFolder,
  requestClosesAt,
  requestState,
  requestTitle,
} from './repair-quotes.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)
const HOUR = 60 * 60 * 1000

/** Open 9 am to 7 pm every day. */
const OPEN_DAILY: GarageCalendar = {
  pausedAt: null,
  hours: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '09:00:00', closeTime: '19:00:00', isClosed: false })),
  closures: [],
}

describe('repair quotes: the clocks', () => {
  test('a request closes 48 hours after it is sent', () => {
    const sent = IST('2026-11-16T10:00:00')
    expect(requestClosesAt(sent).getTime() - sent.getTime()).toBe(48 * HOUR)
  })

  test('a garage open now has 4 of its working hours', () => {
    const askedAt = IST('2026-11-16T10:00:00')
    const by = garageAnswerBy({ askedAt, closesAt: requestClosesAt(askedAt), calendar: OPEN_DAILY })
    expect(by.toISOString()).toBe(IST('2026-11-16T14:00:00').toISOString())
  })

  test('the clock stops at closing and runs on when it opens', () => {
    // 1 hour tonight (6 → 7 pm), 3 more tomorrow from 9 am.
    const askedAt = IST('2026-11-16T18:00:00')
    const by = garageAnswerBy({ askedAt, closesAt: requestClosesAt(askedAt), calendar: OPEN_DAILY })
    expect(by.toISOString()).toBe(IST('2026-11-17T12:00:00').toISOString())
  })

  test('asked while shut: 4 hours from its next opening', () => {
    const askedAt = IST('2026-11-16T22:30:00')
    const by = garageAnswerBy({ askedAt, closesAt: requestClosesAt(askedAt), calendar: OPEN_DAILY })
    expect(by.toISOString()).toBe(IST('2026-11-17T13:00:00').toISOString())
  })

  test('never later than an hour before the request closes (a paused garage)', () => {
    const askedAt = IST('2026-11-16T10:00:00')
    const closesAt = requestClosesAt(askedAt)
    const by = garageAnswerBy({ askedAt, closesAt, calendar: { ...OPEN_DAILY, pausedAt: askedAt } })
    expect(by.getTime()).toBe(closesAt.getTime() - HOUR)
  })
})

describe('repair quotes: where things stand', () => {
  const now = IST('2026-11-16T12:00:00')
  const later = new Date(now.getTime() + HOUR)
  const earlier = new Date(now.getTime() - HOUR)

  test('request: booked and cancelled win; otherwise open until it closes', () => {
    expect(requestState({ status: 'booked', closesAt: earlier }, now)).toBe('booked')
    expect(requestState({ status: 'cancelled', closesAt: later }, now)).toBe('cancelled')
    expect(requestState({ status: 'open', closesAt: later }, now)).toBe('open')
    expect(requestState({ status: 'open', closesAt: now }, now)).toBe('expired')
  })

  test('quote: answered, waiting in time, missed, or closed with the request', () => {
    expect(quoteState({ status: 'quoted', respondBy: earlier }, 'expired', now)).toBe('quoted')
    expect(quoteState({ status: 'declined', respondBy: later }, 'open', now)).toBe('declined')
    expect(quoteState({ status: 'waiting', respondBy: later }, 'open', now)).toBe('waiting')
    expect(quoteState({ status: 'waiting', respondBy: earlier }, 'open', now)).toBe('missed')
    expect(quoteState({ status: 'waiting', respondBy: later }, 'cancelled', now)).toBe('closed')
  })

  test('a garage answers once, in time, while the request is open', () => {
    expect(answerRefusal({ status: 'waiting', respondBy: later }, 'open', now)).toBeNull()
    expect(answerRefusal({ status: 'quoted', respondBy: later }, 'open', now)).toBe('already_answered')
    expect(answerRefusal({ status: 'waiting', respondBy: earlier }, 'open', now)).toBe('time_passed')
    expect(answerRefusal({ status: 'waiting', respondBy: later }, 'expired', now)).toBe('closed')
    expect(answerRefusal({ status: 'waiting', respondBy: later }, 'booked', now)).toBe('closed')
  })

  test('a visit is booked only from a quote, while the request is open', () => {
    expect(bookRefusal({ status: 'quoted' }, 'open')).toBeNull()
    expect(bookRefusal({ status: 'declined' }, 'open')).toBe('not_quoted')
    expect(bookRefusal({ status: 'waiting' }, 'open')).toBe('not_quoted')
    expect(bookRefusal({ status: 'quoted' }, 'expired')).toBe('not_open')
    expect(bookRefusal({ status: 'quoted' }, 'booked')).toBe('not_open')
  })

  test('two open requests at most', () => {
    expect(REPAIR_QUOTE_RULES.maxOpenPerCustomer).toBe(2)
    expect(openLimitReached(1)).toBe(false)
    expect(openLimitReached(2)).toBe(true)
  })
})

describe('repair quotes: admin’s chips', () => {
  test('booked, expired with a quote, no quote, open; cancelled under All only', () => {
    expect(adminQuoteFilter('booked', ['quoted'])).toBe('booked')
    expect(adminQuoteFilter('cancelled', ['quoted'])).toBeNull()
    expect(adminQuoteFilter('expired', ['quoted', 'closed'])).toBe('expired')
    expect(adminQuoteFilter('expired', ['declined', 'closed'])).toBe('no_quote')
    expect(adminQuoteFilter('open', ['declined', 'missed'])).toBe('no_quote')
    expect(adminQuoteFilter('open', ['declined', 'waiting'])).toBe('open')
    expect(adminQuoteFilter('open', ['quoted', 'missed'])).toBe('open')
  })
})

describe('repair quotes: "Final bills match quotes"', () => {
  const job = (billTotal: number | null, completed = true) => ({ priceFrom: 4000, priceTo: 5500, completed, billTotal })

  test('three billed jobs, every bill inside its range', () => {
    expect(billsMatchQuotes([job(4000), job(5500), job(4800)])).toEqual({ badge: true, inside: 3, billed: 3 })
  })

  test('fewer than three billed jobs is no badge yet', () => {
    expect(billsMatchQuotes([job(4000), job(5000), job(null), job(4500, false)]).badge).toBe(false)
  })

  test('one bill outside its range loses it', () => {
    expect(billsMatchQuotes([job(4000), job(5000), job(4500), job(6200)])).toEqual({ badge: false, inside: 3, billed: 4 })
  })
})

describe('repair quotes: media keys', () => {
  const owner = 'a'.repeat(32)
  const other = 'b'.repeat(32)
  const file = '99999999-8888-4777-8666-555555555555'

  test('only this customer’s own folder, with a known type', () => {
    expect(repairMediaFolder(owner)).toBe(`repair-quotes/${owner}/`)
    expect(isOwnRepairMediaKey(`repair-quotes/${owner}/${file}.mp4`, owner)).toBe(true)
    expect(isOwnRepairMediaKey(`repair-quotes/${owner}/${file}.jpg`, owner)).toBe(true)
    expect(isOwnRepairMediaKey(`repair-quotes/${other}/${file}.jpg`, owner)).toBe(false)
    expect(isOwnRepairMediaKey(`repair-quotes/${owner}/${file}.pdf`, owner)).toBe(false)
    expect(isOwnRepairMediaKey(`repair-quotes/${owner}/../x/${file}.jpg`, owner)).toBe(false)
    expect(isOwnRepairMediaKey(`vendors/${owner}/job-photos/${file}.jpg`, owner)).toBe(false)
    expect(isOwnRepairMediaKey(`repair-quotes//${file}.jpg`, '')).toBe(false)
  })
})

describe('repair quotes: words', () => {
  test('prices, days and the title', () => {
    expect(priceRangeLabel(4000, 5500)).toBe('₹4,000–5,500')
    expect(priceRangeLabel(150000, 150000)).toBe('₹1,50,000')
    expect(daysLabel(1)).toBe('1 day')
    expect(daysLabel(3)).toBe('3 days')
    expect(requestTitle({ damageArea: 'Front bumper, left side', brief: 'x' })).toBe('Front bumper, left side')
    expect(requestTitle({ damageArea: null, brief: 'Rear door dent' })).toBe('Rear door dent')
    expect(requestTitle({ damageArea: ' ', brief: 'a'.repeat(80) })).toHaveLength(58)
  })
})
