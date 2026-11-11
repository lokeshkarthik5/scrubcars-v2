import { describe, expect, test } from 'bun:test'
import {
  adminLoginDeleteRefusal,
  claimDeleteRefusal,
  giftDeleteRefusal,
  maskedPhone,
  typedConfirmMatches,
  zoneDeleteLines,
} from './owner-delete.js'

describe('the typed confirmation', () => {
  test('case and outer spaces are forgiven, spelling is not', () => {
    expect(typedConfirmMatches('  c-000123 ', 'C-000123')).toBe(true)
    expect(typedConfirmMatches('C-00123', 'C-000123')).toBe(false)
    expect(typedConfirmMatches('', '')).toBe(false)
  })
})

describe('a redo claim goes once its free redo booking is gone', () => {
  test('no redo booking: it can go', () => {
    expect(claimDeleteRefusal({ redoBookingId: null })).toBeNull()
  })

  test('a redo booking: delete that first', () => {
    expect(claimDeleteRefusal({ redoBookingId: 'b' })).toMatchObject({ status: 409, code: 'GUARANTEE_REDO_EXISTS' })
    expect(claimDeleteRefusal({ redoBookingId: 'b' })!.message).toStartWith('This claim has a free redo booking. Delete the redo booking first')
  })
})

describe('only a gift nobody redeemed', () => {
  test('paid or pending, not redeemed: it can go', () => {
    expect(giftDeleteRefusal({ status: 'paid', redeemedAt: null })).toBeNull()
    expect(giftDeleteRefusal({ status: 'pending', redeemedAt: null })).toBeNull()
  })

  test('redeemed: its credit is the customer\'s', () => {
    const refusal = giftDeleteRefusal({ status: 'redeemed', redeemedAt: new Date('2026-11-01T00:00:00Z') })
    expect(refusal).toEqual({
      status: 409,
      code: 'GIFT_REDEEMED',
      message: "This gift was redeemed: its credit is the customer's now, so it can't be deleted.",
    })
  })
})

describe('a team login', () => {
  test('never your own', () => {
    expect(adminLoginDeleteRefusal({ target: { id: 'a', isOwner: false }, actorLoginId: 'a' })?.code).toBe('ADMIN_LOGIN_SELF')
  })

  test('never the owner\'s, even from the shared login', () => {
    expect(adminLoginDeleteRefusal({ target: { id: 'o', isOwner: true }, actorLoginId: null })?.code).toBe(
      'ADMIN_LOGIN_OWNER_KEPT'
    )
  })

  test('anyone else\'s can go', () => {
    expect(adminLoginDeleteRefusal({ target: { id: 'b', isOwner: false }, actorLoginId: 'o' })).toBeNull()
  })
})

describe('what deleting a zone in use takes', () => {
  test('a line each, the zeros left out', () => {
    expect(zoneDeleteLines({ leads: 2, signups: 1, requests: 0, recommendations: 3 })).toEqual([
      "1 customer's sign-up goes, with any free wash still held.",
      '2 leads move to whichever zone their pins are in, or to none.',
      '3 recommendations stay without a zone.',
    ])
    expect(zoneDeleteLines({ leads: 0, signups: 0, requests: 1, recommendations: 0 })).toEqual([
      "1 visit request keeps the zone's name, as sent.",
    ])
  })
})

describe('a phone in a list', () => {
  test('the last four digits only; a deleted account\'s placeholder shows as nothing', () => {
    expect(maskedPhone('9840012345')).toBe('••••2345')
    expect(maskedPhone('deleted-abcdefghijkl')).toBeNull()
    expect(maskedPhone(null)).toBeNull()
  })
})
