import { describe, expect, test } from 'bun:test'
import { distanceAndDrive, distanceLabel, driveMinutes, driveTimeLabel } from './drive-time'

describe('drive time from straight-line km', () => {
  test('round(4 + km × 2.6)', () => {
    expect(driveMinutes(0)).toBe(4)
    expect(driveMinutes(1)).toBe(7) // 6.6
    expect(driveMinutes(6.2)).toBe(20) // 20.12
    expect(driveMinutes(8.9)).toBe(27) // 27.14
    expect(driveMinutes(14)).toBe(40) // 40.4
    expect(driveMinutes(2.5)).toBe(11) // 10.5 rounds up
  })

  test('never below the start minutes, whatever is passed', () => {
    expect(driveMinutes(-3)).toBe(4)
  })

  test('"~N min" up to an hour, then hours and minutes', () => {
    expect(driveTimeLabel(6.2)).toBe('~20 min')
    expect(driveTimeLabel(21.5)).toBe('~60 min') // 59.9 → 60
    expect(driveTimeLabel(22)).toBe('~1 h 1 min') // 61.2 → 61
    expect(driveTimeLabel(25.4)).toBe('~1 h 10 min') // 70.04 → 70
    expect(driveTimeLabel(44.6)).toBe('~2 h') // 119.96 → 120
  })
})

describe('the card line', () => {
  test('km to one decimal, metres under a kilometre', () => {
    expect(distanceLabel(6.24)).toBe('6.2 km')
    expect(distanceLabel(0.4)).toBe('400 m')
  })

  test('an area-based distance starts with "~" too', () => {
    expect(distanceAndDrive(6.2)).toBe('6.2 km · ~20 min')
    expect(distanceAndDrive(6.2, true)).toBe('~6.2 km · ~20 min')
    expect(distanceAndDrive(0.4, true)).toBe('~400 m · ~5 min')
  })
})
