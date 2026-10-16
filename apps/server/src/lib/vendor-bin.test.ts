import { describe, expect, test } from 'bun:test'
import { planReset, type PlanInput, type ResetBooking, type ResetIntent } from './data-reset.js'
import {
  BIN_CANCELLATION,
  GARAGE_REMOVED_REASON,
  garageNameMatches,
  isUpcoming,
  purgeOutcome,
  tombstoneFields,
  upcomingSummary,
  vendorInBin,
} from './vendor-bin.js'

// Fixed clock: 16 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-16T06:30:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GARAGE = uuid(900)

function booking(n: number, mode: 'live' | 'test' | 'fake' | null): ResetBooking {
  return {
    id: uuid(n),
    originalBookingId: null,
    status: 'completed',
    paymentMethod: 'online',
    createdAt: daysAgo(10),
    scheduledAt: daysAgo(9),
    cancelledAt: null,
    markedTestAt: null,
    amount: '499.00',
    vendorId: GARAGE,
    garageName: 'Detlio (test garage)',
    userId: uuid(800),
    customerName: 'Team Phone',
    payment: {
      status: 'paid',
      gatewayTxnId: `pay_X${n}`,
      gatewayMode: mode,
      amount: '499.00',
      refundedAmount: null,
    },
  }
}

function abandonedCheckout(n: number): ResetIntent {
  return {
    id: uuid(n),
    bookingId: null,
    status: 'pending',
    createdAt: daysAgo(5),
    expiresAt: daysAgo(5),
    amount: '499.00',
    gatewayTxnId: `order_X${n}`,
    paymentRef: null,
    gatewayMode: 'test',
    refundedAmount: null,
    userId: uuid(800),
    customerName: 'Team Phone',
    garageName: 'Detlio (test garage)',
  }
}

/** The garage's bookings planned as Delete forever plans them: Razorpay never asked. */
function plan(bookings: ResetBooking[], intents: ResetIntent[] = []) {
  const input: PlanInput = {
    now: NOW,
    scope: { kind: 'garage', vendorId: GARAGE },
    only: null,
    bookings,
    charges: [],
    intents,
    bookingChildCounts: new Map(),
    reschedulesByChain: new Map(),
    intentChildCounts: new Map(),
    receipts: [],
    yearReceipts: [],
    unnumberedReceipts: [],
    counters: new Map(),
    voidsByYear: new Map(),
    lookups: new Map(),
    lookupsUnavailable: true,
  }
  return planReset(input)
}

describe('moving a garage to the Bin', () => {
  test('cancels what is still to happen, as Detlio, "Garage removed"', () => {
    expect(['pending', 'confirmed', 'in_progress'].every(isUpcoming)).toBe(true)
    expect(['completed', 'cancelled', 'rescheduled'].some(isUpcoming)).toBe(false)
    expect(BIN_CANCELLATION).toEqual({ onBehalfOf: 'detlio', reason: 'Garage removed' })
    expect(GARAGE_REMOVED_REASON).toBe('Garage removed')
  })

  test('counts the paid ones: each becomes a refund owed', () => {
    expect(
      upcomingSummary([
        { payment: { status: 'paid' } },
        { payment: { status: 'pending' } },
        { payment: null },
        { payment: { status: 'paid' } },
      ])
    ).toEqual({ count: 4, paid: 2 })
  })

  test('any other change to a garage in the Bin is refused with a 409', () => {
    const error = vendorInBin()
    expect(error.statusCode).toBe(409)
    expect(error.code).toBe('VENDOR_IN_BIN')
  })
})

describe('delete forever: the garage row goes, or stays as a tombstone', () => {
  test('nothing kept: deleted outright, package and abandoned checkout included', () => {
    const p = plan([booking(1, 'test'), booking(2, 'fake')], [abandonedCheckout(3)])
    expect(p.selectedChainIds).toHaveLength(2)
    expect(p.selectedCheckoutIds).toEqual([uuid(3)])
    expect(purgeOutcome(p)).toBe('hard_delete')
  })

  test('no bookings at all: deleted outright', () => {
    expect(purgeOutcome(plan([]))).toBe('hard_delete')
  })

  test('a live payment keeps its chain, and so a tombstone', () => {
    const p = plan([booking(1, 'test'), booking(2, 'live')])
    expect(p.chains.find((c) => c.rootId === uuid(2))?.kept).toBe('live')
    expect(p.selectedChainIds).toEqual([uuid(1)])
    expect(purgeOutcome(p)).toBe('tombstone')
  })

  test('money nobody has classed is never deleted from here: kept, so a tombstone', () => {
    const p = plan([booking(1, null)])
    expect(p.chains[0].kept).toBe('unknown')
    expect(purgeOutcome(p)).toBe('tombstone')
  })

  test('cash keeps it too', () => {
    const cash = { ...booking(1, null), paymentMethod: 'cash' }
    expect(purgeOutcome(plan([cash]))).toBe('tombstone')
  })

  test("more than one run's worth: partial, the garage stays in the Bin", () => {
    expect(
      purgeOutcome({ chains: [], checkouts: [], overCap: { chains: 3, checkouts: 0 } })
    ).toBe('partial')
    expect(
      purgeOutcome({ chains: [], checkouts: [], overCap: { chains: 0, checkouts: 1 } })
    ).toBe('partial')
  })
})

describe('the typed name', () => {
  test('must be the garage name, give or take spaces', () => {
    expect(garageNameMatches('Detlio (test garage)', 'Detlio (test garage)')).toBe(true)
    expect(garageNameMatches('  Detlio  (test garage) ', 'Detlio (test garage)')).toBe(true)
    expect(garageNameMatches('detlio (test garage)', 'Detlio (test garage)')).toBe(false)
    expect(garageNameMatches('Detlio', 'Detlio (test garage)')).toBe(false)
    expect(garageNameMatches('   ', '   ')).toBe(false)
  })
})

describe('the tombstone', () => {
  test('keeps what receipts print, clears how to reach the business', () => {
    const fields = tombstoneFields(NOW)
    expect(fields).toEqual({
      purgedAt: NOW,
      phone: '',
      email: null,
      whatsapp: null,
      mapsUrl: null,
      logoUrl: null,
      logoStorageKey: null,
      notes: null,
    })
    for (const kept of ['businessName', 'address', 'city', 'pincode']) {
      expect(fields).not.toHaveProperty(kept)
    }
  })
})
