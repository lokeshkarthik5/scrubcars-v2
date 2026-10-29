import { describe, expect, test } from 'bun:test'
import {
  cardInView,
  claimGarageSeen,
  GARAGE_SEEN_KEY,
  garageAlreadySeen,
} from './garage-seen'

function store() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

describe('saw a garage, once per visit', () => {
  test('the first card in view reports, every later one does not', () => {
    const tab = store()
    expect(garageAlreadySeen(tab)).toBe(false)
    expect(claimGarageSeen(tab)).toBe(true)
    expect(tab.map.get(GARAGE_SEEN_KEY)).toBe('1')
    expect(claimGarageSeen(tab)).toBe(false)
    expect(garageAlreadySeen(tab)).toBe(true)
  })

  test('a new tab is a new visit', () => {
    claimGarageSeen(store())
    expect(claimGarageSeen(store())).toBe(true)
  })

  test('storage that throws (private mode) still reports, and never throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(claimGarageSeen(broken)).toBe(true)
    expect(claimGarageSeen(null)).toBe(true)
  })

  test('a card counts once at least half of it is on screen', () => {
    expect(cardInView({ isIntersecting: true, intersectionRatio: 0.5 })).toBe(
      true
    )
    expect(cardInView({ isIntersecting: true, intersectionRatio: 1 })).toBe(
      true
    )
    expect(cardInView({ isIntersecting: true, intersectionRatio: 0.2 })).toBe(
      false
    )
    expect(cardInView({ isIntersecting: false, intersectionRatio: 0 })).toBe(
      false
    )
  })
})
