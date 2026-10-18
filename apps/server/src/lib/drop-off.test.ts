import { describe, expect, test } from 'bun:test'
import {
  DROP_OFF_RULES,
  dropOff,
  dropOffFlagged,
  lastBookingAt,
  median,
  quietThresholdDays,
  usualGapDays,
  type DropOffChain,
} from './drop-off.js'

const NOW = new Date('2026-10-18T06:30:00.000Z') // 12:00 IST
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)

let next = 0
function chain(userId: string, vendorId: string, days: number, status = 'completed', bookedDaysAgo?: number): DropOffChain {
  next += 1
  return {
    userId,
    vendorId,
    bookingId: `b${next}`,
    status,
    bookedAt: daysAgo(bookedDaysAgo ?? days + 2),
    serviceAt: daysAgo(days),
  }
}

describe('the usual gap', () => {
  test('is the median of the gaps between consecutive jobs, in IST days', () => {
    expect(usualGapDays([daysAgo(100), daysAgo(86), daysAgo(72)])).toBe(14)
    // Gaps 10, 20, 60: the median is 20, so one long break does not hide a routine.
    expect(usualGapDays([daysAgo(190), daysAgo(130), daysAgo(110), daysAgo(100)])).toBe(20)
    // Even count: the mean of the middle two.
    expect(median([7, 10, 14, 30])).toBe(12)
  })

  test('needs two jobs', () => {
    expect(usualGapDays([daysAgo(10)])).toBeNull()
    expect(usualGapDays([])).toBeNull()
  })

  test('two jobs on the same IST day are a gap of 0', () => {
    expect(usualGapDays([new Date('2026-10-10T03:00:00Z'), new Date('2026-10-10T10:00:00Z')])).toBe(0)
  })
})

describe('the quiet threshold', () => {
  test('is twice the usual gap', () => {
    expect(quietThresholdDays(21)).toBe(42)
  })

  test('is never under 30 days', () => {
    expect(quietThresholdDays(7)).toBe(DROP_OFF_RULES.minQuietDays)
    expect(quietThresholdDays(0)).toBe(30)
    expect(quietThresholdDays(15)).toBe(30)
  })
})

describe('the last booking', () => {
  test('a booking still to come keeps the customer from reading quiet', () => {
    const upcoming = { ...chain('u', 'g', -5, 'confirmed'), bookedAt: daysAgo(1) }
    expect(lastBookingAt([chain('u', 'g', 60), upcoming])).toEqual(daysAgo(-5))
  })

  test('a cancelled booking counts from the day it was made', () => {
    const cancelled = { ...chain('u', 'g', -10, 'cancelled'), bookedAt: daysAgo(3) }
    expect(lastBookingAt([chain('u', 'g', 60), cancelled])).toEqual(daysAgo(3))
  })
})

describe('regulars who went quiet', () => {
  test('3 completed in 180 days at one garage makes a regular; 2 does not', () => {
    const { pairs } = dropOff(
      [chain('a', 'g1', 100), chain('a', 'g1', 86), chain('a', 'g1', 72), chain('b', 'g1', 50), chain('b', 'g1', 40)],
      NOW
    )
    expect(pairs.map((p) => p.userId)).toEqual(['a'])
  })

  test('jobs older than 180 days do not make a regular', () => {
    const { pairs } = dropOff([chain('a', 'g1', 200), chain('a', 'g1', 190), chain('a', 'g1', 20)], NOW)
    expect(pairs).toEqual([])
  })

  test('quiet past twice the usual gap (min 30) is went quiet; at it is not', () => {
    // Every 14 days, last one 72 days ago: threshold max(28, 30) = 30.
    const quiet = dropOff([chain('a', 'g1', 100), chain('a', 'g1', 86), chain('a', 'g1', 72)], NOW).pairs[0]!
    expect(quiet.usualGapDays).toBe(14)
    expect(quiet.thresholdDays).toBe(30)
    expect(quiet.wentQuiet).toBe(true)

    // Every 20 days, last one 40 days ago (booked 2 days before): 40 is not over 40.
    const atLine = dropOff([chain('c', 'g1', 80), chain('c', 'g1', 60), chain('c', 'g1', 40)], NOW).pairs[0]!
    expect(atLine.thresholdDays).toBe(40)
    expect(atLine.quietDays).toBe(40)
    expect(atLine.wentQuiet).toBe(false)
  })

  test('a booking anywhere else on Detlio means not quiet', () => {
    const { pairs } = dropOff(
      [chain('a', 'g1', 100), chain('a', 'g1', 86), chain('a', 'g1', 72), chain('a', 'g2', 5)],
      NOW
    )
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.wentQuiet).toBe(false)
    expect(pairs[0]!.quietDays).toBe(5)
  })

  test('the gap is read from every garage, not only this one', () => {
    // At g1 every 30 days, but with g2 in between the customer books every 15.
    const { pairs } = dropOff(
      [
        chain('a', 'g1', 120),
        chain('a', 'g2', 105),
        chain('a', 'g1', 90),
        chain('a', 'g2', 75),
        chain('a', 'g1', 60),
      ],
      NOW
    )
    expect(pairs[0]!.usualGapDays).toBe(15)
  })

  test('the row links to the last booking at this garage', () => {
    const last = chain('a', 'g1', 72)
    const { pairs } = dropOff([chain('a', 'g1', 100), chain('a', 'g1', 86), last], NOW)
    expect(pairs[0]!.lastBookingId).toBe(last.bookingId)
  })
})

describe('per garage', () => {
  function regular(userId: string, vendorId: string, quiet: boolean): DropOffChain[] {
    const lastDays = quiet ? 70 : 10
    return [chain(userId, vendorId, lastDays + 28), chain(userId, vendorId, lastDays + 14), chain(userId, vendorId, lastDays)]
  }

  test('rate = went quiet ÷ regulars, sorted by rate', () => {
    const { garages } = dropOff(
      [
        ...regular('a', 'g1', true),
        ...regular('b', 'g1', false),
        ...regular('c', 'g1', false),
        ...regular('d', 'g2', true),
        ...regular('e', 'g2', true),
        ...regular('f', 'g2', true),
        ...regular('h', 'g2', false),
      ],
      NOW
    )
    expect(garages.map((g) => [g.vendorId, g.regulars, g.wentQuiet])).toEqual([
      ['g2', 4, 3],
      ['g1', 3, 1],
    ])
    expect(garages[0]!.rate).toBe(0.75)
    expect(garages[0]!.flagged).toBe(true)
    expect(garages[1]!.rate).toBeCloseTo(1 / 3)
    expect(garages[1]!.flagged).toBe(true)
  })

  test('flagged at 30% or more with at least 3 regulars', () => {
    expect(dropOffFlagged(0.3, 3)).toBe(true)
    expect(dropOffFlagged(0.29, 10)).toBe(false)
    // One of two quiet is 50%, but two regulars is not a signal yet.
    expect(dropOffFlagged(0.5, 2)).toBe(false)
  })
})
