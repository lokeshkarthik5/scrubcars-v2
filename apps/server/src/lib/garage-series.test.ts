import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { bannedPhraseIn } from './copy-rules.js'
import { carProblems, realCarNameIn, rowOf } from './garage.js'
import { SERIES_ONE } from './garage-series.js'

const cars = SERIES_ONE.cars
const sql = readFileSync(new URL('../../drizzle/0057_detlio_garage.sql', import.meta.url), 'utf8')

// The card photo pool lives in packages/core (the apps' side), loaded by
// path at run time like the parity tests: every card must be one of its
// photos.
const coreUrl = new URL('../../../../packages/core/src/card-cars.ts', import.meta.url).href
type Pool = { CARD_CARS: ReadonlyArray<{ id: string; alt: string }> }

describe('Series 1', () => {
  test('40 cards, numbered 1–40, every name its own', () => {
    expect(cars.length).toBe(40)
    expect(cars.map((c) => c.number)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
    expect(new Set(cars.map((c) => c.name.toLowerCase())).size).toBe(40)
  })

  test('every card is a photo from the card photo pool, and no photo is used twice when the pool has enough', async () => {
    const pool = (await import(coreUrl)) as Pool
    const ids = new Set(pool.CARD_CARS.map((c) => c.id))
    for (const car of cars) expect({ number: car.number, inPool: ids.has(car.photoId) }).toEqual({ number: car.number, inPool: true })
    const used = new Set(cars.map((c) => c.photoId))
    expect(used.size).toBe(Math.min(40, ids.size))
  })

  test('20 Common, 12 Rare, 6 Epic, 2 Legendary: close to the 55/30/12/3 odds', () => {
    const count = (r: string) => cars.filter((c) => c.rarity === r).length
    expect([count('common'), count('rare'), count('epic'), count('legendary')]).toEqual([20, 12, 6, 2])
  })

  test('every row of five has a Rare or better', () => {
    for (let row = 1; row <= 8; row += 1) {
      const inRow = cars.filter((c) => rowOf(c.number) === row)
      expect(inRow.length).toBe(5)
      expect({ row, mixed: inRow.some((c) => c.rarity !== 'common') }).toEqual({ row, mixed: true })
    }
  })

  test('names never hint at a maker or model: no real make or model in any name, colour, setting or line', () => {
    for (const car of cars) {
      const words = [car.name, car.colour, car.setting, car.lore].join(' · ')
      expect({ number: car.number, real: realCarNameIn(words) }).toEqual({ number: car.number, real: null })
    }
  })

  test('every card passes the copy rules and the admin form’s checks (no made-up figures)', () => {
    for (const car of cars) {
      expect({ number: car.number, banned: bannedPhraseIn(`${car.name} ${car.lore}`) }).toEqual({ number: car.number, banned: null })
      expect({ number: car.number, problems: carProblems({ ...car, enabled: true }) }).toEqual({ number: car.number, problems: [] })
      expect(car.lore).toMatch(/^[A-Z].*[.]$/)
      expect(car.lore).not.toContain('!')
    }
  })

  test('migration 0057 seeds exactly this list', () => {
    const quote = (s: string) => `'${s.replace(/'/g, "''")}'`
    for (const car of cars) {
      const row = `${car.number}, ${quote(car.name)}, ${quote(car.rarity)}, ${quote(car.photoId)}, ${quote(car.colour)}, ${quote(car.setting)},\n   ${quote(car.lore)})`
      expect({ number: car.number, seeded: sql.includes(row) }).toEqual({ number: car.number, seeded: true })
    }
    expect(sql.match(/\('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', \d+, '[^']+', '(common|rare|epic|legendary)'/g)?.length).toBe(40)
  })

  test('the migration holds the once-only rules: one card per booking chain and per scratch card, each row and series once', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "garage_pulls_booking_key"\s+ON "garage_pulls" \("root_booking_id"\) WHERE "source" = 'booking'/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "garage_pulls_scratch_card_key"\s+ON "garage_pulls" \("scratch_card_id"\) WHERE "source" = 'scratch'/)
    expect(sql).toMatch(/"garage_row_completions_key"\s+ON "garage_row_completions" \("user_id", "series_id", "row"\)/)
    expect(sql).toMatch(/"garage_series_completions_key"\s+ON "garage_series_completions" \("user_id", "series_id"\)/)
    expect(sql).toMatch(/"garage_pulls_user_id_fk"\s+FOREIGN KEY \("user_id"\) REFERENCES "public"\."users"\("id"\)\s+ON DELETE cascade/)
    expect(sql).toMatch(/"garage_pulls_root_booking_id_fk"\s+FOREIGN KEY \("root_booking_id"\) REFERENCES "public"\."bookings"\("id"\)\s+ON DELETE cascade/)
    // A photo by its pool id, never a URL.
    expect(sql).toContain(`CONSTRAINT "garage_cars_photo_id_check" CHECK ("photo_id" ~ '^[a-z0-9-]{2,60}$')`)
  })
})
