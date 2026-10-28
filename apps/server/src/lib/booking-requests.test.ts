import { describe, expect, test } from 'bun:test'
import {
  acceptRefusal,
  beyondLine,
  checkoutMatchRefusal,
  clockStep,
  confirmByFor,
  firstGarageRefusal,
  isTravelFee,
  linesForCategories,
  linesForPicks,
  linesSubtotal,
  needsNoReplyAlert,
  openLimitReached,
  pickableDays,
  pickNextGarage,
  quickWindows,
  REQUEST_RULES,
  requestStartTimes,
  respondByFor,
  startsInWindow,
  windowBounds,
  windowLabel,
  windowOpen,
  windowShapeProblem,
  type GarageDay,
  type RequestCandidate,
  type RequestService,
} from './booking-requests.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)
const NOW = IST('2026-10-29T10:00:00')
const OPEN_DAY: GarageDay = {
  closed: false,
  hours: { openTime: '08:00:00', closeTime: '19:00:00', isClosed: false },
  intervalMins: 30,
}

describe('windows', () => {
  test('a window is a part of an IST day: 9–12, 2–5, 5–8 pm', () => {
    expect(windowBounds({ date: '2026-10-30', part: 'morning' })).toEqual({
      start: IST('2026-10-30T09:00:00'),
      end: IST('2026-10-30T12:00:00'),
    })
    expect(windowBounds({ date: '2026-10-29', part: 'evening' }).end).toEqual(IST('2026-10-29T20:00:00'))
  })

  test('labels say today, tomorrow, or the day', () => {
    expect(windowLabel({ date: '2026-10-29', part: 'evening' }, NOW)).toBe('Today 5–8 pm')
    expect(windowLabel({ date: '2026-10-30', part: 'morning' }, NOW)).toBe('Tomorrow 9–12')
    expect(windowLabel({ date: '2026-10-30', part: 'afternoon' }, NOW)).toBe('Tomorrow 2–5')
    expect(windowLabel({ date: '2026-11-02', part: 'morning' }, NOW)).toBe('Mon 2 Nov, 9–12')
  })

  test('the quick choices: today evening, tomorrow morning and afternoon; pick a day covers 14 days', () => {
    expect(quickWindows(NOW)).toEqual([
      { date: '2026-10-29', part: 'evening' },
      { date: '2026-10-30', part: 'morning' },
      { date: '2026-10-30', part: 'afternoon' },
    ])
    const days = pickableDays(NOW)
    expect(days).toHaveLength(14)
    expect(days[0]).toBe('2026-10-29')
    expect(days[13]).toBe('2026-11-11')
  })

  test('a window sent must be one the app offers', () => {
    expect(windowShapeProblem({ date: '2026-10-30', part: 'morning' }, NOW)).toBeNull()
    expect(windowShapeProblem({ date: '2026-11-20', part: 'morning' }, NOW)).toMatch(/two weeks/)
    expect(windowShapeProblem({ date: '2026-10-30', part: 'evening' }, NOW)).toMatch(/today/)
  })

  test('starts in a window follow the garage’s hours, interval and the job’s length', () => {
    const starts = startsInWindow({ date: '2026-10-30', part: 'afternoon' }, OPEN_DAY, 90, NOW)
    expect(starts[0]).toEqual(IST('2026-10-30T14:00:00'))
    // 90 minutes must end by 19:00 and start before 17:00.
    expect(starts[starts.length - 1]).toEqual(IST('2026-10-30T16:30:00'))
    // The evening runs past closing: a 90-minute job can start until 17:30.
    expect(startsInWindow({ date: '2026-10-30', part: 'evening' }, OPEN_DAY, 90, NOW).map((d) => d.getTime())).toEqual([
      IST('2026-10-30T17:00:00').getTime(),
      IST('2026-10-30T17:30:00').getTime(),
    ])
  })

  test('closed, a holiday or paused: no window', () => {
    expect(windowOpen({ date: '2026-10-30', part: 'morning' }, { ...OPEN_DAY, closed: true }, 60, NOW)).toBe(false)
    expect(
      windowOpen({ date: '2026-10-30', part: 'morning' }, { ...OPEN_DAY, hours: { openTime: '08:00:00', closeTime: '19:00:00', isClosed: true } }, 60, NOW)
    ).toBe(false)
    expect(windowOpen({ date: '2026-10-30', part: 'morning' }, { ...OPEN_DAY, hours: null }, 60, NOW)).toBe(false)
  })

  test('a window needs a start two hours ahead: today evening at 3 pm yes, at 6:30 pm no', () => {
    const evening = { date: '2026-10-29', part: 'evening' as const }
    const late: GarageDay = { ...OPEN_DAY, hours: { openTime: '08:00:00', closeTime: '21:00:00', isClosed: false } }
    expect(windowOpen(evening, late, 60, IST('2026-10-29T15:00:00'))).toBe(true)
    expect(windowOpen(evening, late, 60, IST('2026-10-29T18:30:00'))).toBe(false)
  })
})

describe('clocks', () => {
  test('the garage has 2 hours, never later than an hour before the window’s last start', () => {
    expect(respondByFor(NOW, IST('2026-10-30T11:00:00'))).toEqual(IST('2026-10-29T12:00:00'))
    expect(respondByFor(NOW, IST('2026-10-29T12:30:00'))).toEqual(IST('2026-10-29T11:30:00'))
  })

  test('under 30 minutes to answer, or no start: no deadline (the window is gone)', () => {
    expect(respondByFor(NOW, IST('2026-10-29T11:20:00'))).toBeNull()
    expect(respondByFor(NOW, null)).toBeNull()
  })

  test('the customer has 2 hours to confirm a yes, never later than 30 minutes before the start', () => {
    expect(confirmByFor(NOW, IST('2026-10-30T09:00:00'))).toEqual(IST('2026-10-29T12:00:00'))
    expect(confirmByFor(NOW, IST('2026-10-29T11:00:00'))).toEqual(IST('2026-10-29T10:30:00'))
  })

  test('the team is told once after 30 minutes with no answer', () => {
    const created = IST('2026-10-29T09:29:00')
    expect(needsNoReplyAlert({ status: 'pending', createdAt: created, opsAlertedAt: null }, NOW)).toBe(true)
    expect(needsNoReplyAlert({ status: 'pending', createdAt: IST('2026-10-29T09:45:00'), opsAlertedAt: null }, NOW)).toBe(false)
    expect(needsNoReplyAlert({ status: 'pending', createdAt: created, opsAlertedAt: NOW }, NOW)).toBe(false)
    expect(needsNoReplyAlert({ status: 'accepted', createdAt: created, opsAlertedAt: null }, NOW)).toBe(false)
  })

  test('the cron: a waiting request past its deadline, a yes past its confirm-by', () => {
    expect(clockStep({ status: 'pending', respondBy: NOW, confirmBy: null }, NOW)).toBe('expire_waiting')
    expect(clockStep({ status: 'pending', respondBy: IST('2026-10-29T10:01:00'), confirmBy: null }, NOW)).toBeNull()
    expect(clockStep({ status: 'accepted', respondBy: NOW, confirmBy: IST('2026-10-29T09:59:00') }, NOW)).toBe('expire_accepted')
    expect(clockStep({ status: 'converted', respondBy: NOW, confirmBy: NOW }, NOW)).toBeNull()
  })
})

describe('the garage’s answer', () => {
  const window = { date: '2026-10-29', part: 'morning' as const }

  test('start times: inside the window, an hour ahead, where there is room', () => {
    const starts = requestStartTimes({ window, day: OPEN_DAY, durationMins: 30, busy: [], bays: 1, jobsPerDay: null, now: NOW })
    expect(starts[0]).toEqual(IST('2026-10-29T11:00:00'))
    expect(starts[starts.length - 1]).toEqual(IST('2026-10-29T11:30:00'))
    const full = requestStartTimes({
      window,
      day: OPEN_DAY,
      durationMins: 30,
      busy: [{ start: IST('2026-10-29T11:00:00'), durationMins: 30 }],
      bays: 1,
      jobsPerDay: null,
      now: NOW,
    })
    expect(full).toEqual([IST('2026-10-29T11:30:00')])
  })

  test('a yes needs a waiting request, time left, a fee of 0/100/200 and an offered start', () => {
    const base = { status: 'pending', respondBy: IST('2026-10-29T11:00:00'), travelFee: 100, startAt: IST('2026-10-29T11:30:00'), starts: [IST('2026-10-29T11:30:00')], now: NOW }
    expect(acceptRefusal(base)).toBeNull()
    expect(acceptRefusal({ ...base, status: 'forwarded' })).toBe('REQUEST_NOT_WAITING')
    expect(acceptRefusal({ ...base, respondBy: NOW })).toBe('REQUEST_TIME_PASSED')
    expect(acceptRefusal({ ...base, travelFee: 150 })).toBe('TRAVEL_FEE_INVALID')
    expect(acceptRefusal({ ...base, startAt: IST('2026-10-29T11:00:00') })).toBe('START_NOT_OFFERED')
  })

  test('travel fees are ₹0, ₹100 or ₹200 only', () => {
    expect(REQUEST_RULES.travelFees).toEqual([0, 100, 200])
    expect([0, 100, 200].every(isTravelFee)).toBe(true)
    expect(isTravelFee(50)).toBe(false)
    expect(isTravelFee('100')).toBe(false)
  })

  test('the garage’s card says how far past its reach the customer is', () => {
    expect(beyondLine(3.94, 5)).toBe('3.9 km beyond your 5 km')
    expect(beyondLine(2, null)).toBe('2 km beyond your area')
    expect(beyondLine(0, 5)).toBe('Inside your area')
  })
})

const LINE = { serviceId: 's1', name: 'Wash', category: 'car_wash', amount: '499.00', durationMins: 30 }
const candidate = (over: Partial<RequestCandidate>): RequestCandidate => ({
  vendorId: 'v',
  listed: true,
  offersMode: true,
  distanceKm: 9,
  outsideKm: 4,
  lines: [LINE],
  lastStart: IST('2026-10-30T11:00:00'),
  ...over,
})

describe('who can be asked', () => {
  test('the first garage must be just outside: not covering, within 15 km past its reach', () => {
    expect(firstGarageRefusal(candidate({}))).toBeNull()
    expect(firstGarageRefusal(candidate({ outsideKm: 0 }))).toBe('GARAGE_COVERS_YOU')
    expect(firstGarageRefusal(candidate({ outsideKm: 15 }))).toBeNull()
    expect(firstGarageRefusal(candidate({ outsideKm: 15.1 }))).toBe('TOO_FAR')
    expect(firstGarageRefusal(candidate({ listed: false }))).toBe('GARAGE_NOT_LISTED')
    expect(firstGarageRefusal(candidate({ offersMode: false }))).toBe('MODE_NOT_OFFERED')
    expect(firstGarageRefusal(candidate({ lines: null }))).toBe('SERVICES_NOT_OFFERED')
    expect(firstGarageRefusal(candidate({ lastStart: null }))).toBe('WINDOW_NOT_OPEN')
  })

  test('the next garage: the nearest eligible one not asked before', () => {
    const list = [
      candidate({ vendorId: 'far', distanceKm: 14 }),
      candidate({ vendorId: 'tried', distanceKm: 2 }),
      candidate({ vendorId: 'near', distanceKm: 6 }),
      candidate({ vendorId: 'no-services', distanceKm: 1, lines: null }),
      candidate({ vendorId: 'no-window', distanceKm: 1.5, lastStart: null }),
      candidate({ vendorId: 'too-far', distanceKm: 3, outsideKm: 16 }),
      // A garage that covers them can be passed a request too.
      candidate({ vendorId: 'covers', distanceKm: 7, outsideKm: -1 }),
    ]
    expect(pickNextGarage(list, new Set(['tried']), 1)?.vendorId).toBe('near')
    expect(pickNextGarage(list.filter((c) => c.vendorId !== 'near'), new Set(['tried']), 1)?.vendorId).toBe('covers')
  })

  test('at most two garages a request', () => {
    expect(pickNextGarage([candidate({ vendorId: 'x' })], new Set(), 2)).toBeNull()
    expect(REQUEST_RULES.maxGarages).toBe(2)
  })

  test('nobody left: null', () => {
    expect(pickNextGarage([], new Set(), 1)).toBeNull()
  })
})

const service = (over: Partial<RequestService>): RequestService => ({
  id: 'a',
  name: 'Foam wash',
  category: 'car_wash',
  durationMins: 30,
  isActive: true,
  pricingType: 'flat',
  price: '499.00',
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
  ...over,
})

describe('services', () => {
  test('the customer’s picks, priced for their car, in their order', () => {
    const services = [
      service({ id: 'a' }),
      service({ id: 'b', name: 'Interior', category: 'detailing', pricingType: 'per_vehicle', price: '1500.00', priceHatchback: '1500.00', priceSedan: '1800.00', priceSuv: '2200.00', durationMins: 90 }),
    ]
    const lines = linesForPicks(['b', 'a'], services, 'sedan')
    expect(lines?.map((l) => [l.serviceId, l.amount])).toEqual([
      ['b', '1800.00'],
      ['a', '499.00'],
    ])
    expect(linesSubtotal(lines!)).toBe('2299.00')
  })

  test('a pick that is hidden, missing or unpriced for the car: refused', () => {
    expect(linesForPicks(['a'], [service({ isActive: false })], 'sedan')).toBeNull()
    expect(linesForPicks(['z'], [service({})], 'sedan')).toBeNull()
    expect(linesForPicks(['a'], [service({ pricingType: 'per_vehicle', priceSuv: null })], 'suv')).toBeNull()
  })

  test('at the next garage: its cheapest active service of each kind asked for', () => {
    const theirs = [
      service({ id: 'w1', price: '599.00' }),
      service({ id: 'w2', price: '399.00' }),
      service({ id: 'w3', price: '199.00', isActive: false }),
      service({ id: 'd1', category: 'detailing', price: '2000.00' }),
    ]
    expect(linesForCategories(['car_wash', 'detailing', 'car_wash'], theirs, 'hatchback')?.map((l) => l.serviceId)).toEqual(['w2', 'd1'])
    expect(linesForCategories(['coating'], theirs, 'hatchback')).toBeNull()
  })
})

describe('the customer’s limits and the checkout', () => {
  test('two open requests at most', () => {
    expect(openLimitReached(1)).toBe(false)
    expect(openLimitReached(2)).toBe(true)
  })

  const request = {
    userId: 'u',
    vendorId: 'v',
    status: 'accepted',
    bookingType: 'doorstep',
    vehicleId: 'car',
    addressId: 'home',
    serviceIds: ['a', 'b'],
    acceptedStartAt: IST('2026-10-30T10:00:00'),
    confirmBy: IST('2026-10-29T12:00:00'),
  }
  const booking = {
    userId: 'u',
    vendorId: 'v',
    bookingType: 'doorstep',
    vehicleId: 'car',
    addressId: 'home',
    serviceIds: ['b', 'a'],
    scheduledAt: IST('2026-10-30T10:00:00'),
  }

  test('only the customer’s own accepted request, before its deadline, exactly as accepted', () => {
    expect(checkoutMatchRefusal(request, booking, NOW)).toBeNull()
    expect(checkoutMatchRefusal(request, { ...booking, userId: 'other' }, NOW)).toBe('REQUEST_NOT_FOUND')
    expect(checkoutMatchRefusal({ ...request, status: 'pending' }, booking, NOW)).toBe('REQUEST_NOT_ACCEPTED')
    expect(checkoutMatchRefusal(request, booking, IST('2026-10-29T12:00:00'))).toBe('REQUEST_EXPIRED')
    expect(checkoutMatchRefusal(request, { ...booking, scheduledAt: IST('2026-10-30T10:30:00') }, NOW)).toBe('REQUEST_MISMATCH')
    expect(checkoutMatchRefusal(request, { ...booking, serviceIds: ['a'] }, NOW)).toBe('REQUEST_MISMATCH')
    expect(checkoutMatchRefusal(request, { ...booking, addressId: 'office' }, NOW)).toBe('REQUEST_MISMATCH')
    expect(checkoutMatchRefusal(request, { ...booking, vendorId: 'w' }, NOW)).toBe('REQUEST_MISMATCH')
    expect(checkoutMatchRefusal(request, { ...booking, bookingType: 'pickup' }, NOW)).toBe('REQUEST_MISMATCH')
  })
})
