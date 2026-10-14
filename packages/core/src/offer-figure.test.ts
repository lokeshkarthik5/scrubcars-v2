import { describe, expect, test } from 'bun:test'
import { formatOfferFigure, stripOfferCode } from './offer-figure'

describe('formatOfferFigure', () => {
  test('a percentage is the number with a raised %', () => {
    expect(formatOfferFigure({ kind: 'percent', value: 20 })).toEqual({
      size: 'percent',
      prefix: null,
      value: '20',
      suffix: '%',
      text: '20%',
    })
    expect(formatOfferFigure({ kind: 'percent', value: 12.5 }).text).toBe(
      '12.5%'
    )
  })

  test('a rupee amount up to three digits stays at full size', () => {
    expect(formatOfferFigure({ kind: 'amount', rupees: 100 })).toEqual({
      size: 'amount',
      prefix: '₹',
      value: '100',
      suffix: null,
      text: '₹100',
    })
    expect(formatOfferFigure({ kind: 'amount', rupees: 999 }).size).toBe(
      'amount'
    )
  })

  test('four and five digits step down, grouped the Indian way', () => {
    const k = formatOfferFigure({ kind: 'amount', rupees: 1000 })
    expect(k.value).toBe('1,000')
    expect(k.size).toBe('amount-sm')
    expect(formatOfferFigure({ kind: 'amount', rupees: 99999 }).size).toBe(
      'amount-sm'
    )
  })

  test('a lakh and up steps down again', () => {
    const lakh = formatOfferFigure({ kind: 'amount', rupees: 100000 })
    expect(lakh.value).toBe('1,00,000')
    expect(lakh.size).toBe('amount-xs')
  })

  test('paise are rounded away', () => {
    expect(formatOfferFigure({ kind: 'amount', rupees: 249.6 }).value).toBe(
      '250'
    )
  })

  test('FREE', () => {
    expect(formatOfferFigure({ kind: 'free' })).toEqual({
      size: 'free',
      prefix: null,
      value: 'FREE',
      suffix: null,
      text: 'FREE',
    })
  })

  test('half-typed admin input shows 0 rather than NaN', () => {
    expect(formatOfferFigure({ kind: 'percent', value: Number('') }).text).toBe(
      '0%'
    )
    expect(formatOfferFigure({ kind: 'amount', rupees: Number.NaN }).text).toBe(
      '₹0'
    )
    expect(formatOfferFigure({ kind: 'amount', rupees: -50 }).text).toBe('₹0')
  })
})

describe('stripOfferCode', () => {
  test('drops the code the admin left in the description', () => {
    expect(stripOfferCode('Up to ₹300 · Code DETAIL20', 'DETAIL20')).toBe(
      'Up to ₹300'
    )
    expect(stripOfferCode('Up to ₹300 · code detail20', 'DETAIL20')).toBe(
      'Up to ₹300'
    )
    expect(stripOfferCode('Code DETAIL20 · Up to ₹300', 'DETAIL20')).toBe(
      'Up to ₹300'
    )
  })

  test('leaves a description without the code alone', () => {
    expect(stripOfferCode('Any service, any day', 'DETAIL20')).toBe(
      'Any service, any day'
    )
    expect(stripOfferCode('Use DETAIL200 here', 'DETAIL20')).toBe(
      'Use DETAIL200 here'
    )
    expect(stripOfferCode('Up to ₹300', '')).toBe('Up to ₹300')
  })

  test('a description that was only the code is empty', () => {
    expect(stripOfferCode('Code DETAIL20', 'DETAIL20')).toBe('')
  })
})
