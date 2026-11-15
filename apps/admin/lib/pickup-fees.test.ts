import { describe, expect, test } from 'bun:test'
import { DEFAULT_PICKUP_FEE_SETTINGS, FREE_PICKUP_FEE } from '@repo/core/pickup-fee-maths'
import { changeLine, checkColumns, detlioSummary, feeSummaryLine, parsePickupFeeFilter } from './pickup-fees'

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
    expect(changeLine({ kind: 'locked', before: distance(), after: distance() }, S)).toBe('Locked to Detlio’s fee')
  })
})
