import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_PICKUP_FEE_SETTINGS as S,
  FREE_PICKUP_FEE,
  feeAtRoadKm,
  feeColumns,
  garageFeeOf,
  livePlanOf,
  normaliseFee,
  planGarageChange,
  tripFee,
  type GaragePickupFee,
  type VendorFeeColumns,
} from './pickup-fee.js'

const NOW = new Date('2026-11-15T04:50:00.000Z')

function row(over: Partial<VendorFeeColumns> = {}): VendorFeeColumns {
  return {
    pickupFeeMode: 'free',
    pickupFeeFixed: null,
    pickupFeeFreeKm: null,
    pickupFeePerKm: null,
    pickupFeeMin: null,
    pickupFeeMax: null,
    pickupFeeWaitingSince: null,
    pickupFeeLockedAt: null,
    pickupFeeChangedAt: null,
    ...over,
  }
}
const distance = (over: Partial<GaragePickupFee> = {}): GaragePickupFee => ({ ...FREE_PICKUP_FEE, mode: 'distance', ...over })
const fixed = (amount: number): GaragePickupFee => ({ ...FREE_PICKUP_FEE, mode: 'fixed', fixed: amount })

describe('the Free default', () => {
  test('an existing garage (the column default) charges nothing anywhere', () => {
    const plan = livePlanOf(row(), S)
    expect(plan.mode).toBe('free')
    expect(tripFee(plan, 25, 699).fee).toBe(0)
  })
  test('an unknown stored mode reads as Free', () => {
    expect(garageFeeOf(row({ pickupFeeMode: 'surge' }))).toEqual(FREE_PICKUP_FEE)
  })
})

describe('a garage’s change', () => {
  test('Detlio’s numbers go live at once, stored empty so they follow Detlio', () => {
    const plan = planGarageChange(row(), distance({ freeKm: 3, perKm: 15, minCharge: 99, maxCharge: 399 }), S, NOW)
    expect(plan).toEqual({ ok: true, fee: distance(), status: 'live' })
  })

  test('above the suggestion waits for Detlio; customers see Detlio’s fee meanwhile', () => {
    const plan = planGarageChange(row(), distance({ perKm: 20 }), S, NOW)
    expect(plan).toEqual({ ok: true, fee: distance({ perKm: 20 }), status: 'waiting' })
    const waiting = row({ ...feeColumns(distance({ perKm: 20 })), pickupFeeWaitingSince: NOW })
    expect(feeAtRoadKm(livePlanOf(waiting, S), 10)).toBe(110)
    const approved = row({ ...feeColumns(distance({ perKm: 20 })) })
    expect(feeAtRoadKm(livePlanOf(approved, S), 10)).toBe(140)
  })

  test('a fixed fee is above Detlio’s free short trips, so it waits', () => {
    expect(planGarageChange(row(), fixed(150), S, NOW)).toMatchObject({ ok: true, status: 'waiting' })
  })

  test('the caps are refused: fixed over ₹299, per km over ₹30, highest over ₹599', () => {
    expect(planGarageChange(row(), fixed(350), S, NOW)).toMatchObject({ ok: false, code: 'PICKUP_FEE_OUT_OF_LIMITS' })
    expect(planGarageChange(row(), distance({ perKm: 35 }), S, NOW)).toMatchObject({ ok: false, code: 'PICKUP_FEE_OUT_OF_LIMITS' })
    expect(planGarageChange(row(), distance({ maxCharge: 650 }), S, NOW)).toMatchObject({ ok: false, code: 'PICKUP_FEE_OUT_OF_LIMITS' })
  })

  test('locked to Detlio’s fee: refused, and customers see Detlio’s fee', () => {
    const locked = row({ ...feeColumns(fixed(250)), pickupFeeLockedAt: NOW })
    expect(planGarageChange(locked, distance(), S, NOW)).toMatchObject({ ok: false, code: 'PICKUP_FEE_LOCKED' })
    expect(feeAtRoadKm(livePlanOf(locked, S), 2)).toBe(0)
    expect(feeAtRoadKm(livePlanOf(locked, S), 10)).toBe(110)
  })

  test('once every 7 days', () => {
    const changed = row({ ...feeColumns(distance()), pickupFeeChangedAt: NOW })
    const sixDays = new Date(NOW.getTime() + 6 * 86_400_000)
    const sevenDays = new Date(NOW.getTime() + 7 * 86_400_000)
    const refused = planGarageChange(changed, distance({ perKm: 10 }), S, sixDays)
    expect(refused).toMatchObject({ ok: false, code: 'PICKUP_FEE_TOO_SOON' })
    expect(refused.ok === false && refused.message).toBe(
      'You can change your fee once every 7 days. Your next change: from 22 Nov.'
    )
    expect(planGarageChange(changed, distance({ perKm: 10 }), S, sevenDays)).toMatchObject({ ok: true, status: 'live' })
    // Admin's setting decides the days.
    const three = { ...S, limits: { ...S.limits, changeEveryDays: 3 } }
    expect(planGarageChange(changed, distance({ perKm: 10 }), three, new Date(NOW.getTime() + 3 * 86_400_000))).toMatchObject({ ok: true })
  })

  test('nothing changed is refused, so it never uses up the week', () => {
    expect(planGarageChange(row(), FREE_PICKUP_FEE, S, NOW)).toMatchObject({ ok: false, code: 'PICKUP_FEE_UNCHANGED' })
  })

  test('normalising keeps only what differs from Detlio, and clears the other mode', () => {
    expect(normaliseFee({ ...distance({ perKm: 20 }), fixed: 100 }, S)).toEqual(distance({ perKm: 20 }))
    expect(normaliseFee({ ...fixed(150), perKm: 20 }, S)).toEqual(fixed(150))
  })
})
