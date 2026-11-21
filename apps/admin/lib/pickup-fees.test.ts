import { describe, expect, test } from 'bun:test'
import { DEFAULT_PICKUP_FEE_SETTINGS, FREE_PICKUP_FEE, NO_LIMIT_OVERRIDES, garagePlan } from '@repo/core/pickup-fee-maths'
import {
  EMPTY_LIMITS_DRAFT,
  changeLine,
  checkColumns,
  defaultLimitHint,
  detlioSummary,
  feeSummaryLine,
  limitsChangeLine,
  limitsDraftOf,
  overridesOfDraft,
  parsePickupFeeFilter,
  planSummaryLine,
  withFormula,
} from './pickup-fees'

const S = DEFAULT_PICKUP_FEE_SETTINGS.suggested
const distance = (over = {}) => ({ ...FREE_PICKUP_FEE, mode: 'distance' as const, ...over })
const fixed = (amount: number) => ({ ...FREE_PICKUP_FEE, mode: 'fixed' as const, fixed: amount })

describe('Issues → Pickup fees', () => {
  test('the summaries, as the mockup writes them', () => {
    expect(detlioSummary(S)).toBe('Free 3 km · ₹15/km · ₹99–₹399')
    expect(feeSummaryLine(distance({ perKm: 20 }), S)).toBe('By distance · free 3 km · ₹20/km · ₹99–₹399')
    expect(feeSummaryLine(fixed(250), S)).toBe('Fixed fee · ₹250 for any pickup')
  })

  test('the sample distances: Detlio next to the garage', () => {
    expect(checkColumns(distance({ perKm: 20 }), S)).toEqual({
      kms: [5, 10, 15, 25, 30],
      detlio: [99, 110, 180, 330, 399],
      garage: [99, 140, 240, 399, 399],
    })
    expect(checkColumns(fixed(250), S)).toEqual({
      kms: [2, 5, 10, 15, 25],
      detlio: [0, 99, 110, 180, 330],
      garage: [250, 250, 250, 250, 250],
    })
  })

  test('the filter falls back to Waiting', () => {
    expect(parsePickupFeeFilter('kept')).toBe('kept')
    expect(parsePickupFeeFilter('nonsense')).toBe('waiting')
    expect(parsePickupFeeFilter(null)).toBe('waiting')
  })

  test('the change log’s lines', () => {
    expect(changeLine({ kind: 'fee', before: distance(), after: distance({ perKm: 20 }) }, S)).toBe('By distance: ₹15 → ₹20 per km')
    expect(changeLine({ kind: 'fee', before: FREE_PICKUP_FEE, after: distance() }, S)).toBe('Free → By distance (Detlio’s fee)')
    expect(changeLine({ kind: 'fee', before: fixed(250), after: distance() }, S)).toBe('Fixed fee ₹250 → By distance (Detlio’s fee)')
    expect(changeLine({ kind: 'locked', before: distance(), after: distance() }, S)).toBe('Set by Detlio: the garage can’t change its fee')
    expect(changeLine({ kind: 'locked', before: distance({ perKm: 20 }), after: distance() }, S)).toBe(
      'Set by Detlio: By distance · free 3 km · ₹15/km · ₹99–₹399'
    )
    expect(changeLine({ kind: 'unlocked', before: distance(), after: distance() }, S)).toBe('Set by the garage: it can change its fee again')
    const limits = { before: NO_LIMIT_OVERRIDES, after: { ...NO_LIMIT_OVERRIDES, fixedMax: 150 } }
    expect(changeLine({ kind: 'limits', before: FREE_PICKUP_FEE, after: FREE_PICKUP_FEE, limits }, S)).toBe('Limits: fixed up to ₹150')
  })
})

describe('the garage editor’s pickup card (0079)', () => {
  test('the fee that applies now', () => {
    const s = withFormula(S)
    expect(planSummaryLine(garagePlan(FREE_PICKUP_FEE, s))).toBe('Free')
    expect(planSummaryLine(garagePlan(fixed(250), s))).toBe('Fixed fee · ₹250 for any pickup')
    expect(planSummaryLine(garagePlan(distance({ perKm: 20 }), s))).toBe('By distance · free 3 km · ₹20/km · ₹99–₹399')
  })

  test('the limit boxes: empty is Detlio’s default, a range is both ends or neither', () => {
    expect(overridesOfDraft(EMPTY_LIMITS_DRAFT)).toEqual({ ok: true, overrides: NO_LIMIT_OVERRIDES })
    const typed = { ...EMPTY_LIMITS_DRAFT, perKmMin: '5', perKmMax: '12', fixedMax: '₹150', askRaisePct: '10%', needsApproval: 'no' as const }
    const read = overridesOfDraft(typed)
    expect(read).toEqual({
      ok: true,
      overrides: { ...NO_LIMIT_OVERRIDES, perKm: { min: 5, max: 12 }, fixedMax: 150, askRaisePct: 10, needsApproval: false },
    })
    // Round trip from what the server stores.
    if (read.ok) expect(overridesOfDraft(limitsDraftOf(read.overrides))).toEqual(read)
    expect(overridesOfDraft({ ...EMPTY_LIMITS_DRAFT, perKmMin: '5' })).toEqual({
      ok: false,
      problem: 'Per km: type both ends, or leave both empty for Detlio’s default.',
    })
    expect(overridesOfDraft({ ...EMPTY_LIMITS_DRAFT, fixedMax: 'abc' })).toMatchObject({ ok: false })
  })

  test('Detlio’s default under each box, and the log’s limits line', () => {
    const L = DEFAULT_PICKUP_FEE_SETTINGS.limits
    expect(defaultLimitHint('perKm', L)).toBe('Default ₹5–₹30')
    expect(defaultLimitHint('freeKm', L)).toBe('Default 0–5 km')
    expect(defaultLimitHint('askRaisePct', L)).toBe('Default 25%')
    expect(defaultLimitHint('changeEveryDays', L)).toBe('Default every 7 days')
    const after = { ...NO_LIMIT_OVERRIDES, perKm: { min: 5, max: 12 }, needsApproval: false }
    expect(limitsChangeLine(NO_LIMIT_OVERRIDES, after)).toBe('Limits: per km ₹5–₹12, no approval needed')
    expect(limitsChangeLine(after, NO_LIMIT_OVERRIDES)).toBe('Limits: back to Detlio’s defaults')
  })
})
