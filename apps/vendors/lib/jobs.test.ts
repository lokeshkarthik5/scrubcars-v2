import { describe, expect, test } from 'bun:test'
import type { Booking } from '@repo/core/types'
import {
  blockers,
  customerNumberLine,
  distanceKm,
  doneJobs,
  jobPrice,
  laterDays,
  listTabOf,
  nextStep,
  nextStepLabel,
  progressIndex,
  servicesLine,
  shortName,
  sortByUrgency,
  tabFromQuery,
  todayView,
  waitingSummary,
} from './jobs'

// Mon 19 Oct 2026, 10:12 am in India.
const NOW = Date.parse('2026-10-19T04:42:00Z')
const MIN = 60 * 1000
const HOUR = 60 * MIN
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

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
    scheduledAtIso: iso(2 * HOUR),
    customerName: 'Rahul Venkatesh',
    contactWindow: null,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    rescheduleCount: 0,
    remainingReschedules: 2,
    requestedAtIso: iso(-HOUR),
    paidAtBooking: 600,
    jobPhotos: [],
    photoStandard: null,
    customerBadge: null,
    conditionPhotos: null,
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

describe('tabFromQuery', () => {
  test('maps the old tab names from notifications onto the new lists', () => {
    expect(tabFromQuery('incoming')).toBe('new')
    expect(tabFromQuery('upcoming')).toBe('today')
    expect(tabFromQuery('completed')).toBe('done')
    expect(tabFromQuery('cancelled')).toBe('done')
    expect(tabFromQuery('later')).toBe('later')
    expect(tabFromQuery('nonsense')).toBeNull()
    expect(tabFromQuery(null)).toBeNull()
  })
})

describe('listTabOf', () => {
  test('sorts each job onto one list by India’s calendar', () => {
    expect(listTabOf(job({ status: 'pending' }), NOW)).toBe('new')
    expect(
      listTabOf(
        job({ status: 'in_progress', scheduledAtIso: iso(-30 * HOUR) }),
        NOW
      )
    ).toBe('today')
    expect(listTabOf(job({ scheduledAtIso: iso(2 * HOUR) }), NOW)).toBe('today')
    // Accepted yesterday and never started: still today's problem.
    expect(listTabOf(job({ scheduledAtIso: iso(-20 * HOUR) }), NOW)).toBe(
      'today'
    )
    // 11:30 pm tomorrow India time is 18:00 UTC: Later, though UTC calls it the same day.
    expect(
      listTabOf(job({ scheduledAtIso: '2026-10-20T18:00:00Z' }), NOW)
    ).toBe('later')
    expect(listTabOf(job({ status: 'completed' }), NOW)).toBe('done')
    expect(listTabOf(job({ status: 'cancelled' }), NOW)).toBe('done')
  })
})

describe('new bookings', () => {
  const deadline = (offsetMs: number) => ({
    respondBy: iso(offsetMs),
    enforced: true,
    windowMins: 30,
  })

  test('most urgent first; ones waiting on the customer go last', () => {
    const relaxed = job({
      id: 'relaxed',
      status: 'pending',
      responseDeadline: deadline(22 * MIN),
    })
    const urgent = job({
      id: 'urgent',
      status: 'pending',
      responseDeadline: deadline(4 * MIN),
    })
    const suggested = job({
      id: 'suggested',
      status: 'pending',
      responseDeadline: deadline(MIN),
      timeProposal: { status: 'open' } as Booking['timeProposal'],
    })
    expect(
      sortByUrgency([relaxed, suggested, urgent], NOW).map((b) => b.id)
    ).toEqual(['urgent', 'relaxed', 'suggested'])
    expect(waitingSummary([relaxed, suggested, urgent], NOW)).toEqual({
      count: 2,
      soonestMs: 4 * MIN,
    })
  })

  test('a booking already lost to the clock is not waiting for an answer', () => {
    const lost = job({ status: 'pending', responseDeadline: deadline(-MIN) })
    expect(waitingSummary([lost], NOW)).toEqual({ count: 0, soonestMs: null })
  })
})

describe('today and later', () => {
  test('working first, then the day in time order, with tomorrow folded', () => {
    const working = job({
      id: 'working',
      status: 'in_progress',
      startedAtIso: iso(-30 * MIN),
    })
    const two = job({ id: 'two', scheduledAtIso: iso(4 * HOUR) })
    const one = job({ id: 'one', scheduledAtIso: iso(HOUR) })
    const tomorrow = job({ id: 'tomorrow', scheduledAtIso: iso(24 * HOUR) })
    const view = todayView([two, tomorrow, working, one], NOW)
    expect(view.working.map((b) => b.id)).toEqual(['working'])
    expect(view.next.map((b) => b.id)).toEqual(['one', 'two'])
    expect(view.tomorrow).toBe(1)
    expect(laterDays([two, tomorrow, working, one], NOW)).toEqual([
      { day: 'Tomorrow', jobs: [tomorrow] },
    ])
  })

  test('done is the most recent first', () => {
    const old = job({
      id: 'old',
      status: 'completed',
      completedAtIso: iso(-48 * HOUR),
    })
    const recent = job({
      id: 'recent',
      status: 'cancelled',
      scheduledAtIso: iso(-HOUR),
    })
    expect(doneJobs([old, recent, job()]).map((b) => b.id)).toEqual([
      'recent',
      'old',
    ])
  })
})

describe('the card', () => {
  test('price is the services at their booked prices; a free redo is nothing', () => {
    const two = job({
      items: [
        { id: 'a', name: 'Foam wash', amount: 600, durationMins: 45 },
        { id: 'b', name: 'Interior vacuum', amount: 399, durationMins: 30 },
      ],
    } as Partial<Booking>)
    expect(jobPrice(two)).toBe(999)
    expect(servicesLine(two)).toBe('Foam wash + Interior vacuum')
    expect(jobPrice(job({ guaranteeRedo: true }))).toBe(0)
  })

  test('names fit a row', () => {
    expect(shortName('Rahul Venkatesh')).toBe('Rahul V.')
    expect(shortName('Priya')).toBe('Priya')
    expect(shortName(undefined)).toBe('Customer')
  })

  test('distance from the garage pin to the door, when both are pinned', () => {
    const doorstep = job({
      garage: { lat: 13.0067, lng: 80.2571 },
      jobLocation: { address: 'Besant Nagar', lat: 13.0002, lng: 80.2668 },
    })
    expect(distanceKm(doorstep)).toBe(1.3)
    expect(distanceKm(job())).toBeNull()
  })

  test('one quiet line says when the number shows', () => {
    const tomorrow = job({
      contactWindow: {
        opensAt: '2026-10-20T01:30:00Z',
        closesAt: null,
        open: false,
      },
    })
    expect(customerNumberLine(tomorrow, NOW)).toBe(
      "Customer's number shows from 7:00 am tomorrow"
    )
    const open = job({
      contactWindow: { opensAt: iso(-HOUR), closesAt: null, open: true },
    })
    expect(customerNumberLine(open, NOW)).toBeNull()
  })
})

describe('next step', () => {
  const standard = (
    overrides: Partial<NonNullable<Booking['photoStandard']>>
  ) =>
    ({
      required: true,
      waived: false,
      minimum: 2,
      before: { count: 0, canChange: true },
      after: { count: 0, canChange: true },
      startBlocked: null,
      finishBlocked: null,
      ...overrides,
    }) as Booking['photoStandard']

  test('photos the standard still wants come first', () => {
    const b = job({
      photoStandard: standard({
        startBlocked: { stage: 'before', missing: 2 },
      }),
    })
    const step = nextStep(b)!
    expect(nextStepLabel(step)).toBe('Before photos 0/2')
    expect(blockers(b, 'start')).toEqual(['Add 2 before photos to start.'])
  })

  test('then start, then complete', () => {
    expect(nextStepLabel(nextStep(job())!)).toBe('Start job')
    expect(nextStepLabel(nextStep(job({ status: 'in_progress' }))!)).toBe(
      'Complete job'
    )
    expect(blockers(job({ status: 'in_progress' }), 'complete')).toEqual([])
  })

  test('extra work waiting holds Complete', () => {
    const b = job({ status: 'in_progress', completeBlockedByExtraWork: true })
    expect(nextStep(b)).toEqual({
      kind: 'wait',
      text: 'Waiting for Rahul to answer the extra work',
    })
    expect(blockers(b, 'complete')).toEqual(['Rahul to answer the extra work'])
  })

  test('pickup & drop says its own next step', () => {
    const b = job({ bookingType: 'pickup', pickup: { nextStep: 'at_garage' } })
    expect(nextStepLabel(nextStep(b)!)).toBe('Next: At garage')
  })

  test('the progress line', () => {
    expect(progressIndex(job({ status: 'pending' }))).toBeNull()
    expect(progressIndex(job())).toBe(1)
    expect(progressIndex(job({ status: 'in_progress' }))).toBe(2)
    expect(progressIndex(job({ status: 'completed' }))).toBe(5)
  })
})
