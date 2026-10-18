import { describe, expect, test } from 'bun:test'
import { CAR_CARE_TIPS } from '@repo/core/car-care-tips'
import { GIFT_ARTS } from './gifts'
import { CAR_CUTS, CARD, LOOKS, firstName, floorLine, giftCardSpec, prizeCardSpec, prizeTitle, titleSize } from './premium-card'

const TIPS = new Set(CAR_CARE_TIPS.map((t) => t.text))

describe('gift premium cards', () => {
  test('a card per design, each with its own look', () => {
    for (const art of GIFT_ARTS) expect(giftCardSpec({ design: art, amount: 1000 }).look).toBe(art)
    expect(giftCardSpec({ design: 'fresh', amount: 1000 }).look).toBe('pearl')
  })

  test('the chips: the amount, who it is for, how long it lasts or the occasion', () => {
    const shine = giftCardSpec({ design: 'shine', amount: '1000.00', recipientName: 'Meena Krishnan', validMonths: 12 })
    expect(shine.chips.map((c) => c.text)).toEqual(['₹1,000', 'For Meena', 'Valid 12 months'])
    expect(shine.title).toEqual(['A gift for you', '₹1,000 of car care'])
    const diwali = giftCardSpec({ design: 'diwali', amount: 2000, recipientName: 'Appa' })
    expect(diwali.chips.map((c) => c.text)).toEqual(['₹2,000', 'For Appa', 'Diwali'])
    expect(diwali.title).toEqual(['Happy Diwali', '₹2,000 of car care'])
    expect(giftCardSpec({ design: 'birthday', amount: 500 }).title[0]).toBe('Happy birthday')
    expect(giftCardSpec({ design: 'thank_you', amount: 500 }).title[0]).toBe('Thank you')
  })

  test('the name can be left off; the tip stays the same', () => {
    const on = giftCardSpec({ design: 'pearl', amount: 500, recipientName: 'Priya', expiresAt: '2027-10-18T06:12:00Z' })
    const off = giftCardSpec({ design: 'pearl', amount: 500, recipientName: 'Priya', expiresAt: '2027-10-18T06:12:00Z', showName: false })
    expect(off.chips.map((c) => c.text)).toEqual(['₹500', 'Valid 12 months'])
    expect(off.tip).toBe(on.tip)
  })

  test('the same gift always shows the same tip, a real one', () => {
    const a = giftCardSpec({ design: 'shine', amount: 1000, recipientName: 'Meena', expiresAt: '2027-10-18T06:12:00Z' })
    const b = giftCardSpec({ design: 'shine', amount: '1000.00', recipientName: ' Meena ', expiresAt: '2027-10-18T06:12:00Z' })
    expect(a.tip).toBe(b.tip)
    expect(TIPS.has(a.tip)).toBe(true)
  })

  test('a Diwali card gets a Diwali tip', () => {
    const diwaliTips = new Set(CAR_CARE_TIPS.filter((t) => t.season === 'diwali').map((t) => t.text))
    for (const name of ['Appa', 'Amma', 'Ravi', 'Lakshmi']) {
      expect(diwaliTips.has(giftCardSpec({ design: 'diwali', amount: 2000, recipientName: name }).tip)).toBe(true)
    }
  })

  test('no gift code, link or message on the card', () => {
    const spec = giftCardSpec({ design: 'shine', amount: 1000, recipientName: 'Meena' })
    const words = JSON.stringify(spec)
    expect(words).not.toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}/)
    expect(words).not.toContain('/gift/')
  })

  test('a long name is cut to its first word', () => {
    expect(firstName('Meenakshisundaram Iyer')).toBe('Meenakshisund…')
    expect(firstName('  ')).toBe('')
  })
})

describe('scratch prize premium cards', () => {
  const base = { id: 'sc-1', createdAt: '2026-10-11T06:00:00Z', vendorName: 'Marina Auto Spa' }

  test('the titles', () => {
    expect(prizeTitle({ outcome: 'free_wash', amount: '299.00' })).toEqual(['Free wash', 'Jackpot'])
    expect(prizeTitle({ outcome: 'big_off', amount: '100.00' })).toEqual(['₹100 off', 'Off your next booking'])
    expect(prizeTitle({ outcome: 'bonus_stamp', amount: null })).toEqual(['Bonus star', 'On your Shine Card'])
  })

  test('the chips and looks', () => {
    const fifty = prizeCardSpec({ ...base, outcome: 'medium_off', amount: '50.00', useBy: '2026-12-17' })
    expect(fifty.chips.map((c) => c.text)).toEqual(['Scratch card', 'Marina Auto Spa', 'Use by 17 Dec'])
    expect(fifty.look).toBe('prize_silver')
    const free = prizeCardSpec({ ...base, outcome: 'free_wash', amount: '299.00', useBy: '2026-12-17' })
    expect(free.chips.map((c) => c.text)).toEqual(['Up to ₹299', 'Marina Auto Spa', 'Use by 17 Dec'])
    expect(free.look).toBe('prize_jackpot')
    const star = prizeCardSpec({ ...base, outcome: 'bonus_stamp', amount: null })
    expect(star.chips.map((c) => c.text)).toEqual(['Scratch card', 'Marina Auto Spa', 'Shine Card'])
    expect(star.look).toBe('prize_star')
    expect(prizeCardSpec({ ...base, outcome: 'big_off', amount: '100.00' }).look).toBe('prize_gold')
  })

  test('a card keeps its tip', () => {
    const a = prizeCardSpec({ ...base, outcome: 'small_off', amount: '20.00' })
    const b = prizeCardSpec({ ...base, outcome: 'small_off', amount: '20.00', useBy: '2026-12-17' })
    expect(a.tip).toBe(b.tip)
    expect(TIPS.has(a.tip)).toBe(true)
  })
})

describe('card geometry', () => {
  test('every car stands on the stage and fills it edge to edge', () => {
    for (const look of Object.values(LOOKS)) {
      const cut = CAR_CUTS[look.car]
      expect(floorLine(cut)).toBeGreaterThan(55)
      expect(floorLine(cut)).toBeLessThan(CARD.stage)
      expect(cut.left).toBeLessThanOrEqual(0)
      expect(cut.left + cut.width).toBeGreaterThanOrEqual(100)
    }
  })

  test('a long title line is set smaller', () => {
    expect(titleSize('Free wash')).toBe(CARD.title.size)
    expect(titleSize('Off your next booking')).toBeLessThan(CARD.title.size)
  })
})
