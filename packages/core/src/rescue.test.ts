import { describe, expect, test } from 'bun:test'
import {
  garageDeclinedTitle,
  linkedCarId,
  quotedGarageReason,
  rescueDayLabel,
  rescueSubline,
  rescueTimePath,
  sameJobPrice,
  showsRescue,
  usualAnswerLabel,
} from './rescue'

const base = { status: 'cancelled' as const, notAcceptedInTime: false }

describe('showsRescue', () => {
  test('a garage that let them down: not in time, declined, called off, no-show', () => {
    expect(showsRescue({ ...base, notAcceptedInTime: true, cancelledBy: 'vendor' })).toBe(true)
    expect(showsRescue({ ...base, cancelledBy: 'vendor' })).toBe(true)
    expect(showsRescue({ ...base, cancelledBy: 'admin', noShow: 'garage' })).toBe(true)
    expect(showsRescue({ ...base, cancelledBy: 'admin', cancelledOnBehalfOf: 'garage' })).toBe(true)
  })

  test('never the customer’s own cancellation, or a booking still on', () => {
    expect(showsRescue({ ...base, cancelledBy: 'user' })).toBe(false)
    expect(showsRescue({ ...base, cancelledBy: 'admin', cancelledOnBehalfOf: 'customer' })).toBe(false)
    expect(showsRescue({ ...base, cancelledBy: 'admin', noShow: 'customer' })).toBe(false)
    expect(showsRescue({ status: 'confirmed', notAcceptedInTime: false })).toBe(false)
  })
})

describe('words', () => {
  test('the approved lines', () => {
    expect(garageDeclinedTitle('Velan Car Care')).toBe("Velan Car Care can't take this booking")
    expect(quotedGarageReason('No staff free for doorstep today.')).toBe('“No staff free for doorstep today.”')
    expect(quotedGarageReason('“Already quoted”')).toBe('“Already quoted”')
    expect(usualAnswerLabel(10)).toBe('Usually answers in 10 min')
    expect(usualAnswerLabel(null)).toBeNull()
    expect(sameJobPrice(649)).toBe('₹649')
  })

  test('the line under the heading says where, and the pay-again note only when something was paid', () => {
    expect(rescueSubline({ jobName: 'Interior + exterior wash', bookingType: 'dropin', paid: true })).toBe(
      'Interior + exterior wash · tap a time to book. You pay again as usual; your first payment is refunded.'
    )
    expect(rescueSubline({ jobName: 'Interior + exterior wash', bookingType: 'doorstep', paid: false })).toBe(
      'Interior + exterior wash, at your address · tap a time to book.'
    )
  })

  test('"Today, near 10:30 am" on the original day, the day alone otherwise', () => {
    const now = Date.parse('2026-11-15T03:00:00.000Z') // 8:30 am IST
    const times = ['2026-11-15T05:30:00.000Z']
    expect(rescueDayLabel({ free: { day: 'today', times }, near: '2026-11-15T05:00:00.000Z' }, now)).toBe(
      'Today, near 10:30 am'
    )
    expect(rescueDayLabel({ free: { day: 'tomorrow', times: ['2026-11-16T05:30:00.000Z'] }, near: null }, now)).toBe(
      'Tomorrow'
    )
  })
})

describe('rescueTimePath', () => {
  test('the same job, type, address and time at the other garage', () => {
    expect(
      rescueTimePath({
        vendorId: 'g2',
        bookingType: 'doorstep',
        serviceIds: ['s1', 's2'],
        addressId: 'a1',
        slot: '2026-11-15T05:30:00.000Z',
      })
    ).toBe('/book/g2?service=s1,s2&mode=doorstep&address=a1&slot=2026-11-15T05%3A30%3A00.000Z')
  })

  test('the booked car rides along, so checkout prices the car the card priced', () => {
    expect(
      rescueTimePath({
        vendorId: 'g2',
        bookingType: 'dropin',
        serviceIds: ['s1'],
        vehicleId: 'suv-1',
        slot: '2026-11-15T05:30:00.000Z',
      })
    ).toBe('/book/g2?service=s1&slot=2026-11-15T05%3A30%3A00.000Z&car=suv-1')
  })
})

describe('linkedCarId', () => {
  const cars = [
    { id: 'hatch', isDefault: true },
    { id: 'suv', isDefault: false },
  ]

  test("the link's car, while it is still one of the customer's", () => {
    expect(linkedCarId(cars, 'suv')).toBe('suv')
  })

  test('nothing when the link names none, or a car they no longer have', () => {
    expect(linkedCarId(cars, null)).toBeNull()
    expect(linkedCarId(cars, '')).toBeNull()
    expect(linkedCarId(cars, 'removed')).toBeNull()
    expect(linkedCarId([], 'suv')).toBeNull()
  })
})
