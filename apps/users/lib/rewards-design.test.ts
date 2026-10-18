import { describe, expect, test } from 'bun:test'
import { BADGE_CATALOG } from '@repo/core/achievements'
import type { CabinetBadge } from '@repo/core/api/reward-extras'
import { featuredBadges } from './featured-badges'
import { GIFT_ARTS, giftArtFor, giftPathWithArt, occasionFromHash, storedGiftDesign } from './gifts'
import { isMoneyPrize, prizeLines, prizeTier, voucherEndsAt } from './scratch-prize'
import { splitBig } from './wrapped-image'

describe('gift artwork', () => {
  test('every artwork is stored as a design the server takes', () => {
    for (const art of GIFT_ARTS) expect(['shine', 'midnight', 'fresh']).toContain(storedGiftDesign(art))
    expect(storedGiftDesign('pearl')).toBe('fresh')
  })

  test('the stored look, or the occasion from the link when it matches', () => {
    expect(giftArtFor('fresh')).toBe('pearl')
    expect(giftArtFor('midnight', 'diwali')).toBe('diwali')
    // An occasion that does not go with the stored design is ignored.
    expect(giftArtFor('shine', 'diwali')).toBe('shine')
    expect(giftArtFor('shine', 'nonsense')).toBe('shine')
  })

  test('the occasion rides in the fragment only', () => {
    expect(giftPathWithArt('/gift/ABC', 'birthday')).toBe('/gift/ABC#card=birthday')
    expect(giftPathWithArt('/gift/ABC', 'shine')).toBe('/gift/ABC')
    expect(occasionFromHash('#card=thankyou')).toBe('thankyou')
    expect(occasionFromHash('#card=midnight')).toBeNull()
    expect(occasionFromHash('')).toBeNull()
  })
})

describe('scratch prizes', () => {
  test('a look per prize', () => {
    expect(prizeTier('small_off')).toBe('silver')
    expect(prizeTier('medium_off')).toBe('silver')
    expect(prizeTier('big_off')).toBe('gold')
    expect(prizeTier('bonus_stamp')).toBe('stamp')
    expect(prizeTier('free_wash')).toBe('jackpot')
    expect(isMoneyPrize('bonus_stamp')).toBe(false)
  })

  test('the words', () => {
    expect(prizeLines({ outcome: 'medium_off', amount: '50.00' })).toEqual({ eyebrow: 'You won', big: '₹50', small: 'off your next booking' })
    expect(prizeLines({ outcome: 'free_wash', amount: '299.00' }).small).toBe('Up to ₹299 off a booking')
  })

  test('a voucher ends at the end of its last day in India', () => {
    expect(voucherEndsAt('2026-12-17')).toBe('2026-12-17T18:29:59.999Z')
  })
})

describe('featuredBadges', () => {
  const badge = (key: CabinetBadge['key'], earnedAt: string | null, current = 0): CabinetBadge => {
    const info = BADGE_CATALOG.find((b) => b.key === key)!
    return { key, label: info.label, howTo: info.howTo, bonusStamps: 0, progress: { current, goal: info.goal }, earned: earnedAt ? { id: key, at: earnedAt } : null }
  }

  test('newest earned first, then the locked ones closest to done', () => {
    const shown = featuredBadges(
      {
        badges: [badge('first_shine', '2025-01-01T00:00:00Z'), badge('explorer', '2026-10-01T00:00:00Z'), badge('washes_25', null, 20), badge('night_owl', null, 1)],
        challengeBadges: [{ id: 'c1', label: 'Onam Shine', challengeId: null, at: '2026-09-01T00:00:00Z' }],
      },
      4
    )
    expect(shown.map((s) => (s.kind === 'badge' ? s.badge.key : s.id))).toEqual(['explorer', 'c1', 'first_shine', 'washes_25'])
  })
})

describe('splitBig', () => {
  test('a leading figure and its unit', () => {
    expect(splitBig('18 washes')).toEqual({ figure: '18', unit: 'washes' })
    expect(splitBig('₹1,240')).toEqual({ figure: '₹1,240', unit: '' })
    expect(splitBig('Marina Auto Spa')).toBeNull()
  })
})
