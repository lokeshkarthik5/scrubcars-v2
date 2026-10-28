import { describe, expect, test } from 'bun:test'
import { countdownLabel, dayChipLabel, istClock, istStartLabel, requestActionLabel, travelFeeLabel, triedLine } from './booking-requests'

describe('request words', () => {
  test('countdowns', () => {
    expect(countdownLabel((1 * 3600 + 52 * 60 + 10) * 1000)).toBe('1:52:10')
    expect(countdownLabel((52 * 60 + 5) * 1000)).toBe('52:05')
    expect(countdownLabel(-5)).toBe('0:00')
  })

  test('times in IST', () => {
    expect(istClock('2026-10-29T06:11:00Z')).toBe('11:41 am')
    expect(istClock('2026-10-29T12:30:00Z')).toBe('6:00 pm')
    expect(istStartLabel('2026-10-30T03:30:00Z')).toBe('Fri 30 Oct, 9:00 am')
    expect(dayChipLabel('2026-11-02')).toBe('Mon 2 Nov')
  })

  test('labels', () => {
    expect(travelFeeLabel(0)).toBe('None')
    expect(travelFeeLabel(200)).toBe('+₹200')
    expect(requestActionLabel('doorstep')).toBe('Request a visit')
    expect(requestActionLabel('pickup')).toBe('Request a pickup')
    expect(triedLine(1)).toBe('Tried 1 of 2 nearby garages.')
  })
})
