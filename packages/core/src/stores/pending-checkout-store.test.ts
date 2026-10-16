import { beforeEach, describe, expect, test } from 'bun:test'
import type { PendingCheckout } from './pending-checkout-store'

// The store persists to localStorage, which bun does not have. An in-memory
// one, in place before the store module is first loaded, keeps the persist
// middleware quiet and lets these tests see what it writes.
const memory = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size
  },
} as Storage

const { isLastingRefusal, livePendingCheckout, pendingCodeFor, PENDING_CHECKOUT_TTL_MS, usePendingCheckoutStore } =
  await import('./pending-checkout-store')

const NOW = Date.parse('2026-10-12T10:00:00+05:30')

const offer = (over: Partial<PendingCheckout> = {}): PendingCheckout => ({
  userId: 'user-a',
  code: 'DETAIL20',
  vendorId: 'garage-1',
  vehicleId: 'car-1',
  // Midnight IST on the 18th: the last day it works is the 17th.
  endsAt: '2026-10-18T00:00:00+05:30',
  savedAt: NOW - 60_000,
  ...over,
})

describe('livePendingCheckout', () => {
  test("it is the customer's own, until the code ends", () => {
    expect(livePendingCheckout(offer(), { userId: 'user-a', now: NOW })).toEqual(offer())
  })

  test('another account on the same phone does not inherit it, nor a signed-out visitor', () => {
    expect(livePendingCheckout(offer(), { userId: 'user-b', now: NOW })).toBeNull()
    expect(livePendingCheckout(offer(), { userId: null, now: NOW })).toBeNull()
    expect(livePendingCheckout(null, { userId: 'user-a', now: NOW })).toBeNull()
  })

  test('it is forgotten the moment the code ends', () => {
    const endsAt = Date.parse('2026-10-18T00:00:00+05:30')
    const fresh = offer({ savedAt: endsAt - 1000 })
    expect(livePendingCheckout(fresh, { userId: 'user-a', now: endsAt - 1 })).not.toBeNull()
    expect(livePendingCheckout(fresh, { userId: 'user-a', now: endsAt })).toBeNull()
  })

  test('a car picked on Home stays picked for a day, no longer', () => {
    const car = offer({ code: null, vendorId: null, endsAt: null, savedAt: NOW })
    expect(livePendingCheckout(car, { userId: 'user-a', now: NOW + PENDING_CHECKOUT_TTL_MS })).not.toBeNull()
    expect(livePendingCheckout(car, { userId: 'user-a', now: NOW + PENDING_CHECKOUT_TTL_MS + 1 })).toBeNull()
  })
})

describe('pendingCodeFor', () => {
  test("a garage's code applies at that garage only", () => {
    expect(pendingCodeFor(offer(), 'garage-1')).toBe('DETAIL20')
    expect(pendingCodeFor(offer(), 'garage-2')).toBeNull()
  })

  test('a Detlio-wide code applies at any garage', () => {
    expect(pendingCodeFor(offer({ vendorId: null }), 'garage-2')).toBe('DETAIL20')
  })

  test('nothing to apply without a code', () => {
    expect(pendingCodeFor(offer({ code: null }), 'garage-1')).toBeNull()
    expect(pendingCodeFor(null, 'garage-1')).toBeNull()
  })
})

describe('usePendingCheckoutStore', () => {
  beforeEach(() => usePendingCheckoutStore.getState().clear())

  test('an offer tap replaces what was pending', () => {
    const store = usePendingCheckoutStore.getState()
    store.rememberOffer({ userId: 'user-a', code: 'ONE', vendorId: null, vehicleId: null, endsAt: '2026-10-18T00:00:00Z' })
    store.rememberOffer({ userId: 'user-a', code: 'TWO', vendorId: 'garage-1', vehicleId: 'car-1', endsAt: '2026-10-19T00:00:00Z' })
    expect(usePendingCheckoutStore.getState().pending).toMatchObject({
      userId: 'user-a', code: 'TWO', vendorId: 'garage-1', vehicleId: 'car-1',
    })
  })

  test('Book a wash changes the car and keeps the code', () => {
    const store = usePendingCheckoutStore.getState()
    store.rememberOffer({ userId: 'user-a', code: 'ONE', vendorId: null, vehicleId: 'car-1', endsAt: '2026-10-18T00:00:00Z' })
    store.rememberCar({ userId: 'user-a', vehicleId: 'car-2' })
    expect(usePendingCheckoutStore.getState().pending).toMatchObject({ code: 'ONE', vehicleId: 'car-2' })
  })

  test("but not another account's code", () => {
    const store = usePendingCheckoutStore.getState()
    store.rememberOffer({ userId: 'user-a', code: 'ONE', vendorId: null, vehicleId: null, endsAt: '2026-10-18T00:00:00Z' })
    store.rememberCar({ userId: 'user-b', vehicleId: 'car-9' })
    expect(usePendingCheckoutStore.getState().pending).toMatchObject({ userId: 'user-b', code: null, vehicleId: 'car-9' })
  })

  test('it is kept on the device, so a reload on the way to checkout keeps it', () => {
    usePendingCheckoutStore.getState().rememberCar({ userId: 'user-a', vehicleId: 'car-1' })
    const saved = JSON.parse(memory.get('detlio-pending-checkout') ?? '{}')
    expect(saved.state.pending).toMatchObject({ userId: 'user-a', vehicleId: 'car-1' })
  })

  test('Remove forgets the code and keeps the car; a booking or sign-out forgets both', () => {
    const store = usePendingCheckoutStore.getState()
    store.rememberOffer({ userId: 'user-a', code: 'ONE', vendorId: 'garage-1', vehicleId: 'car-1', endsAt: '2026-10-18T00:00:00Z' })
    store.forgetCode()
    expect(usePendingCheckoutStore.getState().pending).toMatchObject({ code: null, vendorId: null, endsAt: null, vehicleId: 'car-1' })
    store.clear()
    expect(usePendingCheckoutStore.getState().pending).toBeNull()
  })
})

describe('isLastingRefusal', () => {
  test('a code that is gone for good is not carried to the next garage', () => {
    for (const code of [
      'DISCOUNT_NOT_FOUND',
      'DISCOUNT_INACTIVE',
      'DISCOUNT_EXPIRED',
      'DISCOUNT_EXHAUSTED',
      'DISCOUNT_ALREADY_USED',
    ]) {
      expect(isLastingRefusal(code)).toBe(true)
    }
  })

  test('one a bigger cart or another car could change is kept', () => {
    expect(isLastingRefusal('DISCOUNT_MIN_ORDER')).toBe(false)
    expect(isLastingRefusal('DISCOUNT_NOT_FOR_VENDOR')).toBe(false)
    expect(isLastingRefusal('VEHICLE_NOT_FOUND')).toBe(false)
    expect(isLastingRefusal(undefined)).toBe(false)
    expect(isLastingRefusal(null)).toBe(false)
  })
})
