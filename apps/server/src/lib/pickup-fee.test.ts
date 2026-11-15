import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_PICKUP_FEE_SETTINGS as S,
  FREE_PICKUP_FEE,
  NO_LIMIT_OVERRIDES,
  adminFeeColumns,
  adminFeeProblems,
  askMaxFee,
  feeAtRoadKm,
  feeColumns,
  garageChangeColumns,
  garageFeeOf,
  limitColumns,
  limitOverridesOf,
  livePlanOf,
  normaliseFee,
  planGarageChange,
  settingsForGarage,
  suggestionPlan,
  tripFee,
  type GaragePickupFee,
  type PickupFeeLimitOverrides,
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
    pickupFeeSource: 'garage',
    ...limitColumns(NO_LIMIT_OVERRIDES),
    ...over,
  }
}
/** A garage with admin's own limits. */
const limited = (o: Partial<PickupFeeLimitOverrides>, over: Partial<VendorFeeColumns> = {}) =>
  row({ ...limitColumns({ ...NO_LIMIT_OVERRIDES, ...o }), ...over })
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

  test('set by Detlio (locked): refused, and customers see the fee Detlio left on the garage', () => {
    const locked = row({ ...feeColumns(fixed(250)), pickupFeeLockedAt: NOW })
    const refused = planGarageChange(locked, distance(), S, NOW)
    expect(refused).toMatchObject({ ok: false, code: 'PICKUP_FEE_LOCKED', message: 'Set by Detlio. Ask Detlio to change it.' })
    expect(feeAtRoadKm(livePlanOf(locked, S), 2)).toBe(250)
    // Locked on Detlio's numbers: Detlio's suggestion, as before.
    const onDetlio = row({ ...feeColumns(distance()), pickupFeeLockedAt: NOW, pickupFeeSource: 'detlio' })
    expect(feeAtRoadKm(livePlanOf(onDetlio, S), 2)).toBe(0)
    expect(feeAtRoadKm(livePlanOf(onDetlio, S), 10)).toBe(110)
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

describe('admin’s own fee for a garage', () => {
  test('any numbers inside the hard caps, past the garage limits: no approval to plan, only the caps', () => {
    const narrow = settingsForGarage(limitColumns({ ...NO_LIMIT_OVERRIDES, fixedMax: 150 }), S)
    expect(adminFeeProblems(fixed(299), narrow)).toEqual([])
    expect(adminFeeProblems(distance({ perKm: 30, maxCharge: 599 }), narrow)).toEqual([])
    expect(adminFeeProblems(fixed(300), narrow)).toMatchObject([{ code: 'FIXED_TOO_HIGH', max: 299 }])
    expect(adminFeeProblems(distance({ perKm: 31 }), narrow)).toMatchObject([{ field: 'perKm' }])
    expect(adminFeeProblems(FREE_PICKUP_FEE, narrow)).toEqual([])
  })

  test('goes live at once as Detlio’s, and never touches the garage’s 7-day clock', () => {
    const columns = adminFeeColumns(fixed(280))
    expect(columns).toMatchObject({ pickupFeeMode: 'fixed', pickupFeeFixed: '280.00', pickupFeeSource: 'detlio', pickupFeeWaitingSince: null })
    expect('pickupFeeChangedAt' in columns).toBe(false)
    // The garage's own change restarts its clock and is the garage's.
    expect(garageChangeColumns(fixed(150), 'waiting', NOW)).toMatchObject({
      pickupFeeSource: 'garage',
      pickupFeeWaitingSince: NOW,
      pickupFeeChangedAt: NOW,
    })
  })

  test('after admin’s change the garage is still on its own 7 days, from its own last change', () => {
    const changedTwoDaysAgo = new Date(NOW.getTime() - 2 * 86_400_000)
    // Admin set ₹280 today; the garage's last own change was two days ago.
    const after = row({ ...adminFeeColumns(fixed(280)), pickupFeeChangedAt: changedTwoDaysAgo })
    expect(planGarageChange(after, fixed(150), S, NOW)).toMatchObject({ ok: false, code: 'PICKUP_FEE_TOO_SOON' })
    expect(planGarageChange(after, fixed(150), S, new Date(changedTwoDaysAgo.getTime() + 7 * 86_400_000))).toMatchObject({ ok: true })
    // A garage that never changed its own fee may change it at once after admin's.
    expect(planGarageChange(row({ ...adminFeeColumns(fixed(280)) }), fixed(150), S, NOW)).toMatchObject({ ok: true })
  })

  test('a fee Detlio set past the garage limits is charged as set (held only to the hard caps)', () => {
    const garage = limited({ fixedMax: 150 }, adminFeeColumns(fixed(280)))
    expect(tripFee(livePlanOf(garage, S), 8, 999).fee).toBe(280)
  })
})

describe('one garage’s own limits', () => {
  test('none at merge: every garage reads Detlio’s defaults and needs approval above the suggestion', () => {
    expect(limitOverridesOf(row())).toEqual(NO_LIMIT_OVERRIDES)
    expect(settingsForGarage(row(), S)).toEqual(S)
  })

  test('the garage is checked against its own limits', () => {
    const garage = limited({ perKm: { min: 5, max: 12 }, fixedMax: 150 })
    expect(planGarageChange(garage, fixed(200), S, NOW)).toMatchObject({ ok: false, code: 'PICKUP_FEE_OUT_OF_LIMITS' })
    expect(planGarageChange(garage, fixed(150), S, NOW)).toMatchObject({ ok: true })
    // Detlio's ₹15 a km is outside this garage's ₹5–₹12.
    expect(planGarageChange(garage, distance(), S, NOW)).toMatchObject({ ok: false, code: 'PICKUP_FEE_OUT_OF_LIMITS' })
    expect(planGarageChange(garage, distance({ perKm: 12 }), S, NOW)).toMatchObject({ ok: true, status: 'live' })
  })

  test('its own days between changes, and approval it may skip', () => {
    const changed = limited({ changeEveryDays: 3, needsApproval: false }, { ...feeColumns(distance()), pickupFeeChangedAt: NOW })
    const threeDays = new Date(NOW.getTime() + 3 * 86_400_000)
    expect(planGarageChange(changed, distance({ perKm: 20 }), S, new Date(NOW.getTime() + 2 * 86_400_000))).toMatchObject({
      ok: false,
      code: 'PICKUP_FEE_TOO_SOON',
    })
    // ₹20 a km is above Detlio's ₹15, but this garage's fee goes live at once.
    expect(planGarageChange(changed, distance({ perKm: 20 }), S, threeDays)).toMatchObject({ ok: true, status: 'live' })
    const checked = limited({ needsApproval: true })
    expect(planGarageChange(checked, distance({ perKm: 20 }), S, NOW)).toMatchObject({ ok: true, status: 'waiting' })
  })

  test('its own Ask for pickup raise and highest charge, with the suggestion held to its limits', () => {
    const garage = settingsForGarage(limitColumns({ ...NO_LIMIT_OVERRIDES, askRaisePct: 10, maxCharge: 200 }), S)
    expect(askMaxFee(120, garage)).toBe(130)
    expect(askMaxFee(120, S)).toBe(150)
    // 30 km by road: Detlio's ₹399, held to this garage's ₹200.
    expect(feeAtRoadKm(suggestionPlan(garage), 30)).toBe(200)
    expect(feeAtRoadKm(suggestionPlan(S), 30)).toBe(399)
  })
})

describe('narrowed limits are clamped when the fee is worked out', () => {
  // ₹25 a km, approved when the limits allowed it: 10 km by road is (10 − 3) × 25 = ₹175 → ₹180.
  const approved = row({ ...feeColumns(distance({ perKm: 25, maxCharge: 550 })) })

  test('Detlio narrows the defaults: the garage’s stored numbers are held to them', () => {
    expect(feeAtRoadKm(livePlanOf(approved, S), 10)).toBe(180)
    const narrower = { ...S, limits: { ...S.limits, perKm: { min: 5, max: 20 }, maxCharge: 450 } }
    const plan = livePlanOf(approved, narrower)
    expect(plan.perKm).toBe(20)
    expect(plan.maxCharge).toBe(450)
    expect(feeAtRoadKm(plan, 10)).toBe(140)
    expect(feeAtRoadKm(plan, 40)).toBe(450)
    // The booking's own fee follows: never more than the limits allow.
    expect(tripFee(plan, 40 / 1.3, 9999).fee).toBe(450)
  })

  test('admin narrows this garage’s limits: held to them too, fixed fees included', () => {
    expect(feeAtRoadKm(livePlanOf({ ...approved, ...limitColumns({ ...NO_LIMIT_OVERRIDES, perKm: { min: 5, max: 18 } }) }, S), 10)).toBe(130)
    const fixedFee = limited({ fixedMax: 150 }, feeColumns(fixed(250)))
    expect(tripFee(livePlanOf(fixedFee, S), 3, 999).fee).toBe(150)
  })

  test('Detlio’s suggestion shown while a fee waits is held to the garage’s limits', () => {
    const waiting = limited({ maxCharge: 200 }, { ...feeColumns(distance({ perKm: 20 })), pickupFeeWaitingSince: NOW })
    expect(feeAtRoadKm(livePlanOf(waiting, S), 30)).toBe(200)
  })

  test('only ever towards a lower fee: a number under a raised minimum stays', () => {
    const cheap = limited({ perKm: { min: 10, max: 20 }, freeKm: { min: 4, max: 5 } }, feeColumns(distance({ perKm: 6 })))
    const plan = livePlanOf(cheap, S)
    expect(plan.perKm).toBe(6)
    // Free up to Detlio's 3 km is under this garage's 4 km floor: raised to 4, which only lowers the fee.
    expect(plan.freeKm).toBe(4)
  })

  test('a garage with no stored numbers follows Detlio’s numbers, as before', () => {
    const plain = row({ ...feeColumns(distance()) })
    const moved = { ...S, suggested: { ...S.suggested, perKm: 18 } }
    expect(livePlanOf(plain, moved).perKm).toBe(18)
  })
})
