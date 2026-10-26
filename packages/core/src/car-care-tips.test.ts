import { describe, expect, test } from 'bun:test'
import { CAR_CARE_TIPS, TIP_SEASON_BY_MONTH, istMonth, pickCarCareTip, tipHash } from './car-care-tips'
import { bannedPhraseIn } from './copy-rules'

/** Makers and product names a tip must never mention (a card never implies a brand). */
const BRANDS = [
  'maruti', 'suzuki', 'hyundai', 'tata', 'mahindra', 'honda', 'toyota', 'kia', 'bmw', 'audi', 'mercedes', 'porsche',
  'volkswagen', 'skoda', 'renault', 'nissan', 'ford', 'jeep', 'mg', 'volvo', 'lexus', 'jaguar', 'ferrari', 'tesla',
  'turtle', 'meguiar', 'chemical guys', '3m', 'wd-40', 'armor all', 'sonax', 'mothers', 'formula 1', 'castrol', 'shell',
]
/** Absolutes a tip should not make: it is advice, not a promise. */
const ABSOLUTES = ['always', 'never', '100%', 'completely safe', 'permanent', 'forever', 'best', 'only way', 'must']

describe('car care tips', () => {
  test('forty of them, each with its own id and words', () => {
    expect(CAR_CARE_TIPS.length).toBe(40)
    expect(new Set(CAR_CARE_TIPS.map((t) => t.id)).size).toBe(40)
    expect(new Set(CAR_CARE_TIPS.map((t) => t.text)).size).toBe(40)
  })

  test('short, plain sentences that pass the copy rules', () => {
    for (const tip of CAR_CARE_TIPS) {
      expect({ id: tip.id, length: tip.text.length <= 110 }).toEqual({ id: tip.id, length: true })
      expect({ id: tip.id, banned: bannedPhraseIn(tip.text) }).toEqual({ id: tip.id, banned: null })
      expect(tip.text).toMatch(/^[A-Z]/)
      expect(tip.text).toMatch(/[.?!]$/)
      expect(tip.text).not.toContain('!')
    }
  })

  test('no brand names and no absolutes', () => {
    for (const tip of CAR_CARE_TIPS) {
      const words = ` ${tip.text.toLowerCase().replace(/[’]/g, "'")} `
      for (const brand of BRANDS) expect({ id: tip.id, brand: new RegExp(`[^a-z0-9]${brand}[^a-z0-9]`).test(words) }).toEqual({ id: tip.id, brand: false })
      for (const word of ABSOLUTES) expect({ id: tip.id, word: new RegExp(`[^a-z]${word}[^a-z]`).test(words) }).toEqual({ id: tip.id, word: false })
    }
  })

  test('every season has tips to pick from', () => {
    for (const season of ['any', 'rain', 'summer', 'diwali'] as const) {
      expect(CAR_CARE_TIPS.filter((t) => t.season === season).length).toBeGreaterThanOrEqual(4)
    }
    for (let m = 1; m <= 12; m += 1) expect(TIP_SEASON_BY_MONTH[m]).toBeDefined()
  })

  test('the same card always gets the same tip', () => {
    const a = pickCarCareTip({ seed: 'card-1', month: 10 })
    for (let i = 0; i < 5; i += 1) expect(pickCarCareTip({ seed: 'card-1', month: 10 })).toBe(a)
    expect(tipHash('card-1')).toBe(tipHash('card-1'))
    expect(tipHash('card-1')).not.toBe(tipHash('card-2'))
  })

  test('different cards spread across the tips', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => pickCarCareTip({ seed: `gift-${i}`, month: 1 }).id))
    expect(seen.size).toBeGreaterThan(15)
  })

  test('Diwali cards take Diwali tips; the monsoon prefers rain tips', () => {
    for (let i = 0; i < 50; i += 1) expect(pickCarCareTip({ seed: `d-${i}`, occasion: 'diwali', month: 3 }).season).toBe('diwali')
    const rain = Array.from({ length: 300 }, (_, i) => pickCarCareTip({ seed: `r-${i}`, month: 7 }))
    const share = rain.filter((t) => t.season === 'rain').length / rain.length
    expect(share).toBeGreaterThan(0.5)
    expect(rain.every((t) => t.season === 'rain' || t.season === 'any')).toBe(true)
    expect(Array.from({ length: 100 }, (_, i) => pickCarCareTip({ seed: `j-${i}`, month: 1 })).every((t) => t.season === 'any')).toBe(true)
    expect(Array.from({ length: 100 }, (_, i) => pickCarCareTip({ seed: `s-${i}` })).every((t) => t.season === 'any')).toBe(true)
  })

  test('the month is India’s', () => {
    // 31 Oct 19:00 UTC is 1 Nov 00:30 in India.
    expect(istMonth('2026-10-31T19:00:00Z')).toBe(11)
    expect(istMonth(new Date('2026-06-15T00:00:00Z'))).toBe(6)
  })
})
