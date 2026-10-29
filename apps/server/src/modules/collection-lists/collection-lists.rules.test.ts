import { describe, expect, test } from 'bun:test'
import {
  collectionItemDone,
  collectionListOpen,
  collectionMapsUrl,
  collectionProgress,
  dedupeGarages,
  itemCleared,
  reopenRefusal,
} from './collection-lists.rules.js'

// The apps' twin, loaded by path (see vendor-missing.parity.test.ts).
const coreUrl = new URL(
  '../../../../../packages/core/src/onboarding-marks.ts',
  import.meta.url
).href

const item = (status: 'to_collect' | 'collected', cleared = false) => ({
  status,
  cleared,
})

describe('cleared', () => {
  test('a missing key the garage no longer misses; never a custom item', () => {
    expect(itemCleared('photos', ['logo'])).toBe(true)
    expect(itemCleared('photos', ['photos', 'logo'])).toBe(false)
    expect(itemCleared('custom', [])).toBe(false)
    expect(itemCleared('photos', undefined)).toBe(false)
  })
})

describe('progress and open', () => {
  test('done = collected or cleared', () => {
    const items = [
      item('to_collect'),
      item('collected'),
      item('to_collect', true),
      item('collected', true),
    ]
    expect(collectionProgress(items)).toEqual({ done: 3, total: 4 })
    expect(collectionListOpen(null, items)).toBe(true)
  })

  test('open until closed or every item is done', () => {
    expect(
      collectionListOpen(null, [item('collected'), item('to_collect', true)])
    ).toBe(false)
    expect(collectionListOpen(new Date(), [item('to_collect')])).toBe(false)
  })

  test('the same as the apps’ twin', async () => {
    const core = (await import(coreUrl)) as {
      collectionItemDone: typeof collectionItemDone
      collectionProgress: typeof collectionProgress
      COLLECTION_LIMITS: Record<string, number>
      COLLECTION_ITEM_STATUSES: readonly string[]
    }
    const samples = [
      item('to_collect'),
      item('collected'),
      item('to_collect', true),
      item('collected', true),
    ]
    for (const sample of samples) {
      expect(core.collectionItemDone(sample)).toBe(collectionItemDone(sample))
    }
    expect(core.collectionProgress(samples)).toEqual(
      collectionProgress(samples)
    )
    expect(core.COLLECTION_LIMITS).toMatchObject({
      labelMax: 80,
      noteMax: 500,
      garagesPerList: 50,
    })
    expect([...core.COLLECTION_ITEM_STATUSES]).toEqual([
      'to_collect',
      'collected',
    ])
  })
})

describe('the maps link', () => {
  test('the saved link, else the pin, else none', () => {
    expect(
      collectionMapsUrl({
        mapsUrl: ' https://maps.app.goo.gl/abc ',
        lat: 1,
        lng: 2,
      })
    ).toBe('https://maps.app.goo.gl/abc')
    expect(
      collectionMapsUrl({
        mapsUrl: null,
        lat: 13.082699775695801,
        lng: 80.2707,
      })
    ).toBe(
      'https://www.google.com/maps/search/?api=1&query=13.082700,80.270700'
    )
    expect(collectionMapsUrl({ mapsUrl: '', lat: null, lng: 80 })).toBeNull()
  })
})

describe('dedupeGarages', () => {
  test('a garage named twice is merged, each kind once, in the order sent; empty ones dropped', () => {
    expect(
      dedupeGarages([
        { vendorId: 'a', kinds: ['logo', 'photos', 'logo'] },
        { vendorId: 'b', kinds: [] },
        { vendorId: 'a', kinds: ['payout', 'photos'] },
      ])
    ).toEqual([{ vendorId: 'a', kinds: ['logo', 'photos', 'payout'] }])
  })
})

describe('reopen (0065)', () => {
  const at = new Date('2026-10-29T10:00:00Z')
  test('a closed list with something left; never an open one or a finished one', () => {
    const left = [
      { status: 'collected' as const, cleared: false },
      { status: 'to_collect' as const, cleared: false },
    ]
    expect(reopenRefusal(at, left)).toBeNull()
    expect(reopenRefusal(null, left)).toBe('not_closed')
    expect(
      reopenRefusal(at, [
        { status: 'collected', cleared: false },
        { status: 'to_collect', cleared: true },
      ])
    ).toBe('nothing_left')
  })
})
