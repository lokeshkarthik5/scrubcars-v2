import { describe, expect, test } from 'bun:test'
import type { OpeningDay } from '@repo/core/opening-hours'
import type { Booking } from '@repo/core/types'
import {
  answerLine,
  blockLabel,
  calendarJobs,
  calendarKind,
  calendarViewFrom,
  closedDay,
  closedNote,
  closedTitle,
  dayButtonLabel,
  dayDots,
  dayHeading,
  dayHours,
  daySubtitle,
  daySummary,
  freeGaps,
  hourLabel,
  istDateKey,
  jobDurationMins,
  minuteClock,
  monthBounds,
  monthGrid,
  monthTitle,
  nextQuarter,
  packLanes,
  roomByMinute,
  shiftMonth,
  stripNote,
  timelineFor,
  weekOf,
  type CalendarJob,
} from './calendar'

// Tue 10 Nov 2026, 11:20 am in India (the mockup's "now").
const NOW = Date.parse('2026-11-10T05:50:00Z')
const MIN = 60 * 1000
const TODAY = '2026-11-10'

/** An IST wall-clock time on a day, as the API's ISO string. */
const istAt = (day: string, clock: string) =>
  new Date(`${day}T${clock}:00+05:30`).toISOString()

function job(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    vendorId: 'v1',
    vendorName: 'Marina Auto Spa',
    items: [{ id: 's1', name: 'Foam wash', amount: 600, durationMins: 45 }],
    serviceId: 's1',
    serviceName: 'Foam wash',
    serviceSummary: 'Foam wash',
    durationMins: 45,
    servicePrice: 600,
    subtotalPrice: 600,
    discountAmount: 0,
    status: 'confirmed',
    bookingType: 'dropin',
    scheduledAt: '',
    scheduledAtIso: istAt(TODAY, '14:00'),
    customerName: 'Arun Mohan',
    contactWindow: null,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    rescheduleCount: 0,
    remainingReschedules: 2,
    requestedAtIso: istAt(TODAY, '09:00'),
    paidAtBooking: 600,
    jobPhotos: [],
    photoStandard: null,
    customerBadge: null,
    conditionPhotos: null,
    conditionCheck: null,
    finalBill: null,
    canRaiseFinalBill: false,
    extraWork: [],
    extraWorkRefusal: null,
    completeBlockedByExtraWork: false,
    timeProposal: null,
    canSuggestTimes: true,
    responseDeadline: null,
    notAcceptedInTime: false,
    guaranteeRedo: false,
    refund: { status: 'none', amount: 0, amountRefunded: 0 },
    receiptAvailable: false,
    ...overrides,
  } as Booking
}

/** A placed job for the lane and gap helpers. */
const placed = (
  id: string,
  startMin: number,
  endMin: number,
  extra: Partial<CalendarJob> = {}
): CalendarJob => ({
  booking: job({ id }),
  kind: 'accepted',
  day: TODAY,
  startMin,
  endMin,
  onTheRoad: false,
  ...extra,
})

// Open 9:00–6:30 every day but Sunday.
const HOURS: OpeningDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  openTime: '09:00:00',
  closeTime: '18:30:00',
  isClosed: dayOfWeek === 0,
}))

describe('days, weeks and months on India’s calendar', () => {
  test('a moment’s day is India’s, whatever UTC says', () => {
    // 11:30 pm on the 10th in India is still the 10th; 12:30 am is the 11th.
    expect(istDateKey(Date.parse('2026-11-10T18:00:00Z'))).toBe('2026-11-10')
    expect(istDateKey(Date.parse('2026-11-10T19:00:00Z'))).toBe('2026-11-11')
  })

  test('the month grid is six Monday-first rows with the neighbouring days', () => {
    const grid = monthGrid('2026-11')
    expect(grid).toHaveLength(42)
    // 1 Nov 2026 is a Sunday: the first row starts on Mon 26 Oct.
    expect(grid[0]).toBe('2026-10-26')
    expect(grid[6]).toBe('2026-11-01')
    expect(grid[41]).toBe('2026-12-06')
    // A month starting on a Monday starts the grid itself.
    expect(monthGrid('2027-02')[0]).toBe('2027-02-01')
  })

  test('a week runs Monday to Sunday, across a month’s end', () => {
    expect(weekOf(TODAY)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
    expect(weekOf('2026-11-29')[0]).toBe('2026-11-23')
    expect(weekOf('2026-12-02')[0]).toBe('2026-11-30')
  })

  test('months move across a year’s end, and read in words', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(monthTitle('2026-11')).toBe('November 2026')
    expect(dayHeading(TODAY, TODAY)).toBe('Today · Tue 10 Nov')
    expect(dayHeading('2026-11-12', TODAY)).toBe('Thu 12 Nov')
  })

  test('the ‹ › go back to the oldest job and forward to the furthest one or the booking week', () => {
    expect(monthBounds([], TODAY)).toEqual({
      first: '2026-11',
      last: '2026-11',
    })
    // Late in the month the booking week reaches into the next.
    expect(monthBounds([], '2026-11-28')).toEqual({
      first: '2026-11',
      last: '2026-12',
    })
    expect(monthBounds(['2026-08-02', '2027-01-05'], TODAY)).toEqual({
      first: '2026-08',
      last: '2027-01',
    })
  })
})

describe('calendarKind', () => {
  test('one colour per state; what is off the calendar is null', () => {
    expect(calendarKind(job({ status: 'pending' }), NOW)).toBe('answer')
    expect(calendarKind(job({ status: 'confirmed' }), NOW)).toBe('accepted')
    expect(calendarKind(job({ status: 'in_progress' }), NOW)).toBe('working')
    expect(calendarKind(job({ status: 'completed' }), NOW)).toBe('done')
    expect(calendarKind(job({ status: 'cancelled' }), NOW)).toBeNull()
    expect(calendarKind(job({ status: 'rescheduled' }), NOW)).toBeNull()
  })

  test('a customer no-show stays, as done; a garage no-show does not', () => {
    expect(
      calendarKind(job({ status: 'cancelled', noShow: 'customer' }), NOW)
    ).toBe('done')
    expect(
      calendarKind(job({ status: 'cancelled', noShow: 'garage' }), NOW)
    ).toBeNull()
  })

  test('a booking whose time to answer ran out, or that waits on the customer, is off', () => {
    const ranOut = job({
      status: 'pending',
      responseDeadline: {
        respondBy: new Date(NOW - MIN).toISOString(),
        enforced: true,
        windowMins: 30,
      },
    })
    expect(calendarKind(ranOut, NOW)).toBeNull()
    const suggested = job({
      status: 'pending',
      timeProposal: { status: 'open' } as Booking['timeProposal'],
    })
    expect(calendarKind(suggested, NOW)).toBeNull()
  })
})

describe('jobDurationMins', () => {
  test('the length the booking holds in capacity', () => {
    expect(jobDurationMins(job({ durationMins: 90 }))).toBe(90)
  })

  test('with no snapshot, each service’s own, and 60 for one with none (as the slot list holds)', () => {
    const b = job({
      durationMins: 0,
      items: [
        {
          id: 'i1',
          serviceId: 's1',
          name: 'Foam wash',
          amount: 600,
          durationMins: 45,
        },
        {
          id: 'i2',
          serviceId: 's2',
          name: 'Interior',
          amount: 900,
          durationMins: 0,
        },
        {
          id: 'i3',
          serviceId: 'a1',
          name: 'Air freshener',
          amount: 49,
          durationMins: 0,
          isAddon: true,
        },
      ],
    })
    expect(jobDurationMins(b)).toBe(105)
    expect(jobDurationMins(job({ durationMins: 0, items: [] }))).toBe(60)
  })
})

describe('calendarJobs and the day summary', () => {
  const list = [
    job({
      id: 'late',
      scheduledAtIso: istAt(TODAY, '16:00'),
      bookingType: 'pickup',
    }),
    job({
      id: 'early',
      status: 'completed',
      scheduledAtIso: istAt(TODAY, '09:00'),
    }),
    job({
      id: 'new',
      status: 'pending',
      scheduledAtIso: istAt(TODAY, '12:00'),
    }),
    job({
      id: 'gone',
      status: 'cancelled',
      scheduledAtIso: istAt(TODAY, '13:00'),
    }),
    // 11:45 pm: on the 12th, and drawn only to midnight.
    job({
      id: 'night',
      scheduledAtIso: istAt('2026-11-12', '23:45'),
      durationMins: 60,
    }),
  ]
  const days = calendarJobs(list, NOW)

  test('groups by India’s day, in start order, leaving out what is off the calendar', () => {
    expect(days.get(TODAY)?.map((j) => j.booking.id)).toEqual([
      'early',
      'new',
      'late',
    ])
    const night = days.get('2026-11-12')?.[0]
    expect(night?.startMin).toBe(23 * 60 + 45)
    expect(night?.endMin).toBe(24 * 60)
  })

  test('doorstep and pickup & drop go on the road', () => {
    expect(days.get(TODAY)?.map((j) => j.onTheRoad)).toEqual([
      false,
      false,
      true,
    ])
  })

  test('counts per colour and the dots in the legend’s order', () => {
    const summary = daySummary(days.get(TODAY))
    expect(summary).toEqual({ total: 3, answer: 1, accepted: 1, done: 1 })
    expect(dayDots(summary)).toEqual(['answer', 'accepted', 'done'])
    expect(dayDots(daySummary([]))).toEqual([])
  })
})

describe('closed days and opening hours', () => {
  const closures = [{ date: '2026-11-18', reason: 'Family function' }]

  test('time off, then the weekly closed day; nothing is closed while the hours are unknown', () => {
    expect(closedDay('2026-11-18', HOURS, closures)).toEqual({
      kind: 'timeoff',
      reason: 'Family function',
    })
    expect(closedDay('2026-11-15', HOURS, closures)).toEqual({ kind: 'weekly' })
    expect(closedDay(TODAY, HOURS, closures)).toBeNull()
    expect(closedDay('2026-11-15', [], [])).toBeNull()
  })

  test('a weekday with no row, or hours that don’t run forwards, is shut too', () => {
    const noSunday = HOURS.filter((h) => h.dayOfWeek !== 0).map((h) =>
      h.dayOfWeek === 2
        ? { ...h, openTime: '18:00:00', closeTime: '09:00:00' }
        : h
    )
    expect(closedDay('2026-11-15', noSunday, [])).toEqual({ kind: 'weekly' })
    expect(closedDay(TODAY, noSunday, [])).toEqual({ kind: 'weekly' })
  })

  test('the closed card’s words', () => {
    expect(closedTitle({ kind: 'weekly' })).toBe('Closed · Weekly holiday')
    expect(closedTitle({ kind: 'timeoff', reason: 'Family function' })).toBe(
      'Time off · Family function'
    )
    expect(closedTitle({ kind: 'timeoff', reason: null })).toBe('Time off')
    expect(closedNote({ kind: 'weekly' })).toBe(
      'Customers can’t book this day. Change it in Settings → Hours.'
    )
    expect(closedNote({ kind: 'timeoff', reason: null })).toBe(
      'Customers can’t book this day. Change it in Settings → Time off.'
    )
  })

  test('a day’s hours, or 9 to 6 when it has none', () => {
    expect(dayHours(TODAY, HOURS)).toEqual({
      openMin: 540,
      closeMin: 1110,
      known: true,
    })
    expect(dayHours('2026-11-15', HOURS)).toEqual({
      openMin: 540,
      closeMin: 1080,
      known: false,
    })
  })

  test('the Day view’s second line', () => {
    const hours = dayHours(TODAY, HOURS)
    expect(daySubtitle(6, hours, null)).toBe('6 jobs · open 9:00 am – 6:30 pm')
    expect(daySubtitle(0, hours, null)).toBe('No jobs · open 9:00 am – 6:30 pm')
    expect(daySubtitle(1, dayHours('2026-11-15', []), null)).toBe('1 job')
    expect(daySubtitle(0, hours, { kind: 'weekly' })).toBe(
      'No jobs · Closed · Weekly holiday'
    )
  })
})

describe('the timeline', () => {
  const hours = { openMin: 540, closeMin: 1110, known: true }

  test('from the opening hour to the hour after closing', () => {
    const line = timelineFor(hours, [])
    expect(line.startMin).toBe(540)
    expect(line.endMin).toBe(1140)
    expect(line.hours).toHaveLength(10)
    // Closing on the hour still leaves a band for "Closes 6 pm".
    expect(timelineFor({ ...hours, closeMin: 1080 }, []).endMin).toBe(1140)
  })

  test('stretched to take in a job booked outside the hours', () => {
    const line = timelineFor(hours, [
      placed('x', 7 * 60 + 30, 8 * 60 + 15),
      placed('y', 1140, 1230),
    ])
    expect(line.startMin).toBe(420)
    expect(line.endMin).toBe(1260)
  })

  test('hour labels name am or pm on the first and at noon', () => {
    expect(hourLabel(540, true)).toBe('9 am')
    expect(hourLabel(600, false)).toBe('10')
    expect(hourLabel(720, false)).toBe('12 pm')
    expect(hourLabel(780, false)).toBe('1')
    expect(minuteClock(1110)).toBe('6:30 pm')
    expect(minuteClock(0)).toBe('12:00 am')
  })

  test('now rounds up to the next quarter hour, for the free gaps', () => {
    expect(nextQuarter(NOW)).toBe(11 * 60 + 30)
  })
})

describe('packLanes', () => {
  test('first free lane by start time, as many lanes as bays', () => {
    const lanes = packLanes(
      [
        placed('a', 540, 585),
        placed('b', 570, 615),
        placed('c', 600, 660),
        placed('d', 840, 1020),
      ],
      2
    )
    expect(lanes.map((lane) => lane.map((j) => j.booking.id))).toEqual([
      ['a', 'c', 'd'],
      ['b'],
    ])
  })

  test('one lane when bays are unset; more overlapping jobs add lanes rather than hide', () => {
    expect(packLanes([], null)).toEqual([[]])
    const lanes = packLanes(
      [placed('a', 540, 600), placed('b', 540, 600), placed('c', 550, 600)],
      2
    )
    expect(lanes).toHaveLength(3)
    expect(packLanes([], 3)).toHaveLength(3)
  })

  test('back-to-back jobs share a lane', () => {
    expect(
      packLanes([placed('a', 540, 600), placed('b', 600, 660)], 2)[0]
    ).toHaveLength(2)
  })
})

describe('freeGaps', () => {
  const hours = { openMin: 540, closeMin: 1110, known: true }
  const DAY = '2026-11-12'
  const ROOM = { bays: 1, jobsPerDay: null, paused: false }

  /** A paid booking at an IST clock time on DAY, `mins` long. */
  const at = (
    id: string,
    clock: string,
    mins: number,
    extra: Partial<Booking> = {}
  ) =>
    job({
      id,
      scheduledAtIso: istAt(DAY, clock),
      durationMins: mins,
      ...extra,
    })

  /** The Day view's own steps: the day's jobs, the at-garage lanes, their gaps. */
  function gaps(
    bookings: Booking[],
    room: { bays: number | null; jobsPerDay: number | null; paused: boolean },
    fromMin = 0
  ) {
    const jobs = calendarJobs(bookings, NOW).get(DAY) ?? []
    const lanes = packLanes(
      jobs.filter((j) => !j.onTheRoad),
      room.bays
    )
    return freeGaps({ lanes, bookings, day: DAY, hours, fromMin, room })
  }

  test('45 minutes or more inside opening hours, between and around jobs', () => {
    const list = [
      at('a', '09:30', 45),
      at('b', '10:45', 90),
      at('c', '15:00', 45),
    ]
    expect(gaps(list, ROOM)).toEqual([
      [
        { startMin: 735, endMin: 900 },
        { startMin: 945, endMin: 1110 },
      ],
    ])
  })

  test('nothing that has gone by: from now on today', () => {
    expect(gaps([at('a', '13:00', 60)], ROOM, 690)).toEqual([
      [
        { startMin: 690, endMin: 780 },
        { startMin: 840, endMin: 1110 },
      ],
    ])
  })

  test('a job running past closing leaves no gap after it', () => {
    expect(gaps([at('a', '09:00', 600)], ROOM)).toEqual([[]])
  })

  test('a doorstep job takes the one bay too, though it sits on the road', () => {
    const road = at('r', '12:00', 60, { bookingType: 'doorstep' })
    expect(gaps([road], ROOM)).toEqual([
      [
        { startMin: 540, endMin: 720 },
        { startMin: 780, endMin: 1110 },
      ],
    ])
    // With two bays the doorstep job leaves one free all day.
    expect(gaps([road], { ...ROOM, bays: 2 })).toEqual([
      [{ startMin: 540, endMin: 1110 }],
      [
        { startMin: 540, endMin: 720 },
        { startMin: 780, endMin: 1110 },
      ],
    ])
  })

  test('a lane added for overlapping jobs offers nothing, and one bay is offered once', () => {
    const list = [at('a', '10:00', 60), at('b', '10:00', 60)]
    expect(gaps(list, ROOM)).toEqual([
      [
        { startMin: 540, endMin: 600 },
        { startMin: 660, endMin: 1110 },
      ],
      [],
    ])
    // Two bays, one job: the second lane only gets what the first left over.
    expect(gaps([at('a', '10:00', 60)], { ...ROOM, bays: 2 })).toEqual([
      [
        { startMin: 540, endMin: 600 },
        { startMin: 660, endMin: 1110 },
      ],
      [{ startMin: 540, endMin: 1110 }],
    ])
  })

  test('a booking the calendar leaves out still holds its slot', () => {
    // Waiting on the customer to pick a suggested time: not drawn, still held.
    const waiting = at('w', '11:00', 60, {
      status: 'pending',
      timeProposal: { status: 'open' } as Booking['timeProposal'],
    })
    expect(calendarJobs([waiting], NOW).get(DAY)).toBeUndefined()
    expect(gaps([waiting], ROOM)).toEqual([
      [
        { startMin: 540, endMin: 660 },
        { startMin: 720, endMin: 1110 },
      ],
    ])
    // A done or cancelled job holds nothing.
    const done = at('d', '11:00', 60, { status: 'completed' })
    const gone = at('x', '13:00', 60, { status: 'cancelled' })
    expect(gaps([gone], ROOM)).toEqual([[{ startMin: 540, endMin: 1110 }]])
    // The done card still sits in the lane, so the box goes around it.
    expect(gaps([done], ROOM)).toEqual([
      [
        { startMin: 540, endMin: 660 },
        { startMin: 720, endMin: 1110 },
      ],
    ])
  })

  test('a job from the night before running past midnight holds the morning', () => {
    const late = job({
      id: 'n',
      scheduledAtIso: istAt('2026-11-11', '23:00'),
      durationMins: 660,
    })
    expect(gaps([late], ROOM)).toEqual([[{ startMin: 600, endMin: 1110 }]])
  })

  test('none on a day that takes no new booking: paused, or the cap reached', () => {
    const list = [at('a', '10:00', 60), at('b', '14:00', 60)]
    expect(gaps(list, { ...ROOM, paused: true })).toEqual([[]])
    expect(gaps(list, { ...ROOM, bays: 2, jobsPerDay: 2 })).toEqual([[], []])
    expect(gaps(list, { ...ROOM, jobsPerDay: 3 })[0]).toHaveLength(3)
  })
})

describe('roomByMinute', () => {
  test('bays less the jobs running, minute by minute', () => {
    const left = roomByMinute(
      [
        job({ scheduledAtIso: istAt(TODAY, '10:00'), durationMins: 60 }),
        job({
          id: 'b2',
          scheduledAtIso: istAt(TODAY, '10:30'),
          durationMins: 60,
          bookingType: 'pickup',
        }),
      ],
      TODAY,
      { bays: 2, jobsPerDay: null, paused: false }
    )!
    expect(left[599]).toBe(2)
    expect(left[600]).toBe(1)
    expect(left[630]).toBe(0)
    expect(left[660]).toBe(1)
    expect(left[690]).toBe(2)
  })
})

describe('words and names', () => {
  test('a waiting block counts down only inside the answer window', () => {
    const deadline = (inMins: number) => ({
      respondBy: new Date(NOW + inMins * MIN).toISOString(),
      enforced: true,
      windowMins: 30,
    })
    expect(
      answerLine(job({ status: 'pending', responseDeadline: deadline(9) }), NOW)
    ).toBe('Answer · 9 min')
    expect(
      answerLine(
        job({ status: 'pending', responseDeadline: deadline(180) }),
        NOW
      )
    ).toBe('To answer')
    expect(answerLine(job({ status: 'pending' }), NOW)).toBe('To answer')
  })

  test('day buttons say the date, today, closed, the jobs and those to answer', () => {
    const summary = { total: 4, answer: 1, accepted: 3, done: 0 }
    expect(
      dayButtonLabel('2026-11-12', { today: TODAY, summary, closed: false })
    ).toBe('12 November, 4 jobs, 1 to answer')
    expect(
      dayButtonLabel(TODAY, {
        today: TODAY,
        summary: { total: 6, answer: 0, accepted: 6, done: 0 },
        closed: false,
        long: true,
      })
    ).toBe('Tuesday 10 November, today, 6 jobs')
    expect(
      dayButtonLabel('2026-11-15', {
        today: TODAY,
        summary: daySummary([]),
        closed: true,
        long: true,
      })
    ).toBe('Sunday 15 November, closed')
  })

  test('a block’s name has who, when and its state', () => {
    const block = placed('a', 840, 1020)
    expect(blockLabel(block, NOW)).toBe(
      'Arun Mohan, 2:00 pm to 5:00 pm, Accepted'
    )
  })

  test('the week strip’s line under each day', () => {
    const s = (total: number, answer = 0, accepted = 0, done = 0) => ({
      total,
      answer,
      accepted,
      done,
    })
    expect(stripNote('2026-11-09', TODAY, s(3, 0, 0, 3), false)).toEqual({
      kind: 'done',
      count: 3,
    })
    expect(stripNote(TODAY, TODAY, s(6, 1, 3, 2), false)).toEqual({
      kind: 'today',
      count: 6,
    })
    expect(stripNote('2026-11-11', TODAY, s(5, 2, 3), false)).toEqual({
      kind: 'count',
      count: 5,
      tone: 'answer',
    })
    expect(stripNote('2026-11-13', TODAY, s(2, 0, 2), false)).toEqual({
      kind: 'count',
      count: 2,
      tone: 'accepted',
    })
    expect(stripNote('2026-11-15', TODAY, s(0), true)).toEqual({
      kind: 'closed',
    })
    expect(stripNote('2026-11-16', TODAY, s(0), false)).toBeNull()
  })

  test('the remembered view is Month unless it says Day', () => {
    expect(calendarViewFrom('day')).toBe('day')
    expect(calendarViewFrom('month')).toBe('month')
    expect(calendarViewFrom(null)).toBe('month')
    expect(calendarViewFrom('nonsense')).toBe('month')
  })
})
