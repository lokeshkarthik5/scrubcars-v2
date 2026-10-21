import { describe, expect, test } from 'bun:test'
import { DEFAULT_GARAGE_SETTINGS } from '@repo/core/garage'
import { garageFormProblems, oddsTotal, pullsCsv } from './garage'

describe('Garage settings form', () => {
  test('the defaults pass; odds must add up to 100; pity must be ordered', () => {
    expect(garageFormProblems(DEFAULT_GARAGE_SETTINGS)).toEqual([])
    expect(oddsTotal({ common: 50, rare: 30, epic: 12, legendary: 3 })).toBe(95)
    const bad = garageFormProblems({ ...DEFAULT_GARAGE_SETTINGS, rarityWeights: { common: 50, rare: 30, epic: 12, legendary: 3 }, pityRare: 40, pityLegendary: 30 })
    expect(bad.join(' | ')).toContain('add up to 95')
    expect(bad.join(' | ')).toContain('Legendary pity must be more')
  })

  test('the pulls CSV keeps the masked phone and IST time', () => {
    const csv = pullsCsv([{ at: '2026-10-19T04:30:00Z', phone: '••••••3701', series: 1, number: 7, name: 'Monsoon GT', rarity: 'rare', source: 'booking', duplicate: false, pity: null }])
    expect(csv).toContain('2026-10-19 10:00')
    expect(csv).toContain('••••••3701')
    expect(csv).toContain('Monsoon GT')
  })
})
