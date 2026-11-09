import { describe, expect, test } from 'bun:test'
import {
  COUNT_UP_MS,
  countUpFrame,
  easeOutCubic,
  odometerPlaces,
  odometerRoll,
} from './figure-motion'

describe('countUpFrame', () => {
  test('starts at nothing and ends exactly on the figure', () => {
    expect(countUpFrame(499, 0)).toBe('0')
    expect(countUpFrame(499, COUNT_UP_MS)).toBe('499')
    expect(countUpFrame(4.5, COUNT_UP_MS, 1)).toBe('4.5')
    expect(countUpFrame(6.2, COUNT_UP_MS * 3, 1)).toBe('6.2')
  })

  test('keeps the decimals of the settled figure on every frame', () => {
    expect(countUpFrame(6.2, 100, 1)).toMatch(/^\d+\.\d$/)
    expect(countUpFrame(20, 100)).toMatch(/^\d+$/)
  })

  test('moves fast first and slows to the end (ease-out)', () => {
    const half = Number(countUpFrame(100, COUNT_UP_MS / 2))
    expect(half).toBeGreaterThan(50)
    expect(half).toBeLessThan(100)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })

  test('says nothing for a figure that is not a number', () => {
    expect(countUpFrame(Number.NaN, 100)).toBe('')
  })
})

describe('odometerPlaces', () => {
  test('digits roll; the rupee sign and the separators stand still', () => {
    expect(odometerPlaces('₹1,049')).toEqual([
      { char: '₹', digit: null },
      { char: '1', digit: 1 },
      { char: ',', digit: null },
      { char: '0', digit: 0 },
      { char: '4', digit: 4 },
      { char: '9', digit: 9 },
    ])
    expect(odometerPlaces('6.2').map((p) => p.digit)).toEqual([6, null, 2])
  })
})

describe('odometerRoll', () => {
  test('up when the figure grows, down when it shrinks, none when it stays', () => {
    expect(odometerRoll(999, 1049)).toBe('up')
    expect(odometerRoll(5, 3)).toBe('down')
    expect(odometerRoll(5, 5)).toBe('none')
    expect(odometerRoll(Number.NaN, 5)).toBe('none')
  })
})
