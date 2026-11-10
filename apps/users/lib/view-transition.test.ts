import { describe, expect, test } from 'bun:test'
import {
  OPENED_FROM_LIST_KEY,
  PICKS_KEY,
  claimOpenedFromList,
  claimPicks,
  forgetPicks,
  keptEntryState,
  markPicksForBack,
  openedFromList,
  picksForBack,
  picksRemembered,
  rememberOpenedFromList,
  rememberPicks,
} from './view-transition'

const NOW = Date.UTC(2026, 10, 9, 10, 0, 0)

function tab() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

/** One history entry, with Next's own field on it as the real one has. */
function entry(state: unknown = { __NA: true }) {
  const box = {
    state,
    replaceState(data: unknown) {
      box.state = data
    },
  }
  return box
}

describe('Back into the card it was opened from', () => {
  test('the visit opened from the list folds back, and the hand-off is used once', () => {
    const t = tab()
    const visit = entry()
    rememberOpenedFromList('g1', NOW, t)
    claimOpenedFromList('g1', NOW + 400, t, visit)
    expect(openedFromList('g1', visit)).toBe(true)
    expect(t.map.has(OPENED_FROM_LIST_KEY)).toBe(false)
    // Next's own field is kept.
    expect((visit.state as { __NA?: boolean }).__NA).toBe(true)
  })

  test('a later visit to the same garage (Home, Search, a link) is a plain Back', () => {
    const t = tab()
    rememberOpenedFromList('g1', NOW, t)
    claimOpenedFromList('g1', NOW, t, entry())
    const later = entry()
    claimOpenedFromList('g1', NOW + 60_000, t, later)
    expect(openedFromList('g1', later)).toBe(false)
  })

  test('a hand-off for another garage, or one that never arrived, marks nothing and is cleared', () => {
    const t = tab()
    const visit = entry()
    rememberOpenedFromList('g2', NOW, t)
    claimOpenedFromList('g1', NOW, t, visit)
    expect(openedFromList('g1', visit)).toBe(false)
    expect(t.map.has(OPENED_FROM_LIST_KEY)).toBe(false)

    rememberOpenedFromList('g1', NOW, t)
    claimOpenedFromList('g1', NOW + 31_000, t, visit)
    expect(openedFromList('g1', visit)).toBe(false)
  })

  test('the mark survives the page changing its own URL with keptEntryState', () => {
    const t = tab()
    const visit = entry()
    rememberOpenedFromList('g1', NOW, t)
    claimOpenedFromList('g1', NOW, t, visit)
    // What Next does with a replaceState that has no __NA: adds its own fields.
    visit.replaceState({ ...keptEntryState(visit), __NA: true })
    expect(openedFromList('g1', visit)).toBe(true)
    expect(keptEntryState(entry())).toBeNull()
  })
})

describe('Back from the booking page into the booking bar', () => {
  test('Book now, then the page Back: the same services come back once', () => {
    const t = tab()
    const booking = entry()
    rememberPicks('g1', ['s1', 's2'], NOW, t)
    claimPicks('g1', NOW + 300, t, booking)
    expect(picksRemembered('g1', booking)).toBe(true)
    expect(t.map.has(PICKS_KEY)).toBe(false)

    markPicksForBack('g1', NOW + 90_000, t, booking)
    expect(picksForBack('g1', NOW + 90_200, t)).toEqual(['s1', 's2'])
    // Read, not taken (strict mode reads twice).
    expect(picksForBack('g1', NOW + 90_200, t)).toEqual(['s1', 's2'])
    forgetPicks(t)
    expect(picksForBack('g1', NOW + 90_300, t)).toEqual([])
  })

  test('the booking page reached another way (Book again, a Next-free time) is a plain Back', () => {
    const t = tab()
    rememberPicks('g1', ['s1'], NOW, t)
    claimPicks('g1', NOW, t, entry())
    // Left with the phone's own back; later /book/g1 again, a new entry.
    const other = entry()
    claimPicks('g1', NOW + 120_000, t, other)
    expect(picksRemembered('g1', other)).toBe(false)
    markPicksForBack('g1', NOW + 120_000, t, other)
    expect(t.map.has(PICKS_KEY)).toBe(false)
    expect(picksForBack('g1', NOW + 120_000, t)).toEqual([])
  })

  test('picks that never reached their booking page are never restored later', () => {
    const t = tab()
    rememberPicks('g1', ['s1'], NOW, t)
    // Not a Back: the garage page shows nothing and clears it.
    expect(picksForBack('g1', NOW + 1000, t)).toEqual([])
    forgetPicks(t)
    expect(t.map.has(PICKS_KEY)).toBe(false)

    rememberPicks('g1', ['s1'], NOW, t)
    claimPicks('g1', NOW + 31_000, t, entry())
    expect(t.map.has(PICKS_KEY)).toBe(false)
  })

  test('a Back mark that was not read at once goes stale', () => {
    const t = tab()
    const booking = entry()
    rememberPicks('g1', ['s1'], NOW, t)
    claimPicks('g1', NOW, t, booking)
    markPicksForBack('g1', NOW + 1000, t, booking)
    expect(picksForBack('g1', NOW + 3 * 60 * 60_000, t)).toEqual([])
    expect(picksForBack('g2', NOW + 1000, t)).toEqual([])
  })

  test('storage or history that throws (private mode) never throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const brokenEntry = {
      get state(): unknown {
        throw new Error('denied')
      },
      replaceState: () => {
        throw new Error('denied')
      },
    }
    rememberPicks('g1', ['s1'], NOW, broken)
    claimPicks('g1', NOW, broken, brokenEntry)
    rememberOpenedFromList('g1', NOW, broken)
    claimOpenedFromList('g1', NOW, broken, brokenEntry)
    markPicksForBack('g1', NOW, broken, brokenEntry)
    forgetPicks(broken)
    expect(openedFromList('g1', brokenEntry)).toBe(false)
    expect(picksRemembered('g1', null)).toBe(false)
    expect(picksForBack('g1', NOW, broken)).toEqual([])
    expect(keptEntryState(brokenEntry)).toBeNull()
  })
})
