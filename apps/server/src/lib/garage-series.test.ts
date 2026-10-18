import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { bannedPhraseIn } from './copy-rules.js'
import { carProblems, realCarNameIn, rowOf } from './garage.js'
import { SERIES_ONE } from './garage-series.js'

const cars = SERIES_ONE.cars
const sql = readFileSync(new URL('../../drizzle/0057_detlio_garage.sql', import.meta.url), 'utf8')

describe('Series 1', () => {
  test('40 cars, numbered 1–40, every name its own', () => {
    expect(cars.length).toBe(40)
    expect(cars.map((c) => c.number)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
    expect(new Set(cars.map((c) => c.name.toLowerCase())).size).toBe(40)
    expect(new Set(cars.map((c) => c.paint.toLowerCase())).size).toBe(40)
  })

  test('20 Common, 12 Rare, 6 Epic, 2 Legendary: close to the 55/30/12/3 odds', () => {
    const count = (r: string) => cars.filter((c) => c.rarity === r).length
    expect([count('common'), count('rare'), count('epic'), count('legendary')]).toEqual([20, 12, 6, 2])
  })

  test('every row of five mixes rarities: none is all Common, and Legendaries end rows 4 and 8', () => {
    for (let row = 1; row <= 8; row += 1) {
      const inRow = cars.filter((c) => rowOf(c.number) === row)
      expect(inRow.length).toBe(5)
      expect(inRow.some((c) => c.rarity !== 'common')).toBe(true)
    }
    expect(cars.filter((c) => c.rarity === 'legendary').map((c) => c.number)).toEqual([20, 40])
  })

  test('invented names only: no real make or model in any name, colour, stat or line', () => {
    for (const car of cars) {
      const words = [car.name, car.colour, ...car.stats, car.lore].join(' · ')
      expect({ number: car.number, real: realCarNameIn(words) }).toEqual({ number: car.number, real: null })
    }
  })

  test('every car passes the copy rules and the admin form’s own checks', () => {
    for (const car of cars) {
      expect({ number: car.number, banned: bannedPhraseIn(`${car.name} ${car.lore}`) }).toEqual({ number: car.number, banned: null })
      expect({ number: car.number, problems: carProblems({ ...car, enabled: true }) }).toEqual({ number: car.number, problems: [] })
      expect(car.lore).toMatch(/^[A-Z].*[.]$/)
      expect(car.lore).not.toContain('!')
      expect(car.stats[2]).toBe(`Colour: ${car.colour}`)
    }
  })

  test('migration 0057 seeds exactly this list', () => {
    const quote = (s: string) => `'${s.replace(/'/g, "''")}'`
    for (const car of cars) {
      const row = `${car.number}, ${quote(car.name)}, ${quote(car.rarity)}, ${quote(car.tone)}, ${quote(car.paint)}, ${quote(car.colour)},\n   ARRAY[${car.stats.map(quote).join(', ')}], ${quote(car.lore)})`
      expect({ number: car.number, seeded: sql.includes(row) }).toEqual({ number: car.number, seeded: true })
    }
    expect(sql.match(/ARRAY\[/g)?.length).toBe(40)
  })

  test('the migration holds the once-only rules: one card per booking chain and per scratch card, each row and series once', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "garage_pulls_booking_key"\s+ON "garage_pulls" \("root_booking_id"\) WHERE "source" = 'booking'/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "garage_pulls_scratch_card_key"\s+ON "garage_pulls" \("scratch_card_id"\) WHERE "source" = 'scratch'/)
    expect(sql).toMatch(/"garage_row_completions_key"\s+ON "garage_row_completions" \("user_id", "series_id", "row"\)/)
    expect(sql).toMatch(/"garage_series_completions_key"\s+ON "garage_series_completions" \("user_id", "series_id"\)/)
    // Everything about a customer goes with them; a booking's pull with its booking.
    expect(sql).toMatch(/"garage_pulls_user_id_fk"\s+FOREIGN KEY \("user_id"\) REFERENCES "public"\."users"\("id"\)\s+ON DELETE cascade/)
    expect(sql).toMatch(/"garage_pulls_root_booking_id_fk"\s+FOREIGN KEY \("root_booking_id"\) REFERENCES "public"\."bookings"\("id"\)\s+ON DELETE cascade/)
  })
})
