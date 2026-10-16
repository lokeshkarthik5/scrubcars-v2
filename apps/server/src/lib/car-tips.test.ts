import { describe, expect, test } from 'bun:test'
import { CAR_TIPS, tipOfTheDay, tipSeasonOf } from './car-tips.js'
import { bannedPhraseIn } from './copy-rules.js'

/** Noon IST on a date. */
const noon = (date: string) => new Date(`${date}T06:30:00Z`)

describe('car-care tips', () => {
  test('the thirteen vetted tips, each with a category and a season, and no banned words', () => {
    expect(CAR_TIPS).toHaveLength(13)
    expect(new Set(CAR_TIPS.map((tip) => tip.id)).size).toBe(13)
    for (const tip of CAR_TIPS) {
      expect(tip.category.length).toBeGreaterThan(0)
      expect(tip.text).not.toMatch(/^\[/)
      expect(bannedPhraseIn(tip.text)).toBeNull()
    }
  })

  test('seasons, by the IST date', () => {
    expect(tipSeasonOf(noon('2026-10-01')).season).toBe('monsoon')
    expect(tipSeasonOf(noon('2026-12-31')).season).toBe('monsoon')
    expect(tipSeasonOf(noon('2026-09-15')).season).toBe('pre_monsoon')
    expect(tipSeasonOf(noon('2026-04-15')).season).toBe('summer')
    expect(tipSeasonOf(noon('2026-01-15')).season).toBe('all_year')
    // 23:59 IST on 30 Sep, then 00:00 IST on 1 Oct.
    expect(tipSeasonOf(new Date('2026-09-30T18:29:59Z')).season).toBe('pre_monsoon')
    expect(tipSeasonOf(new Date('2026-09-30T18:30:00Z')).season).toBe('monsoon')
  })

  test('the monsoon tips lead from 1 October, and come round twice as often', () => {
    const monsoonIds = CAR_TIPS.filter((tip) => tip.season === 'monsoon').map((tip) => tip.id)
    expect([0, 1, 2].map((d) => tipOfTheDay(noon(`2026-10-0${d + 1}`)).id)).toEqual(monsoonIds)

    const seen = new Map<string, number>()
    // One full rotation: 3 monsoon tips twice, the other 10 once.
    for (let day = 0; day < 16; day++) {
      const date = new Date(noon('2026-10-01').getTime() + day * 24 * 60 * 60 * 1000)
      const tip = tipOfTheDay(date)
      seen.set(tip.id, (seen.get(tip.id) ?? 0) + 1)
    }
    for (const id of monsoonIds) expect(seen.get(id)).toBe(2)
    expect(seen.size).toBe(13)
  })

  test('the same tip all day, in IST', () => {
    // 00:01 and 23:59 IST on 12 Oct.
    expect(tipOfTheDay(new Date('2026-10-11T18:31:00Z')).id).toBe(tipOfTheDay(new Date('2026-10-12T18:29:00Z')).id)
  })
})
