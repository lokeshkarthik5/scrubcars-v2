import { describe, expect, test } from 'bun:test'
import {
  bookAgainPath,
  bookAgainPathFor,
  canBookAgain,
  matchSavedAddress,
  pickRequestedServices,
  unofferedMode,
  withdrawnPathFor,
} from './book-again'
import type { BookingItem } from './types'

const GARAGE = 'e2e00000-0000-4000-8000-000000000301'

const item = (serviceId: string, name = serviceId): BookingItem => ({
  id: `item-${serviceId}`,
  serviceId,
  name,
  amount: 499,
  durationMins: 30,
})

describe('canBookAgain', () => {
  test('once the booking is over', () => {
    expect(canBookAgain({ status: 'completed', moved: false })).toBe(true)
    expect(canBookAgain({ status: 'cancelled', moved: false })).toBe(true)
  })

  test('not while it is still on, nor on the old half of a move', () => {
    for (const status of ['pending', 'confirmed', 'in_progress'] as const) {
      expect(canBookAgain({ status, moved: false })).toBe(false)
    }
    expect(canBookAgain({ status: 'cancelled', moved: true })).toBe(false)
    expect(canBookAgain({ status: 'rescheduled', moved: false })).toBe(false)
  })
})

describe('bookAgainPath', () => {
  test('the same services, in order, at checkout', () => {
    expect(
      bookAgainPath({ vendorId: GARAGE, bookingType: 'dropin', items: [item('s2'), item('s1')] })
    ).toBe(`/book/${GARAGE}?service=s2,s1`)
  })

  test('carries doorstep; at the garage is the default and needs no mode', () => {
    expect(
      bookAgainPath({ vendorId: GARAGE, bookingType: 'doorstep', items: [item('s1')] })
    ).toBe(`/book/${GARAGE}?service=s1&mode=doorstep`)
  })

  test('a service on the booking twice is asked for once', () => {
    expect(
      bookAgainPath({ vendorId: GARAGE, bookingType: 'dropin', items: [item('s1'), item('s1')] })
    ).toBe(`/book/${GARAGE}?service=s1`)
  })

  test('with no service ids it opens the garage page to pick from', () => {
    expect(bookAgainPath({ vendorId: GARAGE, bookingType: 'dropin', items: [] })).toBe(
      `/garage/${GARAGE}`
    )
    expect(
      bookAgainPath({ vendorId: GARAGE, bookingType: 'doorstep', items: [item('')] })
    ).toBe(`/garage/${GARAGE}?mode=doorstep`)
  })
})

describe('bookAgainPathFor', () => {
  // Home's Book again tile has the last job's ids, not a booking.
  test('the same link from bare ids as from the booking', () => {
    expect(
      bookAgainPathFor({ vendorId: GARAGE, bookingType: 'doorstep', serviceIds: ['s2', 's1', 's2'] })
    ).toBe(
      bookAgainPath({ vendorId: GARAGE, bookingType: 'doorstep', items: [item('s2'), item('s1')] })
    )
    expect(bookAgainPathFor({ vendorId: GARAGE, bookingType: 'dropin', serviceIds: [] })).toBe(
      `/garage/${GARAGE}`
    )
  })
})

describe('pickup & drop', () => {
  test('Book again keeps the mode and the address', () => {
    expect(
      bookAgainPath({ vendorId: GARAGE, bookingType: 'pickup', items: [item('s1')] }, 'addr-1')
    ).toBe(`/book/${GARAGE}?service=s1&mode=pickup&address=addr-1`)
    expect(withdrawnPathFor({ vendorId: GARAGE, bookingType: 'pickup' })).toBe(
      `/garage/${GARAGE}?withdrawn=1&mode=pickup`
    )
  })

  test('without a saved address to match, checkout picks the default', () => {
    expect(
      bookAgainPath({ vendorId: GARAGE, bookingType: 'pickup', items: [item('s1')] }, null)
    ).toBe(`/book/${GARAGE}?service=s1&mode=pickup`)
  })

  test('an at-garage booking never carries an address', () => {
    expect(
      bookAgainPath({ vendorId: GARAGE, bookingType: 'dropin', items: [item('s1')] }, 'addr-1')
    ).toBe(`/book/${GARAGE}?service=s1`)
  })

  test('a garage that stopped collecting is said like one that stopped travelling', () => {
    expect(unofferedMode('pickup', { dropinEnabled: true, doorstepEnabled: false, pickupEnabled: false })).toBe(
      'pickup'
    )
    expect(unofferedMode('pickup', { dropinEnabled: true, doorstepEnabled: false })).toBe('pickup')
    expect(unofferedMode('pickup', { dropinEnabled: true, doorstepEnabled: false, pickupEnabled: true })).toBeNull()
  })
})

describe('matchSavedAddress', () => {
  const saved = [
    { id: 'home', address: '14, Gandhi Nagar, Adyar', lat: 13.0012, lng: 80.2565 },
    { id: 'office', address: 'Tidel Park, Taramani', lat: null, lng: null },
  ]

  test('by the pin the booking snapshotted', () => {
    expect(
      matchSavedAddress(
        { bookingType: 'pickup', jobLocation: { address: 'renamed since', lat: 13.0012, lng: 80.2565 } },
        saved
      )
    ).toBe('home')
  })

  test('by the text when the pin moved', () => {
    expect(
      matchSavedAddress(
        { bookingType: 'doorstep', jobLocation: { address: ' tidel park, taramani', lat: 12.9, lng: 80.2 } },
        saved
      )
    ).toBe('office')
  })

  test('none when the address is gone, and never for at the garage', () => {
    expect(
      matchSavedAddress({ bookingType: 'pickup', jobLocation: { address: 'Elsewhere', lat: 1, lng: 1 } }, saved)
    ).toBeNull()
    expect(matchSavedAddress({ bookingType: 'dropin', jobLocation: undefined }, saved)).toBeNull()
  })
})

describe('withdrawnPathFor', () => {
  // Home's tile when the garage sells none of the last job's services: the
  // garage page with its explanation, as checkout's own redirect builds it.
  test('the garage page, saying why, in the old mode', () => {
    expect(withdrawnPathFor({ vendorId: GARAGE, bookingType: 'dropin' })).toBe(`/garage/${GARAGE}?withdrawn=1`)
    expect(withdrawnPathFor({ vendorId: GARAGE, bookingType: 'doorstep' })).toBe(
      `/garage/${GARAGE}?withdrawn=1&mode=doorstep`
    )
  })
})

describe('pickRequestedServices', () => {
  const catalogue = [{ id: 'wash' }, { id: 'detail' }, { id: 'coat' }]

  test("keeps the customer's order, not the catalogue's", () => {
    const { requested, picked } = pickRequestedServices('coat,wash', catalogue)
    expect(requested).toEqual(['coat', 'wash'])
    expect(picked.map((s) => s.id)).toEqual(['coat', 'wash'])
  })

  test('a service no longer on sale is left out, and the gap shows', () => {
    const { requested, picked } = pickRequestedServices('wash,retired', catalogue)
    expect(requested).toHaveLength(2)
    expect(picked.map((s) => s.id)).toEqual(['wash'])
  })

  test('none left when nothing asked for is still sold', () => {
    expect(pickRequestedServices('retired', catalogue)).toEqual({
      requested: ['retired'],
      picked: [],
    })
  })

  test('no ids asked for at all is not the same as all of them gone', () => {
    expect(pickRequestedServices(null, catalogue)).toEqual({ requested: [], picked: [] })
    expect(pickRequestedServices(',,', catalogue)).toEqual({ requested: [], picked: [] })
  })

  test('an id given twice is one line', () => {
    expect(pickRequestedServices('wash,wash', catalogue).picked).toHaveLength(1)
  })
})

describe('unofferedMode', () => {
  const both = { dropinEnabled: true, doorstepEnabled: true }
  const garageOnly = { dropinEnabled: true, doorstepEnabled: false }
  const doorstepOnly = { dropinEnabled: false, doorstepEnabled: true }

  test('a doorstep booking at a garage that has stopped travelling', () => {
    expect(unofferedMode('doorstep', garageOnly)).toBe('doorstep')
  })

  test('an at-garage link to a garage that now only travels', () => {
    expect(unofferedMode('dropin', doorstepOnly)).toBe('dropin')
  })

  test('nothing to say when the garage still offers it', () => {
    expect(unofferedMode('doorstep', both)).toBeNull()
    expect(unofferedMode('doorstep', doorstepOnly)).toBeNull()
    expect(unofferedMode('dropin', garageOnly)).toBeNull()
  })

  test('nothing to say when no mode was asked for, or before the garage loads', () => {
    expect(unofferedMode(null, garageOnly)).toBeNull()
    expect(unofferedMode(null, doorstepOnly)).toBeNull()
    expect(unofferedMode('doorstep', null)).toBeNull()
  })
})
