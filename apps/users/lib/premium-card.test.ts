import { describe, expect, test } from 'bun:test'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CARD_CARS, cardCarSrc } from '@repo/core/card-cars'
import { CAR_CARE_TIPS } from '@repo/core/car-care-tips'
import { GIFT_ARTS } from './gifts'
import { CARD, CARS_ILLUSTRATION_LINE, LOOKS, PHOTO, PHOTO_TONE, firstName, giftCardSpec, prizeCardSpec, prizeTitle, titleSize } from './premium-card'

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

describe('the car photo on each card', () => {
  const gift = { design: 'shine' as const, amount: 1000, recipientName: 'Meena Krishnan' }

  test('a light card gets a light photo, a Night card a dark one', () => {
    for (const art of GIFT_ARTS) {
      for (const name of ['Meena', 'Ravi', 'Appa', 'Lakshmi', 'Priya']) {
        const spec = giftCardSpec({ design: art, amount: 1500, recipientName: name })
        expect({ art, tone: spec.car.tone }).toEqual({ art, tone: PHOTO_TONE[LOOKS[art].tone] })
      }
    }
    for (const outcome of ['small_off', 'medium_off', 'big_off', 'free_wash', 'bonus_stamp'] as const) {
      for (let i = 0; i < 10; i += 1) {
        const spec = prizeCardSpec({ id: `sc-${i}`, createdAt: '2026-10-11T06:00:00Z', outcome, amount: '50.00' })
        expect({ outcome, tone: spec.car.tone }).toEqual({ outcome, tone: PHOTO_TONE[LOOKS[spec.look].tone] })
      }
    }
  })

  test("the buyer's preview, the share screen and the recipient's page show the same car", () => {
    const preview = giftCardSpec({ ...gift, validMonths: 12 })
    const shared = giftCardSpec({ ...gift, amount: '1000.00', expiresAt: '2027-10-18T06:12:00Z', showName: true })
    const recipient = giftCardSpec({ ...gift, amount: '1000.00', recipientName: ' Meena Krishnan ', expiresAt: '2027-10-18T06:12:00Z' })
    const image = giftCardSpec({ ...gift, amount: '1000.00', expiresAt: '2027-10-18T06:12:00Z', showName: false })
    expect(shared.car).toBe(preview.car)
    expect(recipient.car).toBe(preview.car)
    expect(image.car).toBe(preview.car)
  })

  test('a scratch card keeps its car; different cards and gifts vary', () => {
    const base = { createdAt: '2026-10-11T06:00:00Z', outcome: 'free_wash' as const, amount: '299.00' }
    expect(prizeCardSpec({ ...base, id: 'sc-9' }).car).toBe(prizeCardSpec({ ...base, id: 'sc-9', useBy: '2026-12-17' }).car)
    const prizes = new Set(Array.from({ length: 60 }, (_, i) => prizeCardSpec({ ...base, id: `sc-${i}` }).car.id))
    expect(prizes.size).toBeGreaterThan(1)
    const gifts = new Set(Array.from({ length: 60 }, (_, i) => giftCardSpec({ design: 'shine', amount: 500 + i * 100 }).car.id))
    expect(gifts.size).toBeGreaterThan(1)
  })

  test('every photo is in public/, at both widths, and small', () => {
    const publicDir = join(import.meta.dir, '..', 'public')
    let total = 0
    for (const car of CARD_CARS) {
      for (const width of [800, 1600] as const) {
        const file = join(publicDir, cardCarSrc(car, width))
        expect({ file, exists: existsSync(file) }).toEqual({ file, exists: true })
        const bytes = statSync(file).size
        expect({ file, small: bytes < (width === 800 ? 120_000 : 300_000) }).toEqual({ file, small: true })
        total += bytes
      }
    }
    // About 150 KB a photo (both widths) on average, so the pool can grow without bloating the repo.
    expect(total).toBeLessThan(CARD_CARS.length * 150_000)
    expect(existsSync(join(publicDir, 'cards', 'cars', 'CREDITS.md'))).toBe(true)
  })

  test('the photo fades out above the title, and the illustration line', () => {
    expect(PHOTO.height).toBeCloseTo(81.25)
    expect(PHOTO.fade[0][0]).toBe(0)
    expect(PHOTO.fade.some(([, a]) => a === 1)).toBe(true)
    expect(PHOTO.fade[PHOTO.fade.length - 1]).toEqual([1, 0])
    expect(PHOTO.height).toBeLessThan(CARD.title.top)
    expect(CARS_ILLUSTRATION_LINE).toBe('Cars shown for illustration only. Not affiliated with any car maker.')
  })
})

describe('card geometry', () => {
  test('a long title line is set smaller', () => {
    expect(titleSize('Free wash')).toBe(CARD.title.size)
    expect(titleSize('Off your next booking')).toBeLessThan(CARD.title.size)
  })
})
