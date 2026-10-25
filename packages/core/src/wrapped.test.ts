import { describe, expect, test } from 'bun:test'
import { wrappedCards, type WrappedStats } from './wrapped'

const STATS: WrappedStats = {
  year: 2026,
  firstName: 'Meena',
  washes: 14,
  saved: '1240.00',
  favouriteGarage: { name: 'Shine Hub', washes: 6 },
  busiestMonth: { month: 10, label: 'October', washes: 4 },
  longestStreak: 5,
  level: { key: 'gold', label: 'Gold' },
  badges: { count: 4, names: ['First Shine', '5 Washes Club', 'Explorer', 'Night Owl'] },
  shineDays: 88,
}

describe('Wrapped cards', () => {
  test('seven cards for a full year, in order', () => {
    const cards = wrappedCards(STATS, { showName: true })
    expect(cards.map((c) => c.key)).toEqual(['washes', 'saved', 'garage', 'month', 'level', 'shine', 'closing'])
    expect(cards[0]).toMatchObject({ eyebrow: "Meena's 2026 with Detlio", big: '14 washes' })
    expect(cards[1].big).toBe('₹1,240')
    expect(cards[3].caption).toBe('4 washes that month, and a 5-month streak.')
    expect(cards[4].extra).toEqual(['First Shine', '5 Washes Club', 'Explorer'])
    expect(cards[6].caption).toContain('detlio.com')
  })

  test('the name can be hidden everywhere', () => {
    const cards = wrappedCards(STATS, { showName: false })
    expect(JSON.stringify(cards)).not.toContain('Meena')
    expect(cards[0].eyebrow).toBe('My 2026 with Detlio')
  })

  test('nothing saved and one wash: six cards, singular words', () => {
    const cards = wrappedCards({ ...STATS, washes: 1, saved: '0.00', badges: { count: 0, names: [] }, longestStreak: 1, busiestMonth: { month: 3, label: 'March', washes: 1 } }, { showName: true })
    expect(cards.map((c) => c.key)).toEqual(['washes', 'garage', 'month', 'level', 'shine', 'closing'])
    expect(cards[0].big).toBe('1 wash')
    expect(cards[2].caption).toBe('1 wash that month.')
  })
})
