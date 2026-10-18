import { describe, expect, test } from 'bun:test'
import { CARD_CARS, PHOTO_ASPECT, SUITS_WEIGHT, cardCarById, cardCarSrc, cardCarSrcSet, pickCardCar, type CardCar, type CardCarLook } from './card-cars'

/** Makers that must never appear with a card photo (the tips test keeps a similar list). */
const BRANDS = [
  'maruti', 'suzuki', 'hyundai', 'tata', 'mahindra', 'honda', 'toyota', 'kia', 'bmw', 'audi', 'mercedes', 'porsche',
  'volkswagen', 'skoda', 'renault', 'nissan', 'ford', 'jeep', 'mg', 'volvo', 'lexus', 'jaguar', 'ferrari', 'lamborghini',
  'mclaren', 'bugatti', 'pagani', 'koenigsegg', 'aston', 'bentley', 'rolls', 'maserati', 'tesla', 'chevrolet', 'dodge',
  'lotus', 'michelin', 'pirelli',
]

const LOOKS: CardCarLook[] = ['shine', 'midnight', 'pearl', 'birthday', 'diwali', 'thank_you', 'prize_silver', 'prize_gold', 'prize_star', 'prize_jackpot']

describe('card car photos', () => {
  test('each has its own id and file, and generic alt text', () => {
    expect(new Set(CARD_CARS.map((c) => c.id)).size).toBe(CARD_CARS.length)
    expect(new Set(CARD_CARS.map((c) => c.file)).size).toBe(CARD_CARS.length)
    for (const car of CARD_CARS) {
      expect(car.file).toMatch(/^[a-z0-9-]+$/)
      expect(car.alt).toMatch(/^[A-Z][a-z]/)
      expect(car.alt.length).toBeLessThanOrEqual(60)
      expect(car.position).toMatch(/^\d{1,3}% \d{1,3}%$/)
    }
  })

  test('no maker anywhere: id, file, alt', () => {
    for (const car of CARD_CARS) {
      const words = ` ${[car.id, car.file, car.alt].join(' ').toLowerCase().replace(/[-_]/g, ' ')} `
      for (const brand of BRANDS) expect({ car: car.id, brand: new RegExp(`[^a-z0-9]${brand}[^a-z0-9]`).test(words) }).toEqual({ car: car.id, brand: false })
    }
  })

  test('both tones have photos, and every look has a favourite', () => {
    expect(CARD_CARS.filter((c) => c.tone === 'light').length).toBeGreaterThanOrEqual(2)
    expect(CARD_CARS.filter((c) => c.tone === 'dark').length).toBeGreaterThanOrEqual(2)
    for (const look of LOOKS.filter((l) => l !== 'prize_star' && l !== 'prize_silver')) {
      expect({ look, suited: CARD_CARS.some((c) => c.suits.includes(look)) }).toEqual({ look, suited: true })
    }
  })

  test('addresses at both widths', () => {
    const car = CARD_CARS[0]
    expect(cardCarSrc(car, 800)).toBe(`/cards/cars/${car.file}-800.webp`)
    expect(cardCarSrcSet(car)).toBe(`/cards/cars/${car.file}-800.webp 800w, /cards/cars/${car.file}-1600.webp 1600w`)
    expect(cardCarById(car.id)).toBe(car)
    expect(cardCarById('nope')).toBeUndefined()
    expect(PHOTO_ASPECT).toBeCloseTo(1600 / 1300)
  })
})

describe('picking a car for a card', () => {
  test('the same card always gets the same car', () => {
    const a = pickCardCar({ seed: 'scratch|sc-1', tone: 'dark', look: 'prize_jackpot' })
    for (let i = 0; i < 5; i += 1) expect(pickCardCar({ seed: 'scratch|sc-1', tone: 'dark', look: 'prize_jackpot' })).toBe(a)
  })

  test("a card only gets a photo of its tone", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(pickCardCar({ seed: `l-${i}`, tone: 'light', look: 'shine' }).tone).toBe('light')
      expect(pickCardCar({ seed: `d-${i}`, tone: 'dark', look: 'midnight' }).tone).toBe('dark')
    }
  })

  test('every photo of the tone turns up, the favourite most often', () => {
    for (const look of LOOKS) {
      const tone = CARD_CARS.find((c) => c.suits.includes(look))?.tone ?? 'light'
      const counts = new Map<string, number>()
      for (let i = 0; i < 1200; i += 1) {
        const car = pickCardCar({ seed: `${look}-${i}`, tone, look })
        counts.set(car.id, (counts.get(car.id) ?? 0) + 1)
      }
      const ofTone = CARD_CARS.filter((c) => c.tone === tone)
      expect({ look, seen: counts.size }).toEqual({ look, seen: ofTone.length })
      // Each favourite turns up more often than the average photo that isn't one.
      const favourites = ofTone.filter((c) => c.suits.includes(look))
      const others = ofTone.filter((c) => !c.suits.includes(look)).map((c) => counts.get(c.id) ?? 0)
      const average = others.reduce((sum, n) => sum + n, 0) / Math.max(1, others.length)
      for (const favourite of favourites) {
        expect({ look, car: favourite.id, favouriteLeads: (counts.get(favourite.id) ?? 0) > average * 2 }).toEqual({ look, car: favourite.id, favouriteLeads: true })
      }
    }
  })

  test('the weights: a favourite is SUITS_WEIGHT times as likely', () => {
    const cars: CardCar[] = [
      { id: 'a', file: 'a', tone: 'light', position: '50% 50%', suits: ['shine'], alt: 'A car' },
      { id: 'b', file: 'b', tone: 'light', position: '50% 50%', suits: [], alt: 'B car' },
    ]
    let a = 0
    const n = 4000
    for (let i = 0; i < n; i += 1) if (pickCardCar({ seed: `w-${i}`, tone: 'light', look: 'shine' }, cars).id === 'a') a += 1
    expect(a / n).toBeGreaterThan(SUITS_WEIGHT / (SUITS_WEIGHT + 1) - 0.05)
    expect(a / n).toBeLessThan(SUITS_WEIGHT / (SUITS_WEIGHT + 1) + 0.05)
  })

  test('a tone with no photos yet falls back to the whole pool', () => {
    const cars: CardCar[] = [{ id: 'only', file: 'only', tone: 'light', position: '50% 50%', suits: [], alt: 'A car' }]
    expect(pickCardCar({ seed: 'x', tone: 'dark', look: 'midnight' }, cars).id).toBe('only')
  })
})
