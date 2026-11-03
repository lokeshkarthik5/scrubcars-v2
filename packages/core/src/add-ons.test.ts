import { describe, expect, test } from 'bun:test'
import {
  addOnCountLabel,
  addOnsAfterRemoving,
  addOnTimeLabel,
  jobSummary,
  onlyAddOns,
} from './add-ons'
import { bookAgainPath } from './book-again'
import { draftResumePath, parseBookingDraft } from './booking-draft'
import { formatServicePrice, resolveServiceAmount } from './pricing'

describe('add-on words', () => {
  test('time and count', () => {
    expect(addOnTimeLabel(10)).toBe('+10 min')
    expect(addOnTimeLabel(0)).toBe('No extra time')
    expect(addOnCountLabel(1)).toBe('1 add-on')
    expect(addOnCountLabel(3)).toBe('3 add-ons')
  })

  test('a job reads as its services, with the add-ons as a count', () => {
    const foam = { name: 'Foam wash' }
    const helmet = { name: 'Helmet wash', isAddon: true }
    const freshener = { name: 'Air freshener', isAddon: true }
    expect(jobSummary([foam])).toBe('Foam wash')
    expect(jobSummary([foam, helmet])).toBe('Foam wash + 1 add-on')
    expect(jobSummary([foam, helmet, freshener])).toBe('Foam wash + 2 add-ons')
    expect(jobSummary([foam, { name: 'Wax' }, helmet])).toBe(
      'Foam wash + 1 more + 1 add-on'
    )
  })
})

describe('checkout', () => {
  test('removing the last service takes the add-ons with it', () => {
    expect(addOnsAfterRemoving(['a', 'b'], 1)).toEqual(['a', 'b'])
    expect(addOnsAfterRemoving(['a', 'b'], 0)).toEqual([])
    expect(onlyAddOns([{ isAddon: true }])).toBe(true)
  })

  test('an add-on prices by the car, as a service does', () => {
    const oil = {
      pricingType: 'per_vehicle' as const,
      price: 899,
      priceHatchback: 899,
      priceSedan: 999,
      priceSuv: 1199,
    }
    expect(resolveServiceAmount(oil, 'suv')).toBe(1199)
    expect(formatServicePrice(oil, 'sedan')).toBe('₹999')
    expect(
      formatServicePrice({
        pricingType: 'flat',
        price: 99,
        priceHatchback: null,
        priceSedan: null,
        priceSuv: null,
      })
    ).toBe('₹99')
  })
})

describe('Book again', () => {
  test('repeats the services, not the add-ons', () => {
    const path = bookAgainPath({
      vendorId: 'v1',
      bookingType: 'dropin',
      items: [
        { serviceId: 'wash', name: 'Foam wash' },
        { serviceId: 'helmet', name: 'Helmet wash', isAddon: true },
      ],
    } as never)
    expect(path).toContain('service=wash')
    expect(path).not.toContain('helmet')
  })
})

describe('a booking draft', () => {
  test('carries the add-ons back into checkout', () => {
    expect(
      draftResumePath({
        vendorId: 'v1',
        serviceIds: ['s1'],
        addOnIds: ['a1', 'a2'],
        mode: 'dropin',
      })
    ).toBe('/book/v1?service=s1&addons=a1%2Ca2')
    expect(
      draftResumePath({ vendorId: 'v1', serviceIds: ['s1'], mode: 'dropin' })
    ).toBe('/book/v1?service=s1')
  })

  test('an older draft, with none, still reads', () => {
    const now = Date.now()
    const raw = JSON.stringify({
      vendorId: 'v1',
      vendorName: 'G',
      serviceIds: ['s1'],
      mode: 'dropin',
      slot: null,
      car: null,
      address: null,
      savedAt: now,
    })
    expect(parseBookingDraft(raw, now)?.addOnIds).toBeUndefined()
    const withThem = JSON.stringify({ ...JSON.parse(raw), addOnIds: ['a1'] })
    expect(parseBookingDraft(withThem, now)?.addOnIds).toEqual(['a1'])
  })
})
