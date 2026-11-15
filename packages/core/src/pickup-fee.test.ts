import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_PICKUP_FEE_SETTINGS as S,
  FREE_PICKUP_FEE,
  askFeeChoices,
  askMaxFee,
  convenienceFeeFor,
  describeFeeChange,
  detlioPlan,
  feeAtRoadKm,
  feeCell,
  feePreviewRows,
  feeSummary,
  garageMayChange,
  garagePageFeeLine,
  garagePlan,
  isAboveSuggestion,
  isAllowedAskFee,
  livePlan,
  nextGarageChangeAt,
  parsePickupFeeSettings,
  pickupChipLabel,
  pickupFeeProblems,
  pickupFeeSettingsProblems,
  pickupLineLabel,
  roadKmFor,
  sentLine,
  tripFee,
  type GaragePickupFee,
} from './pickup-fee'

const distance = (over: Partial<GaragePickupFee> = {}): GaragePickupFee => ({ ...FREE_PICKUP_FEE, mode: 'distance', ...over })
const fixed = (amount: number): GaragePickupFee => ({ ...FREE_PICKUP_FEE, mode: 'fixed', fixed: amount })

describe("Detlio's formula", () => {
  test('the approved preview: 2 km Free · 5 km ₹99 · 10 km ₹110 · 15 km ₹180 · 25 km ₹330 · 30 km ₹399', () => {
    const plan = detlioPlan(S)
    expect([2, 5, 10, 15, 25, 30].map((km) => feeAtRoadKm(plan, km))).toEqual([0, 99, 110, 180, 330, 399])
  })

  test('nothing up to the free km, the lowest charge just past it', () => {
    const plan = detlioPlan(S)
    expect(feeAtRoadKm(plan, 0)).toBe(0)
    expect(feeAtRoadKm(plan, 3)).toBe(0)
    expect(feeAtRoadKm(plan, 3.1)).toBe(99)
  })

  test('road km is the straight line × 1.3, to one decimal; the screens’ examples', () => {
    expect(roadKmFor(4.8, 1.3)).toBe(6.2)
    // Velan Car Care: 4.8 km straight → 6.2 km by road → ₹48 → the lowest charge, ₹99.
    expect(tripFee(detlioPlan(S), 4.8)).toEqual({ roadKm: 6.2, fee: 99 })
    // Kumar Auto Spa: 8.5 km straight → 11 km by road → ₹120.
    expect(tripFee(detlioPlan(S), 8.5).fee).toBe(120)
  })

  test('rounds halves up to the nearest ₹10', () => {
    // (10 − 3) × 15 = 105 → 110.
    expect(feeAtRoadKm(detlioPlan(S), 10)).toBe(110)
    expect(feeAtRoadKm({ ...detlioPlan(S), roundTo: 1 }, 10)).toBe(105)
  })

  test('never more than the booking’s service price', () => {
    expect(tripFee(detlioPlan(S), 20, 149).fee).toBe(149)
    expect(tripFee(detlioPlan(S), 20, 149.5).fee).toBe(149)
    expect(tripFee(detlioPlan(S), 20, 0).fee).toBe(0)
  })
})

describe('the Free default', () => {
  test('a garage that never chose is Free: no fee at any distance', () => {
    const plan = livePlan({ fee: FREE_PICKUP_FEE, waiting: false, locked: false }, S)
    expect(plan.mode).toBe('free')
    for (const km of [0, 2, 10, 30, 80]) expect(tripFee(plan, km).fee).toBe(0)
  })

  test('the chip and the garage line say Free, as today', () => {
    expect(pickupChipLabel(0)).toBe('Free pickup')
    expect(pickupChipLabel(99)).toBe('Pickup ₹99')
    expect(garagePageFeeLine({ fee: 0, roadKm: 6.2, placeLabel: 'Home' })).toEqual({ lead: 'Free pickup & drop.', amount: null, rest: '' })
    expect(garagePageFeeLine({ fee: 99, roadKm: 6.2, placeLabel: 'Home' })).toEqual({
      lead: 'Pickup & drop',
      amount: '₹99',
      rest: ' to Home (6.2 km by road).',
    })
  })

  test('the convenience fee is off at ₹0 and never lands on a ₹0 booking', () => {
    expect(S.convenienceFee).toBe(0)
    expect(convenienceFeeFor(S, 699)).toBe(0)
    expect(convenienceFeeFor({ ...S, convenienceFee: 19 }, 699)).toBe(19)
    expect(convenienceFeeFor({ ...S, convenienceFee: 19 }, 0)).toBe(0)
  })
})

describe('the caps', () => {
  test('fixed: ₹1 to ₹299', () => {
    expect(pickupFeeProblems(fixed(150), S)).toEqual([])
    expect(pickupFeeProblems(fixed(299), S)).toEqual([])
    expect(pickupFeeProblems(fixed(350), S)).toEqual([{ field: 'fixed', code: 'FIXED_TOO_HIGH', max: 299 }])
    expect(pickupFeeProblems(fixed(0), S)[0]?.code).toBe('FIXED_REQUIRED')
    expect(pickupFeeProblems(fixed(99.5), S)[0]?.code).toBe('FIXED_REQUIRED')
  })

  test('by distance: per km ₹5–₹30, free km 0–5, lowest ₹49–₹149, highest ≤ ₹599', () => {
    expect(pickupFeeProblems(distance(), S)).toEqual([])
    expect(pickupFeeProblems(distance({ perKm: 31 }), S).map((p) => p.field)).toEqual(['perKm'])
    expect(pickupFeeProblems(distance({ perKm: 4 }), S).map((p) => p.field)).toEqual(['perKm'])
    expect(pickupFeeProblems(distance({ freeKm: 6 }), S).map((p) => p.field)).toEqual(['freeKm'])
    expect(pickupFeeProblems(distance({ minCharge: 48 }), S).map((p) => p.field)).toEqual(['minCharge'])
    expect(pickupFeeProblems(distance({ minCharge: 150 }), S).map((p) => p.field)).toEqual(['minCharge'])
    expect(pickupFeeProblems(distance({ maxCharge: 600 }), S)).toEqual([{ field: 'maxCharge', code: 'MAX_TOO_HIGH', max: 599 }])
    expect(pickupFeeProblems(distance({ maxCharge: 90 }), S)).toEqual([{ field: 'maxCharge', code: 'MAX_BELOW_MIN', min: 99 }])
  })

  test('admin’s tighter limits apply', () => {
    const tight = { ...S, limits: { ...S.limits, fixedMax: 199 } }
    expect(pickupFeeProblems(fixed(250), tight)[0]?.code).toBe('FIXED_TOO_HIGH')
  })

  test('settings outside the hard caps fall back, and are refused when saved', () => {
    const parsed = parsePickupFeeSettings({ limits: { maxCharge: 900, fixedMax: 500 }, convenienceFee: 500 })
    expect(parsed.limits.maxCharge).toBe(599)
    expect(parsed.limits.fixedMax).toBe(299)
    expect(parsed.convenienceFee).toBe(0)
    expect(parsePickupFeeSettings(null)).toEqual(S)
    expect(pickupFeeSettingsProblems(S)).toEqual([])
    expect(pickupFeeSettingsProblems({ ...S, limits: { ...S.limits, maxCharge: 700 } }).length).toBe(1)
    expect(pickupFeeSettingsProblems({ ...S, limits: { ...S.limits, perKm: { min: 2, max: 30 } } }).length).toBe(1)
    expect(pickupFeeSettingsProblems({ ...S, suggested: { ...S.suggested, perKm: 40 } }).length).toBe(1)
    expect(pickupFeeSettingsProblems({ ...S, convenienceFee: 19 })).toEqual([])
    expect(pickupFeeSettingsProblems({ ...S, convenienceFee: 100 }).length).toBe(1)
  })
})

describe('approval: above the suggestion waits', () => {
  test('Detlio’s own numbers and anything cheaper go live at once', () => {
    expect(isAboveSuggestion(FREE_PICKUP_FEE, S)).toBe(false)
    expect(isAboveSuggestion(distance(), S)).toBe(false)
    expect(isAboveSuggestion(distance({ perKm: 10, maxCharge: 299 }), S)).toBe(false)
    expect(isAboveSuggestion(distance({ freeKm: 5 }), S)).toBe(false)
  })

  test('more per km, a higher top, fewer free km or a fixed fee waits', () => {
    expect(isAboveSuggestion(distance({ perKm: 20 }), S)).toBe(true)
    expect(isAboveSuggestion(distance({ maxCharge: 499 }), S)).toBe(true)
    expect(isAboveSuggestion(distance({ freeKm: 2 }), S)).toBe(true)
    expect(isAboveSuggestion(distance({ minCharge: 149 }), S)).toBe(true)
    // Detlio's fee is Free for short trips, so any fixed fee is above it there.
    expect(isAboveSuggestion(fixed(150), S)).toBe(true)
  })

  test('customers see Detlio’s fee while it waits, and while locked', () => {
    const mine = distance({ perKm: 20 })
    expect(feeAtRoadKm(livePlan({ fee: mine, waiting: true, locked: false }, S), 10)).toBe(110)
    expect(feeAtRoadKm(livePlan({ fee: mine, waiting: false, locked: false }, S), 10)).toBe(140)
    expect(feeAtRoadKm(livePlan({ fee: fixed(250), waiting: false, locked: true }, S), 10)).toBe(110)
    expect(feeAtRoadKm(livePlan({ fee: FREE_PICKUP_FEE, waiting: false, locked: true }, S), 10)).toBe(110)
  })

  test('the Detlio vs Yours table (₹20 per km)', () => {
    const rows = feePreviewRows(garagePlan(distance({ perKm: 20 }), S), detlioPlan(S))
    expect(rows.map((r) => [r.km, r.detlio, r.garage])).toEqual([
      [2, 0, 0],
      [5, 99, 99],
      [10, 110, 140],
      [15, 180, 240],
      [25, 330, 399],
      [30, 399, 399],
    ])
    expect(feeCell(399, detlioPlan(S), true)).toBe('₹399 (top)')
    expect(feeCell(0)).toBe('Free')
  })
})

describe('the 7-day rule', () => {
  const last = new Date('2026-11-15T04:50:00.000Z') // 15 Nov, 10:20 am IST
  test('a garage that never changed may change now', () => {
    expect(garageMayChange(null, 7, last)).toBe(true)
    expect(nextGarageChangeAt(null, 7)).toBeNull()
  })
  test('then not for 7 days', () => {
    expect(garageMayChange(last, 7, new Date('2026-11-21T04:50:00.000Z'))).toBe(false)
    expect(garageMayChange(last, 7, new Date('2026-11-22T04:49:59.000Z'))).toBe(false)
    expect(garageMayChange(last, 7, new Date('2026-11-22T04:50:00.000Z'))).toBe(true)
    expect(sentLine(last.toISOString(), nextGarageChangeAt(last, 7)!.toISOString())).toBe(
      'Sent to Detlio 15 Nov, 10:20 am. Your next change: from 22 Nov.'
    )
  })
})

describe('Ask for pickup: at most 25% more', () => {
  test('₹120 suggested: up to ₹150, chips ₹120 ₹130 ₹140 ₹150', () => {
    expect(askMaxFee(120, S)).toBe(150)
    expect(askFeeChoices(120, 150, 10)).toEqual([120, 130, 140, 150])
  })
  test('rounded down to the step, within the caps and the service price', () => {
    expect(askMaxFee(99, S)).toBe(120)
    expect(askMaxFee(399, S)).toBe(490)
    expect(askMaxFee(399, { ...S, limits: { ...S.limits, maxCharge: 450 } })).toBe(450)
    expect(askMaxFee(120, S, 130)).toBe(130)
    expect(askMaxFee(0, S)).toBe(0)
    expect(askFeeChoices(0, 0, 10)).toEqual([0])
  })
  test('the server takes a whole ₹0 up to the most, nothing above', () => {
    expect(isAllowedAskFee(150, 150)).toBe(true)
    expect(isAllowedAskFee(151, 150)).toBe(false)
    expect(isAllowedAskFee(-1, 150)).toBe(false)
    expect(isAllowedAskFee(120.5, 150)).toBe(false)
  })
})

describe('words', () => {
  test('lines and summaries', () => {
    expect(pickupLineLabel(6.2)).toBe('Pickup & drop · 6.2 km')
    expect(pickupLineLabel(11)).toBe('Pickup & drop · 11 km')
    expect(pickupLineLabel(null)).toBe('Pickup & drop')
    expect(feeSummary(distance({ perKm: 20 }), S)).toBe('By distance · free 3 km · ₹20/km · ₹99–₹399')
    expect(feeSummary(fixed(250), S)).toBe('Fixed fee · ₹250 for any pickup')
    expect(describeFeeChange(distance(), distance({ perKm: 20 }), S)).toBe('By distance: ₹15 → ₹20 per km')
    expect(describeFeeChange(FREE_PICKUP_FEE, distance(), S)).toBe('Free → By distance (Detlio’s fee)')
  })
})
