import { describe, expect, test } from 'bun:test'
import type { StatsBreakdown } from '@repo/core/api/admin'
import {
  barsToLabel,
  biggestDropLine,
  breakdownCsv,
  busiestSlots,
  busiestWeekday,
  categoryList,
  change,
  comparedWith,
  comparisonDates,
  eventsStartNote,
  FUNNEL_PERIODS,
  funnelPeriod,
  heatLevel,
  hourLabel,
  monthOptions,
  monthRange,
  percent,
  periodRange,
  rangeLabel,
  returnWindowLine,
  rupees,
  shortRupees,
} from './statistics'

const TODAY = '2026-10-16'

describe('periods', () => {
  test('each preset ends today, both ends included', () => {
    expect(periodRange('last7', TODAY)).toEqual({ from: '2026-10-10', to: TODAY })
    expect(periodRange('last30', TODAY)).toEqual({ from: '2026-09-17', to: TODAY })
    expect(periodRange('last90', TODAY)).toEqual({ from: '2026-07-19', to: TODAY })
    expect(periodRange('thisMonth', TODAY)).toEqual({ from: '2026-10-01', to: TODAY })
  })

  test('last month is the whole calendar month, across a year end too', () => {
    expect(periodRange('lastMonth', TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(periodRange('lastMonth', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(periodRange('lastMonth', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  test('what each is compared with, in words and dates', () => {
    expect(comparedWith(periodRange('last30', TODAY))).toBe('previous 30 days')
    expect(comparedWith(periodRange('thisMonth', TODAY))).toBe('previous 16 days')
    expect(comparedWith(periodRange('lastMonth', TODAY))).toBe('August')
    expect(comparisonDates(periodRange('last30', TODAY))).toBe('17 Sep – 16 Oct vs 18 Aug – 16 Sep')
  })

  test('the commission months: this one so far, then whole months back a year', () => {
    const months = monthOptions(TODAY)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ value: '2026-10', label: 'October 2026' })
    expect(months[11]).toEqual({ value: '2025-11', label: 'November 2025' })
    expect(monthRange('2026-10', TODAY)).toEqual({ from: '2026-10-01', to: TODAY })
    expect(monthRange('2026-02', TODAY)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2025-12', TODAY)).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('words for figures', () => {
  test('dates', () => {
    expect(rangeLabel({ from: '2026-09-17', to: '2026-10-16' })).toBe('17 Sep – 16 Oct')
    expect(rangeLabel({ from: '2026-09-17', to: '2026-09-20' })).toBe('17–20 Sep')
    expect(rangeLabel({ from: '2026-10-16', to: '2026-10-16' })).toBe('16 Oct')
  })

  test('money, in Indian grouping and short', () => {
    expect(rupees(318720)).toBe('₹3,18,720')
    expect(rupees(773.6)).toBe('₹774')
    expect(shortRupees(740)).toBe('₹740')
    expect(shortRupees(70_300)).toBe('₹70.3k')
    expect(shortRupees(318_720)).toBe('₹3.2L')
  })

  test('rates', () => {
    expect(percent(0.64)).toBe('64%')
    expect(percent(0.066, 1)).toBe('6.6%')
    expect(percent(null)).toBe('–')
  })

  test('categories in a line', () => {
    expect(categoryList(['car_wash', 'package', 'others'])).toBe('Car wash, packages and others')
    expect(categoryList(['detailing', 'coating', 'scratch_removal'])).toBe(
      'Detailing, coating and scratch removal'
    )
  })
})

describe('barsToLabel', () => {
  test('every bar while seven fit on a phone', () => {
    expect([...barsToLabel([500, 1200, 800])]).toEqual([0, 1, 2])
    expect(barsToLabel(Array(7).fill(100)).size).toBe(7)
  })

  test("past seven (Last 90 days' 14 weeks), the first, the last and the highest", () => {
    const weeks = [400, 900, 5310, 2000, 1800, 700, 1200, 3000, 2500, 1100, 900, 1500, 1700, 600]
    expect([...barsToLabel(weeks)].sort((a, b) => a - b)).toEqual([0, 2, 13])
    // The highest at an end is labelled once.
    expect([...barsToLabel([9, 1, 1, 1, 1, 1, 1, 1])].sort((a, b) => a - b)).toEqual([0, 7])
  })
})

describe('change', () => {
  test('counts and money in percent, and up is good unless said otherwise', () => {
    expect(change(412, 349, 'amount')).toEqual({ direction: 'up', text: '18%', good: true })
    expect(change(300, 349, 'amount')).toEqual({ direction: 'down', text: '14%', good: false })
  })

  test('rates in points; fewer cancellations is the good direction', () => {
    expect(change(0.64, 0.6, 'rate')).toEqual({ direction: 'up', text: '4 pts', good: true })
    expect(change(0.066, 0.054, 'rate', 'down', 1)).toEqual({
      direction: 'up',
      text: '1.2 pts',
      good: false,
    })
  })

  test('nothing to compare with is no arrow at all', () => {
    expect(change(5, 0, 'amount')).toBeNull()
    expect(change(null, 0.5, 'rate')).toBeNull()
    expect(change(0.5, null, 'rate')).toBeNull()
    expect(change(10, 10, 'amount')).toEqual({ direction: 'same', text: 'no change', good: null })
  })
})

describe('busy hours', () => {
  test('shades in quarters of the busiest cell', () => {
    expect(heatLevel(0, 12)).toBe(0)
    expect(heatLevel(1, 12)).toBe(1)
    expect(heatLevel(6, 12)).toBe(2)
    expect(heatLevel(12, 12)).toBe(4)
  })

  test('labels and the busiest slots', () => {
    expect(hourLabel(0)).toBe('12 AM')
    expect(hourLabel(8)).toBe('8 AM')
    expect(hourLabel(12)).toBe('12 PM')
    expect(hourLabel(20)).toBe('8 PM')
    expect(
      busiestSlots([
        { weekday: 6, hour: 10, bookings: 5 },
        { weekday: 1, hour: 9, bookings: 2 },
        { weekday: 7, hour: 9, bookings: 5 },
        { weekday: 2, hour: 9, bookings: 0 },
      ])
    ).toEqual(['Sat 10 AM (5)', 'Sun 9 AM (5)', 'Mon 9 AM (2)'])
  })

  test('the busiest weekday, or none on a tie', () => {
    // 17 Oct 2026 is a Saturday.
    expect(
      busiestWeekday([
        { date: '2026-10-16', bookings: 3 },
        { date: '2026-10-17', bookings: 5 },
      ])
    ).toBe('Saturdays')
    expect(
      busiestWeekday([
        { date: '2026-10-16', bookings: 5 },
        { date: '2026-10-17', bookings: 5 },
      ])
    ).toBeNull()
    expect(busiestWeekday([])).toBeNull()
  })
})

describe('breakdownCsv', () => {
  test('a section per block, each cell made safe for a spreadsheet', () => {
    const breakdown: StatsBreakdown = {
      range: { from: '2026-09-17', to: '2026-10-16', days: 30 },
      funnel: {
        checkoutsStarted: 13,
        paid: 10,
        completed: 7,
        leftWithoutPaying: 2,
        paidNoBooking: 1,
        cancelled: 1,
        noShows: 1,
        notDone: 1,
        paidOfStarted: 10 / 13,
        completedOfPaid: 0.7,
      },
      garages: [
        { vendorId: 'g', name: '=Shine, "Best"', bookings: 10, collected: 7900, rating: 4.5, reviews: 2 },
      ],
      services: [{ category: 'car_wash', bookings: 7, collected: 3000 }],
      busyHours: {
        firstHour: 7,
        lastHour: 21,
        total: 7,
        cells: [
          { weekday: 6, hour: 10, bookings: 7 },
          { weekday: 1, hour: 10, bookings: 0 },
        ],
      },
    }
    const lines = breakdownCsv(breakdown).split('\r\n')
    expect(lines[0]).toBe('Section,Name,Bookings,Collected (₹),Rating')
    expect(lines[1]).toBe('Period,17 Sep – 16 Oct,,,')
    expect(lines[2]).toBe('Funnel,Checkout started,13,,')
    // Not "upcoming": nothing completes a booking on its own, so some are past.
    expect(lines).toContain('Funnel,Not marked done yet,1,,')
    expect(lines).toContain(`Garage,"'=Shine, ""Best""",10,7900,4.5`)
    expect(lines).toContain('Service type,Car wash,7,3000,')
    expect(lines).toContain('Busy hours,Sat 10 AM,7,,')
    expect(lines.filter((line) => line.startsWith('Busy hours'))).toHaveLength(1)
    expect(lines[lines.length - 1]).toBe('')
  })
})

describe('the Funnel tab', () => {
  test('goes by the last 7, 30 or 90 days; a month falls back to 30', () => {
    expect(FUNNEL_PERIODS.map((p) => p.value)).toEqual(['last7', 'last30', 'last90'])
    expect(funnelPeriod('last7')).toBe('last7')
    expect(funnelPeriod('last90')).toBe('last90')
    expect(funnelPeriod('thisMonth')).toBe('last30')
    expect(funnelPeriod('lastMonth')).toBe('last30')
  })

  test('says when usage events start, only while the period reaches back past it', () => {
    const range = { from: '2026-09-18', to: '2026-10-17' }
    expect(eventsStartNote('2026-10-17', range)).toBe(
      'Usage events start on 17 Oct, when recording began. Days before that have none, so the visit steps read low for this period.'
    )
    expect(eventsStartNote('2026-09-18', range)).toBeNull()
    expect(eventsStartNote('2026-09-01', range)).toBeNull()
    expect(eventsStartNote(null, range)).toContain('No usage events yet')
  })

  test('names the biggest drop, or nothing when nothing fell', () => {
    const steps: never[] = []
    expect(biggestDropLine({ steps, biggestDrop: { key: 'checkout', lost: 90, ofPrevious: 0.25 } })).toBe(
      'Biggest drop: 90 lost before this step · 25% went on'
    )
    expect(biggestDropLine({ steps, biggestDrop: null })).toBeNull()
  })

  test('a return window says how many of how many, or that it is too soon', () => {
    expect(returnWindowLine({ days: 30, eligible: 20, returned: 8, rate: 0.4 })).toBe('8 of 20 customers')
    expect(returnWindowLine({ days: 60, eligible: 0, returned: 0, rate: null })).toBe(
      'Too recent to tell: no booking in the period is 60 days old yet'
    )
  })
})
