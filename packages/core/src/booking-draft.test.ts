import { describe, expect, test } from 'bun:test'
import {
  BOOKING_DRAFT_KEY,
  BOOKING_DRAFT_TTL_MS,
  clearBookingDraft,
  draftResumePath,
  draftSlotStillAhead,
  isDraftLive,
  parseBookingDraft,
  readBookingDraft,
  writeBookingDraft,
  type BookingDraft,
} from './booking-draft'

const NOW = Date.parse('2026-10-29T10:00:00+05:30')
const HOUR = 60 * 60 * 1000

const draft = (over: Partial<BookingDraft> = {}): BookingDraft => ({
  vendorId: 'v-1',
  vendorName: 'A.J Auto Garage',
  serviceIds: ['s-1', 's-2'],
  mode: 'doorstep',
  slot: '2026-10-29T15:30:00.000Z',
  car: { vehicleType: 'sedan', make: 'Maruti', model: 'Ciaz' },
  address: { label: 'Home', address: '12 Lake View Rd', city: 'Chennai', lat: 12.98, lng: 80.22, geoSource: 'map_pin' },
  savedAt: NOW - HOUR,
  ...over,
})

class MemoryStorage {
  private items = new Map<string, string>()
  get length() {
    return this.items.size
  }
  clear() {
    this.items.clear()
  }
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
  setItem(key: string, value: string) {
    this.items.set(key, value)
  }
}

describe('the guest draft expires after 24 hours', () => {
  test('live for a day from its last change', () => {
    expect(BOOKING_DRAFT_TTL_MS).toBe(24 * HOUR)
    expect(isDraftLive({ savedAt: NOW }, NOW)).toBe(true)
    expect(isDraftLive({ savedAt: NOW - 23.9 * HOUR }, NOW)).toBe(true)
    expect(isDraftLive({ savedAt: NOW - 24 * HOUR }, NOW)).toBe(false)
    expect(isDraftLive({ savedAt: NOW - 30 * HOUR }, NOW)).toBe(false)
  })

  test('a draft from the future (another clock) is not kept for ever', () => {
    expect(isDraftLive({ savedAt: NOW + 4 * 60 * 1000 }, NOW)).toBe(true)
    expect(isDraftLive({ savedAt: NOW + HOUR }, NOW)).toBe(false)
  })

  test('reading a dead draft removes it', () => {
    const store = new MemoryStorage() as unknown as Storage
    writeBookingDraft(draft({ savedAt: NOW - 25 * HOUR }), store)
    expect(readBookingDraft(NOW, store)).toBeNull()
    expect(store.getItem(BOOKING_DRAFT_KEY)).toBeNull()
  })
})

describe('reading a draft back', () => {
  test('round trip', () => {
    const store = new MemoryStorage() as unknown as Storage
    writeBookingDraft(draft(), store)
    expect(readBookingDraft(NOW, store)).toEqual(draft())
    clearBookingDraft(store)
    expect(readBookingDraft(NOW, store)).toBeNull()
  })

  test('anything malformed is no draft', () => {
    expect(parseBookingDraft(null, NOW)).toBeNull()
    expect(parseBookingDraft('not json', NOW)).toBeNull()
    expect(parseBookingDraft(JSON.stringify({ ...draft(), serviceIds: [] }), NOW)).toBeNull()
    expect(parseBookingDraft(JSON.stringify({ ...draft(), mode: 'teleport' }), NOW)).toBeNull()
    expect(parseBookingDraft(JSON.stringify({ ...draft(), vendorId: '' }), NOW)).toBeNull()
  })

  test('a bad car or address is dropped, the rest kept', () => {
    const parsed = parseBookingDraft(
      JSON.stringify({ ...draft(), car: { vehicleType: 'bus', make: 'X', model: 'Y' }, address: { label: 'Home' } }),
      NOW
    )
    expect(parsed?.car).toBeNull()
    expect(parsed?.address).toBeNull()
    expect(parsed?.serviceIds).toEqual(['s-1', 's-2'])
  })

  test('blocked storage is no draft and never throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(readBookingDraft(NOW, broken)).toBeNull()
    expect(() => writeBookingDraft(draft(), broken)).not.toThrow()
    expect(() => clearBookingDraft(broken)).not.toThrow()
  })
})

describe('continuing a draft', () => {
  test('back to checkout with the same services and mode', () => {
    expect(draftResumePath(draft())).toBe('/book/v-1?service=s-1%2Cs-2&mode=doorstep')
    expect(draftResumePath(draft({ mode: 'dropin' }))).toBe('/book/v-1?service=s-1%2Cs-2')
  })

  test('a picked time is kept only while it is ahead', () => {
    expect(draftSlotStillAhead('2026-10-29T15:30:00.000Z', NOW)).toBe('2026-10-29T15:30:00.000Z')
    expect(draftSlotStillAhead('2026-10-29T03:00:00.000Z', NOW)).toBeNull()
    expect(draftSlotStillAhead(null, NOW)).toBeNull()
    expect(draftSlotStillAhead('garbage', NOW)).toBeNull()
  })
})
