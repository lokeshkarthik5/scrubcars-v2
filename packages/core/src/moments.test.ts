import { describe, expect, test } from 'bun:test'
import {
  PULL_REFRESH_PX,
  answerByRing,
  countdownBox,
  countdownParts,
  countdownWords,
  formatIndianPlate,
  matchSpans,
  pullProgress,
  roadStopAt,
  washGaugeAngle,
  washGaugeShare,
} from './moments'

// A fixed clock: Mon 9 Nov 2026, 10:00 am IST.
const NOW = Date.parse('2026-11-09T04:30:00.000Z')
const MIN = 60_000

describe('countdownParts', () => {
  test('days, hours and minutes, the minutes rounded up', () => {
    const target = NOW + 2 * 1440 * MIN + 1 * 60 * MIN + 14 * MIN
    expect(countdownParts(target, NOW)).toEqual({ days: 2, hours: 1, minutes: 14, past: false })
    // 30 seconds ahead is still a minute away, never "0 min".
    expect(countdownParts(NOW + 30_000, NOW)).toEqual({ days: 0, hours: 0, minutes: 1, past: false })
    expect(countdownParts(NOW + 59 * MIN + 1, NOW)).toEqual({ days: 0, hours: 1, minutes: 0, past: false })
  })

  test('a moment that has come reads all zeros', () => {
    expect(countdownParts(NOW, NOW)).toEqual({ days: 0, hours: 0, minutes: 0, past: true })
    expect(countdownParts(NOW - MIN, NOW).past).toBe(true)
    expect(countdownParts(Number.NaN, NOW).past).toBe(true)
  })

  test('boxes pad hours and minutes, never days', () => {
    expect(countdownBox(1, 'hours')).toBe('01')
    expect(countdownBox(14, 'minutes')).toBe('14')
    expect(countdownBox(2, 'days')).toBe('2')
    expect(countdownBox(12, 'days')).toBe('12')
  })

  test('in words for screen readers', () => {
    expect(countdownWords({ days: 2, hours: 1, minutes: 14, past: false })).toBe(
      '2 days, 1 hour and 14 minutes'
    )
    expect(countdownWords({ days: 0, hours: 0, minutes: 45, past: false })).toBe('45 minutes')
    expect(countdownWords({ days: 1, hours: 0, minutes: 0, past: false })).toBe('1 day')
    expect(countdownWords({ days: 0, hours: 0, minutes: 0, past: true })).toBe('Starting now')
  })
})

describe('answerByRing', () => {
  const deadline = (minutesAhead: number, windowMins = 60) => ({
    respondBy: new Date(NOW + minutesAhead * MIN).toISOString(),
    windowMins,
  })

  test('drains with the time left in the window', () => {
    expect(answerByRing(deadline(60), NOW)).toEqual({ fraction: 1, minutesLeft: 60 })
    expect(answerByRing(deadline(30), NOW)).toEqual({ fraction: 0.5, minutesLeft: 30 })
    expect(answerByRing(deadline(42), NOW).minutesLeft).toBe(42)
  })

  test('the last seconds still say a minute', () => {
    const ring = answerByRing({ respondBy: new Date(NOW + 10_000).toISOString(), windowMins: 60 }, NOW)
    expect(ring.minutesLeft).toBe(1)
    expect(ring.fraction).toBeGreaterThan(0)
  })

  test('a deadline beyond the window is a full ring with no minutes', () => {
    // The garage is shut: its clock starts when it opens.
    expect(answerByRing(deadline(600), NOW)).toEqual({ fraction: 1, minutesLeft: null })
  })

  test('a passed deadline is an empty ring', () => {
    expect(answerByRing(deadline(-5), NOW)).toEqual({ fraction: 0, minutesLeft: 0 })
    expect(answerByRing({ respondBy: 'not a date', windowMins: 60 }, NOW)).toEqual({
      fraction: 0,
      minutesLeft: 0,
    })
  })
})

describe('washGaugeAngle', () => {
  test('from the left stop to the right stop over the wash interval', () => {
    expect(washGaugeAngle(0, 14)).toBe(-90)
    expect(washGaugeAngle(7, 14)).toBe(0)
    expect(washGaugeAngle(14, 14)).toBe(90)
    expect(washGaugeAngle(5, 10)).toBe(0)
  })

  test('overdue pins at the end stop; no wash rests on the left', () => {
    expect(washGaugeAngle(40, 14)).toBe(90)
    expect(washGaugeAngle(null, 14)).toBe(-90)
    expect(washGaugeAngle(-2, 14)).toBe(-90)
  })

  test('the share fills the arc the same way', () => {
    expect(washGaugeShare(12, 14)).toBeCloseTo(12 / 14)
    expect(washGaugeShare(3, 0)).toBe(1)
    expect(washGaugeShare(null, 14)).toBe(0)
  })
})

describe('formatIndianPlate', () => {
  test('state plates in their usual groups', () => {
    expect(formatIndianPlate('tn07cd9036')).toBe('TN 07 CD 9036')
    expect(formatIndianPlate('TN 7 CD 9036')).toBe('TN 07 CD 9036')
    expect(formatIndianPlate('TN-09-AB-4410')).toBe('TN 09 AB 4410')
    expect(formatIndianPlate('DL3C1234')).toBe('DL 03 C 1234')
    expect(formatIndianPlate('KA01 5')).toBe('KA 01 0005')
  })

  test('Bharat series plates', () => {
    expect(formatIndianPlate('22bh1234aa')).toBe('22 BH 1234 AA')
    expect(formatIndianPlate('22 BH 1234 A')).toBe('22 BH 1234 A')
  })

  test('anything else is left as typed, in capitals', () => {
    expect(formatIndianPlate('  my  car ')).toBe('MY CAR')
    expect(formatIndianPlate('TEMP-REG 77')).toBe('TEMP-REG 77')
  })
})

describe('roadStopAt', () => {
  test('evenly from you to the garage', () => {
    expect(roadStopAt(0, 4)).toBe(0)
    expect(roadStopAt(3, 4)).toBe(1)
    expect(roadStopAt(1, 4)).toBeCloseTo(1 / 3)
    expect(roadStopAt(2, 6)).toBeCloseTo(0.4)
    expect(roadStopAt(9, 4)).toBe(1)
    expect(roadStopAt(0, 1)).toBe(1)
  })
})

describe('matchSpans', () => {
  test('underlines each matched word, ignoring case', () => {
    expect(matchSpans('Offers Foam wash', 'foam')).toEqual([
      { text: 'Offers ', match: false },
      { text: 'Foam', match: true },
      { text: ' wash', match: false },
    ])
  })

  test('several words, overlapping ones joined', () => {
    expect(matchSpans('Adyar Car Spa', 'car spa')).toEqual([
      { text: 'Adyar ', match: false },
      { text: 'Car', match: true },
      { text: ' ', match: false },
      { text: 'Spa', match: true },
    ])
    expect(matchSpans('Washwash', 'shw ash')).toEqual([
      { text: 'W', match: false },
      { text: 'ashwash', match: true },
    ])
  })

  test('single letters and an empty query match nothing', () => {
    expect(matchSpans('Adyar', 'a')).toEqual([{ text: 'Adyar', match: false }])
    expect(matchSpans('Adyar', '  ')).toEqual([{ text: 'Adyar', match: false }])
    expect(matchSpans('', 'foam')).toEqual([])
  })
})

describe('pullProgress', () => {
  test('the list moves half the finger, and is ready past the mark', () => {
    expect(pullProgress(40)).toEqual({ offset: 20, share: 20 / PULL_REFRESH_PX, ready: false })
    expect(pullProgress(PULL_REFRESH_PX * 2).ready).toBe(true)
    expect(pullProgress(-30)).toEqual({ offset: 0, share: 0, ready: false })
    expect(pullProgress(10_000).offset).toBe(PULL_REFRESH_PX * 1.4)
  })
})
