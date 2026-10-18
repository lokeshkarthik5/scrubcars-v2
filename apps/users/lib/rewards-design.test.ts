import { describe, expect, test } from 'bun:test'
import { BADGE_CATALOG } from '@repo/core/achievements'
import type { CabinetBadge } from '@repo/core/api/reward-extras'
import { featuredBadges } from './featured-badges'
import { JACKPOT_CONFETTI_COLORS } from './confetti'
import { GIFT_ARTS, giftArtFor } from './gifts'
import { isMoneyPrize, prizeTier, voucherEndsAt } from './scratch-prize'
import { splitBig } from './wrapped-image'

describe('gift artwork', () => {
  test('every card is a design the server stores as itself', () => {
    expect([...GIFT_ARTS]).toEqual(['shine', 'midnight', 'pearl', 'birthday', 'diwali', 'thank_you'])
    for (const art of GIFT_ARTS) expect(giftArtFor(art)).toBe(art)
  })

  test('gifts bought before 0055 as fresh are drawn as Pearl', () => {
    expect(giftArtFor('fresh')).toBe('pearl')
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

  test('the free wash confetti has no gold or yellow piece to vanish into the gold card', () => {
    for (const hex of JACKPOT_CONFETTI_COLORS) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const saturated = max > 0 && (max - min) / max > 0.25
      // Gold and yellow: red and green both high, blue clearly lower.
      const goldish = saturated && g > 0.45 && r - b > 0.25
      expect(goldish).toBe(false)
    }
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
