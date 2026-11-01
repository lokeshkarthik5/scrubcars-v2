import { describe, expect, test } from 'bun:test'
import { onlineAmount } from './booking-payment'

describe('onlineAmount', () => {
  test('is the total less the Detlio credit part', () => {
    expect(onlineAmount(499, 100)).toBe(399)
  })

  test('is the whole total when no credit was used', () => {
    expect(onlineAmount(499, 0)).toBe(499)
    expect(onlineAmount(499, undefined)).toBe(499)
  })

  test('is 0 when credit covered it all, and never negative', () => {
    expect(onlineAmount(499, 499)).toBe(0)
    expect(onlineAmount(499, 600)).toBe(0)
    expect(onlineAmount(0, 0)).toBe(0)
  })

  test('keeps paise without floating-point noise', () => {
    expect(onlineAmount(499.1, 100.1)).toBe(399)
    expect(onlineAmount(337.5, 100)).toBe(237.5)
  })
})
