import { describe, expect, test } from 'bun:test'
import {
  FREE_WASH_RULES,
  REFERRAL_CREDIT,
  coveragePushWords,
  freeWashDiscount,
  isFreeWashCheckout,
  zoneIsLive,
  freeWashEligibleSubtotal,
  freeWashEndsAt,
  freeWashesLeft,
  isReachPushHour,
  launchPushWords,
  referralCredit,
  showLaunchBanner,
  signupOffer,
  signupPushDue,
  signupRefusal,
  signupsToIssue,
  waitingCount,
  zonesToLaunch,
} from './area-signups.js'
import { bannedPhraseIn } from './copy-rules.js'
import { computeDiscount } from './discounts.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)
const wash = (amount: string) => ({ category: 'car_wash', amount })

describe('the free wash’s money', () => {
  test('₹299 wash: free means ₹0, no ₹1 left for Razorpay', () => {
    expect(freeWashDiscount([wash('299.00')], '299.00')).toMatchObject({ discountAmount: '299.00', finalAmount: '0.00' })
  })

  test('₹499 wash: the same, ₹0', () => {
    expect(freeWashDiscount([wash('499.00')], '499.00')).toMatchObject({ discountAmount: '499.00', finalAmount: '0.00' })
  })

  test('₹500 wash: ₹499 off, ₹1 to pay (paid normally)', () => {
    expect(freeWashDiscount([wash('500.00')], '500.00')).toMatchObject({ discountAmount: '499.00', finalAmount: '1.00' })
  })

  test('a ₹0 checkout is booked without payment only when a free wash brought it there', () => {
    expect(isFreeWashCheckout('free_wash', '0.00')).toBe(true)
    expect(isFreeWashCheckout('free_wash', '1.00')).toBe(false)
    expect(isFreeWashCheckout('free_wash', '100.00')).toBe(false) // a travel fee is still paid
    expect(isFreeWashCheckout('admin', '0.00')).toBe(false)
    expect(isFreeWashCheckout(undefined, '0.00')).toBe(false)
  })

  test('only the free wash may reach ₹0: any other ₹499-off code keeps the ₹1 floor', () => {
    const flat = { discountType: 'fixed' as const, percentOff: null, amountOff: '499.00', maxDiscountAmount: null }
    expect(computeDiscount(flat, '299.00')).toEqual({ discountAmount: '298.00', finalAmount: '1.00' })
    expect(computeDiscount(flat, '299.00', undefined, { allowFree: true })).toEqual({ discountAmount: '299.00', finalAmount: '0.00' })
  })

  test('₹1,800 wash: ₹499 off, the customer pays the rest', () => {
    expect(freeWashDiscount([wash('1800.00')], '1800.00')).toMatchObject({ discountAmount: '499.00', finalAmount: '1301.00' })
  })

  test('with other services, the whole wash comes off (no ₹1 left on it)', () => {
    expect(
      freeWashDiscount([wash('299.00'), { category: 'detailing', amount: '1500.00' }], '1799.00')
    ).toMatchObject({ discountAmount: '299.00', finalAmount: '1500.00' })
  })

  test('one wash: two car washes still get only the dearest one’s value, at most ₹499', () => {
    expect(freeWashEligibleSubtotal([wash('299.00'), wash('399.00')])).toBe('399.00')
    expect(freeWashDiscount([wash('299.00'), wash('399.00')], '698.00')).toMatchObject({ discountAmount: '399.00' })
  })

  test('no car wash: nothing to take it off', () => {
    expect(freeWashDiscount([{ category: 'detailing', amount: '999.00' }], '999.00')).toBeNull()
    expect(freeWashEligibleSubtotal([{ category: 'coating', amount: '5000.00' }])).toBeNull()
  })

  test('valid 30 days from the launch', () => {
    expect(freeWashEndsAt(IST('2026-11-01T10:00:00'))).toEqual(IST('2026-12-01T10:00:00'))
    expect(FREE_WASH_RULES.validDays).toBe(30)
    expect(FREE_WASH_RULES.maxRupees).toBe(499)
  })
})

describe('signing up', () => {
  test('the first 50 of a zone get the free wash; the 51st only "Notify me"', () => {
    expect(signupOffer(1).freeWash).toBe(true)
    expect(signupOffer(50).freeWash).toBe(true)
    expect(signupOffer(51).freeWash).toBe(false)
    expect(freeWashesLeft(49)).toBe(1)
    expect(freeWashesLeft(50)).toBe(0)
    expect(freeWashesLeft(80)).toBe(0)
  })

  test('once per zone, and never for a zone that already has a garage', () => {
    expect(signupRefusal({ zoneLive: false, alreadySignedUp: false })).toBeNull()
    expect(signupRefusal({ zoneLive: true, alreadySignedUp: false })).toBe('ZONE_LIVE')
    expect(signupRefusal({ zoneLive: false, alreadySignedUp: true })).toBe('ALREADY_SIGNED_UP')
  })

  test('honest counts: "N waiting" only from 10', () => {
    expect(waitingCount(0)).toBeNull()
    expect(waitingCount(9)).toBeNull()
    expect(waitingCount(10)).toBe(10)
  })
})

describe('launch day', () => {
  test('zones with a listed garage and no live_at; never one already live (idempotent)', () => {
    const zones = [
      { slug: 'adyar', liveAt: null },
      { slug: 'velachery', liveAt: null },
      { slug: 'guindy', liveAt: IST('2026-10-01T00:00:00') },
    ]
    const withGarage = new Set(['adyar', 'guindy'])
    expect(zonesToLaunch(zones, withGarage).map((z) => z.slug)).toEqual(['adyar'])
    // A second run, after adyar's live_at is set, launches nothing.
    expect(zonesToLaunch(zones.map((z) => ({ ...z, liveAt: z.liveAt ?? IST('2026-10-29T10:00:00') })), withGarage)).toEqual([])
  })

  test('free washes go to the first 50 not issued one yet, in order', () => {
    const signups = [
      { id: 'c', position: 3, freeWash: true, discountId: null },
      { id: 'a', position: 1, freeWash: true, discountId: 'already' },
      { id: 'b', position: 2, freeWash: true, discountId: null },
      { id: 'late', position: 51, freeWash: false, discountId: null },
    ]
    expect(signupsToIssue(signups).map((s) => s.id)).toEqual(['b', 'c'])
    // Issued once: nothing left on a second pass.
    expect(signupsToIssue(signups.map((s) => ({ ...s, discountId: s.discountId ?? 'x' })))).toEqual([])
  })
})

describe('coming back', () => {
  const signup = {
    createdAt: IST('2026-10-01T10:00:00'),
    launchPushAt: null,
    coveragePushAt: null,
    reminderPushAt: null,
  }
  const now = IST('2026-10-10T10:00:00')

  test('a live zone: one launch message', () => {
    expect(signupPushDue(signup, { zoneLive: true, coveredNow: false }, now)).toBe('launch')
    expect(signupPushDue({ ...signup, launchPushAt: now }, { zoneLive: true, coveredNow: true }, now)).toBeNull()
  })

  test('a garage that now reaches the area: one message', () => {
    expect(signupPushDue(signup, { zoneLive: false, coveredNow: true }, now)).toBe('coverage')
    expect(signupPushDue({ ...signup, coveragePushAt: now }, { zoneLive: false, coveredNow: true }, now)).toBeNull()
  })

  test('14 quiet days: one reminder, then nothing', () => {
    expect(signupPushDue(signup, { zoneLive: false, coveredNow: false }, now)).toBeNull()
    const later = IST('2026-10-15T10:00:00')
    expect(signupPushDue(signup, { zoneLive: false, coveredNow: false }, later)).toBe('reminder')
    expect(signupPushDue({ ...signup, reminderPushAt: later }, { zoneLive: false, coveredNow: false }, IST('2026-12-01T10:00:00'))).toBeNull()
    // A coverage message was a change: no reminder after it.
    expect(signupPushDue({ ...signup, coveragePushAt: now }, { zoneLive: false, coveredNow: true }, later)).toBeNull()
  })

  test('messages from 9 am to 8:59 pm IST', () => {
    expect(isReachPushHour(IST('2026-10-10T08:59:00'))).toBe(false)
    expect(isReachPushHour(IST('2026-10-10T09:00:00'))).toBe(true)
    expect(isReachPushHour(IST('2026-10-10T20:59:00'))).toBe(true)
    expect(isReachPushHour(IST('2026-10-10T21:00:00'))).toBe(false)
  })

  test('Home’s launch banner once', () => {
    expect(showLaunchBanner({ launchBannerSeenAt: null }, true)).toBe(true)
    expect(showLaunchBanner({ launchBannerSeenAt: now }, true)).toBe(false)
    expect(showLaunchBanner({ launchBannerSeenAt: null }, false)).toBe(false)
  })

  test('the words pass the copy rules', () => {
    for (const words of [launchPushWords('Velachery', 3), launchPushWords('Velachery', 1), coveragePushWords('Velachery', 'Glossy', 'doorstep')]) {
      expect(bannedPhraseIn(`${words.title} ${words.body}`)).toBeNull()
    }
    expect(launchPushWords('Velachery', 1).body).toBe('1 garage near you. Your free wash is ready.')
  })
})

describe('the referral credit', () => {
  const base = { vendorId: 'v', garageLive: true, completedPaidBooking: true, alreadyCreditedForGarage: false, creditedSoFarRupees: 0 }

  test('₹100 once the linked garage is live and they completed a paid booking there', () => {
    expect(referralCredit(base)).toEqual({ amountRupees: 100 })
    expect(REFERRAL_CREDIT).toEqual({ perGarageRupees: 100, maxPerCustomerRupees: 500 })
  })

  test('not before: not linked, not live, no paid booking', () => {
    expect(referralCredit({ ...base, vendorId: null })).toEqual({ refusal: 'NOT_LINKED' })
    expect(referralCredit({ ...base, garageLive: false })).toEqual({ refusal: 'GARAGE_NOT_LIVE' })
    expect(referralCredit({ ...base, completedPaidBooking: false })).toEqual({ refusal: 'NO_PAID_BOOKING' })
  })

  test('once per garage', () => {
    expect(referralCredit({ ...base, alreadyCreditedForGarage: true })).toEqual({ refusal: 'ALREADY_FOR_GARAGE' })
  })

  test('₹500 at most a customer: the last one cut to what is left', () => {
    expect(referralCredit({ ...base, creditedSoFarRupees: 400 })).toEqual({ amountRupees: 100 })
    expect(referralCredit({ ...base, creditedSoFarRupees: 450 })).toEqual({ amountRupees: 50 })
    expect(referralCredit({ ...base, creditedSoFarRupees: 500 })).toEqual({ refusal: 'CAP_REACHED' })
  })
})

describe('a zone with Detlio in it (no free-wash list to join)', () => {
  test('a garage there now, or launched once and its garage gone since', () => {
    expect(zoneIsLive({ liveAt: null }, false)).toBe(false)
    expect(zoneIsLive({ liveAt: null }, true)).toBe(true)
    expect(zoneIsLive({ liveAt: IST('2026-10-20T10:00:00') }, false)).toBe(true)
  })
})
