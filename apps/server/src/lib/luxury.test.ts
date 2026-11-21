import { describe, expect, test } from 'bun:test'
import {
  afterSend,
  applyRefusal,
  decisionRefusal,
  holdsSilverOrGold,
  isOwnLuxuryPhotoKey,
  LUXURY_BRANDS,
  LUXURY_DECISIONS,
  luxuryShown,
  onApplicationsList,
  orderBrands,
  reapplyOn,
  waitUntil,
  type LuxuryStatus,
} from './luxury.js'

const GOLD = { gold: true, silver: true }
const SILVER = { gold: false, silver: true }
const BRONZE = { gold: false, silver: false }
const NOW = new Date('2026-11-21T06:30:00Z') // 12:00 IST
const app = (status: LuxuryStatus, decidedAt: Date | null = null) => ({ status, decidedAt })

describe('who shows the badge', () => {
  test('approved and Silver or Gold: shown', () => {
    expect(luxuryShown({ luxuryApprovedAt: NOW }, SILVER)).toBe(true)
    expect(luxuryShown({ luxuryApprovedAt: NOW.toISOString() }, GOLD)).toBe(true)
  })

  test('below Silver the badge hides, and comes back with Silver, nothing redone', () => {
    const row = { luxuryApprovedAt: NOW }
    expect(luxuryShown(row, BRONZE)).toBe(false)
    expect(luxuryShown(row, null)).toBe(false)
    expect(luxuryShown(row, SILVER)).toBe(true)
  })

  test('never without the approval', () => {
    expect(luxuryShown({ luxuryApprovedAt: null }, GOLD)).toBe(false)
  })

  test('Silver or Gold held', () => {
    expect(holdsSilverOrGold(GOLD)).toBe(true)
    expect(holdsSilverOrGold({ gold: true, silver: false })).toBe(true)
    expect(holdsSilverOrGold(SILVER)).toBe(true)
    expect(holdsSilverOrGold(BRONZE)).toBe(false)
    expect(holdsSilverOrGold(undefined)).toBe(false)
  })
})

describe('applying: Silver or Gold only', () => {
  test('a Silver or Gold garage may send its first application', () => {
    expect(applyRefusal({ held: SILVER, app: null, now: NOW })).toBeNull()
    expect(applyRefusal({ held: GOLD, app: null, now: NOW })).toBeNull()
  })

  test('Bronze (or no tier) may not', () => {
    expect(applyRefusal({ held: BRONZE, app: null, now: NOW })).toBe('LUXURY_NEEDS_SILVER')
    expect(applyRefusal({ held: null, app: null, now: NOW })).toBe('LUXURY_NEEDS_SILVER')
    expect(applyRefusal({ held: BRONZE, app: app('more'), now: NOW })).toBe('LUXURY_NEEDS_SILVER')
  })

  test('an application under review can still be edited below Silver (it waits off the list)', () => {
    expect(applyRefusal({ held: BRONZE, app: app('review'), now: NOW })).toBeNull()
  })

  test('approved: nothing to send', () => {
    expect(applyRefusal({ held: SILVER, app: app('approved'), now: NOW })).toBe('LUXURY_ALREADY_APPROVED')
  })

  test('declined: not for 30 IST days, then again', () => {
    const declined = app('declined', new Date('2026-11-21T05:00:00Z'))
    expect(reapplyOn(declined.decidedAt!)).toBe('2026-12-21')
    expect(waitUntil(declined, NOW)).toBe('2026-12-21')
    expect(applyRefusal({ held: SILVER, app: declined, now: NOW })).toBe('LUXURY_WAIT')
    const later = new Date('2026-12-20T18:30:00Z') // 21 Dec, 00:00 IST
    expect(waitUntil(declined, later)).toBeNull()
    expect(applyRefusal({ held: SILVER, app: declined, now: later })).toBeNull()
  })

  test('after Ask for more or a removal, sending again is the point', () => {
    expect(applyRefusal({ held: SILVER, app: app('more'), now: NOW })).toBeNull()
    expect(applyRefusal({ held: SILVER, app: app('removed', NOW), now: NOW })).toBeNull()
  })

  test('an edit or an answer keeps the place in the queue; a new round joins now', () => {
    const sentAt = new Date('2026-11-18T10:00:00Z')
    expect(afterSend(null, NOW)).toEqual({ status: 'review', sentAt: NOW, timesSent: 1, newRound: true })
    expect(afterSend({ ...app('review'), sentAt, timesSent: 1 }, NOW)).toEqual({
      status: 'review',
      sentAt,
      timesSent: 1,
      newRound: false,
    })
    expect(afterSend({ ...app('more', NOW), sentAt, timesSent: 1 }, NOW).sentAt).toBe(sentAt)
    expect(afterSend({ ...app('declined', NOW), sentAt, timesSent: 1 }, NOW)).toEqual({
      status: 'review',
      sentAt: NOW,
      timesSent: 2,
      newRound: true,
    })
  })

  test('brands are each once, in the form order', () => {
    expect(orderBrands(['Mini', 'BMW', 'Other', 'BMW', 'Nope'])).toEqual(['BMW', 'Mini', 'Other'])
    expect(LUXURY_BRANDS[0]).toBe('BMW')
  })

  test("photos must be the garage's own luxury uploads", () => {
    const vendor = 'e2e00000-0000-4000-8000-000000008200'
    const key = `vendors/${vendor}/luxury/0f8fad5b-d9cb-469f-a165-70867728950e.jpg`
    expect(isOwnLuxuryPhotoKey(key, vendor)).toBe(true)
    expect(isOwnLuxuryPhotoKey(key.replace('/luxury/', '/'), vendor)).toBe(false)
    expect(isOwnLuxuryPhotoKey(key.replace('8200', '8201'), vendor)).toBe(false)
    expect(isOwnLuxuryPhotoKey(`${key}/../x.jpg`, vendor)).toBe(false)
    expect(isOwnLuxuryPhotoKey(null, vendor)).toBe(false)
  })
})

describe("the team's decisions", () => {
  const base = { note: null, held: SILVER, inBin: false }

  test('Approve answers a waiting application, with Silver or Gold held, no note needed', () => {
    expect(decisionRefusal({ ...base, decision: 'approve', app: app('review') })).toBeNull()
    expect(decisionRefusal({ ...base, decision: 'approve', app: app('more') })).toBeNull()
    expect(decisionRefusal({ ...base, decision: 'approve', app: app('review'), held: BRONZE })).toBe('LUXURY_NEEDS_SILVER')
  })

  test('Ask for more and Decline need a note the garage reads', () => {
    for (const decision of ['more', 'decline'] as const) {
      expect(decisionRefusal({ ...base, decision, app: app('review') })).toBe('LUXURY_NOTE_REQUIRED')
      expect(decisionRefusal({ ...base, decision, app: app('review'), note: '   ' })).toBe('LUXURY_NOTE_REQUIRED')
      expect(decisionRefusal({ ...base, decision, app: app('review'), note: 'Add a bay photo.' })).toBeNull()
      // Below Silver the team can still decline or ask for more.
      expect(decisionRefusal({ ...base, decision, app: app('review'), note: 'x', held: BRONZE })).toBeNull()
    }
  })

  test('an answered application cannot be answered again', () => {
    for (const status of ['approved', 'declined', 'removed'] as const) {
      for (const decision of ['approve', 'more', 'decline'] as const) {
        expect(decisionRefusal({ ...base, decision, app: app(status), note: 'x' })).toBe('LUXURY_NOT_PENDING')
      }
    }
  })

  test('Remove takes an approved badge away, with a note', () => {
    expect(decisionRefusal({ ...base, decision: 'remove', app: app('approved'), note: 'Standards slipped.' })).toBeNull()
    expect(decisionRefusal({ ...base, decision: 'remove', app: app('approved') })).toBe('LUXURY_NOTE_REQUIRED')
    expect(decisionRefusal({ ...base, decision: 'remove', app: app('review'), note: 'x' })).toBe('LUXURY_NOT_APPROVED')
  })

  test('nothing for a garage that never applied, or one in the Bin', () => {
    for (const decision of LUXURY_DECISIONS) {
      expect(decisionRefusal({ ...base, decision, app: null, note: 'x' })).toBe('LUXURY_NO_APPLICATION')
      expect(decisionRefusal({ ...base, decision, app: app('review'), note: 'x', inBin: true })).toBe('VENDOR_IN_BIN')
    }
  })

  test('"Luxury applications": waiting and Silver or Gold held', () => {
    expect(onApplicationsList(app('review'), SILVER)).toBe(true)
    expect(onApplicationsList(app('more'), GOLD)).toBe(true)
    // A garage that drops below Silver while waiting leaves the list.
    expect(onApplicationsList(app('review'), BRONZE)).toBe(false)
    for (const status of ['approved', 'declined', 'removed'] as const) {
      expect(onApplicationsList(app(status), SILVER)).toBe(false)
    }
    expect(onApplicationsList(null, SILVER)).toBe(false)
  })
})
