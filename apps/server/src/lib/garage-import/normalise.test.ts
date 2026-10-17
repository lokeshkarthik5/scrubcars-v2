import { describe, expect, test } from 'bun:test'
import {
  guessCategory,
  mapVehicleTypes,
  normalisePhone,
  parseBookingTypes,
  parseDurationText,
  parseHoursText,
  parsePriceText,
  parseTimeRange,
} from './normalise.js'

// The rules every import goes through, whether a poster was read by the AI
// or a Tally answer was typed by the owner. The one rule over all of them:
// nothing the document does not say is filled in.

describe('normalisePhone', () => {
  test('every way an Indian mobile is written becomes the same 10 digits', () => {
    for (const written of ['98765 43210', '+91 98765 43210', '+91-9876543210', '098765-43210', '919876543210', '(+91) 98765 43210']) {
      expect(normalisePhone(written)).toEqual({ phone: '9876543210', mobile: true })
    }
  })

  test('a landline with its STD code is 10 digits, and not a mobile', () => {
    expect(normalisePhone('044 2345 6789')).toEqual({ phone: '4423456789', mobile: false })
  })

  test('several numbers give the first; nothing readable gives null', () => {
    expect(normalisePhone('98765 43210 / 044 2345 6789').phone).toBe('9876543210')
    expect(normalisePhone('9876 5432')).toEqual({ phone: null, mobile: false })
    expect(normalisePhone('')).toEqual({ phone: null, mobile: false })
    expect(normalisePhone(null)).toEqual({ phone: null, mobile: false })
  })
})

describe('parsePriceText', () => {
  test('one amount is that price, however it is written', () => {
    for (const written of ['399', '₹399', 'Rs. 399/-', 'Rs 399', 'INR 399']) {
      expect(parsePriceText(written)).toMatchObject({ pricingType: 'flat', price: 399, confidence: 'sure' })
    }
    expect(parsePriceText('₹1,299').price).toBe(1299)
  })

  test('nothing is a price to fill in, never a guess', () => {
    expect(parsePriceText(null)).toMatchObject({ pricingType: 'flat', price: null, confidence: 'missing' })
    expect(parsePriceText('  ')).toMatchObject({ price: null, confidence: 'missing' })
    expect(parsePriceText('best rates')).toMatchObject({ price: null, confidence: 'missing' })
  })

  test('"Call" and "on inspection" are On inspection with the fee left to fill in', () => {
    for (const written of ['Call', 'CALL', 'On inspection', 'Price on inspection', 'Call 98765 43210', 'Varies']) {
      const parsed = parsePriceText(written)
      expect(parsed).toMatchObject({ pricingType: 'on_inspection', price: null, confidence: 'missing' })
      expect(parsed.reason).toContain('Ask the garage for its fee')
    }
    expect(parsePriceText('Call').reason).toBe('Says “Call”, so we set On inspection. Ask the garage for its fee.')
  })

  test('an inspection with an amount takes it as the fee, to check', () => {
    expect(parsePriceText('Inspection ₹199')).toMatchObject({
      pricingType: 'on_inspection',
      price: 199,
      confidence: 'check',
    })
  })

  test('"from ₹X" is X, to check', () => {
    for (const written of ['from ₹2,499', 'Starting 2499', '₹2499 onwards', '2499+']) {
      const parsed = parsePriceText(written)
      expect(parsed).toMatchObject({ pricingType: 'flat', price: 2499, confidence: 'check' })
      expect(parsed.reason).toContain('bigger cars may cost more')
    }
  })

  test('car sizes are priced by car type', () => {
    expect(parsePriceText('Hatch 299 / Sedan 349 / SUV 399')).toMatchObject({
      pricingType: 'per_vehicle',
      priceHatchback: 299,
      priceSedan: 349,
      priceSuv: 399,
      confidence: 'sure',
      keepInDescription: false,
    })
    expect(parsePriceText('Small: ₹299, Medium: ₹349, Large: ₹399')).toMatchObject({
      priceHatchback: 299,
      priceSedan: 349,
      priceSuv: 399,
    })
    expect(parsePriceText('299 (hatchback) 399 (SUV/MUV)')).toMatchObject({
      pricingType: 'per_vehicle',
      priceHatchback: 299,
      priceSedan: null,
      priceSuv: 399,
      confidence: 'missing',
      reason: 'No sedan price given.',
    })
  })

  test('more than three sizes keeps the text in the description, to check', () => {
    const parsed = parsePriceText('Hatch 299 Sedan 349 SUV 399 Luxury 599')
    expect(parsed).toMatchObject({
      pricingType: 'per_vehicle',
      priceHatchback: 299,
      priceSedan: 349,
      priceSuv: 399,
      confidence: 'check',
      keepInDescription: true,
    })
    expect(parsed.reason).toContain('4 car sizes and Detlio has 3')
  })

  test('unlabelled amounts: three are the three sizes, two the lower, four kept as text — all to check', () => {
    expect(parsePriceText('299/349/399')).toMatchObject({
      pricingType: 'per_vehicle',
      priceHatchback: 299,
      priceSedan: 349,
      priceSuv: 399,
      confidence: 'check',
    })
    expect(parsePriceText('₹999 ₹799')).toMatchObject({ pricingType: 'flat', price: 799, confidence: 'check' })
    expect(parsePriceText('299 349 399 499')).toMatchObject({
      price: 299,
      confidence: 'check',
      keepInDescription: true,
    })
  })
})

describe('parseDurationText', () => {
  test('times as minutes', () => {
    expect(parseDurationText('45 min').mins).toBe(45)
    expect(parseDurationText('45 mins').mins).toBe(45)
    expect(parseDurationText('1 hr').mins).toBe(60)
    expect(parseDurationText('1.5 hours').mins).toBe(90)
    expect(parseDurationText('1 hr 30 min').mins).toBe(90)
    expect(parseDurationText('2 days').mins).toBe(2880)
  })

  test('a range takes the longer end, to check', () => {
    expect(parseDurationText('45-60 min')).toEqual({
      mins: 60,
      reason: 'Given as “45-60 min”; we used the longer time.',
    })
  })

  test('no time is never guessed', () => {
    expect(parseDurationText(null).mins).toBeNull()
    expect(parseDurationText('').mins).toBeNull()
    expect(parseDurationText('90').mins).toBeNull()
    expect(parseDurationText('quick').mins).toBeNull()
  })
})

describe('hours', () => {
  test('a time range in either clock', () => {
    expect(parseTimeRange('9 am - 8 pm')).toEqual({ openTime: '09:00', closeTime: '20:00', assumed: false })
    expect(parseTimeRange('09:00 to 21:00')).toEqual({ openTime: '09:00', closeTime: '21:00', assumed: false })
    expect(parseTimeRange('9:30am–7:30pm')).toEqual({ openTime: '09:30', closeTime: '19:30', assumed: false })
    // No am/pm on the close: an evening close is assumed, and said.
    expect(parseTimeRange('9-8')).toEqual({ openTime: '09:00', closeTime: '20:00', assumed: true })
  })

  test('one time for every day', () => {
    const { days, reason } = parseHoursText('9am - 8pm')
    expect(reason).toBeUndefined()
    expect(days?.every((d) => !d.isClosed && d.openTime === '09:00' && d.closeTime === '20:00')).toBe(true)
  })

  test('days named, a closed day, and a short Sunday', () => {
    const { days } = parseHoursText('Mon-Sat 9am-8pm, Sunday 9am-1pm')
    expect(days?.[0]).toEqual({ dayOfWeek: 0, openTime: '09:00', closeTime: '13:00', isClosed: false })
    expect(days?.[3]).toEqual({ dayOfWeek: 3, openTime: '09:00', closeTime: '20:00', isClosed: false })

    const closed = parseHoursText('9 am to 7:30 pm, Sunday holiday')
    expect(closed.days?.[0].isClosed).toBe(true)
    expect(closed.days?.[6]).toEqual({ dayOfWeek: 6, openTime: '09:00', closeTime: '19:30', isClosed: false })
  })

  test('working days with a time: the days left out are closed, and said', () => {
    const { days, reason } = parseHoursText('Monday to Saturday; 9am-8pm')
    expect(days?.filter((d) => !d.isClosed).map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6])
    expect(reason).toBe('Sun not mentioned, so set as closed.')
  })

  test('hours with no time in them are not read', () => {
    expect(parseHoursText('morning to night')).toEqual({
      days: null,
      reason: 'Couldn\'t read the hours in “morning to night”.',
    })
    expect(parseHoursText('').days).toBeNull()
  })
})

describe('car types, booking types, categories', () => {
  test('car types become the three Detlio books; others are named', () => {
    expect(mapVehicleTypes(['Hatchback, Sedan, SUV'])).toEqual({ types: ['Hatchback', 'Sedan', 'SUV / MUV'], others: [] })
    expect(mapVehicleTypes(['small cars', '7 seater', 'Luxury'])).toEqual({
      types: ['Hatchback', 'SUV / MUV'],
      others: ['Luxury'],
    })
    expect(mapVehicleTypes(['All cars']).types).toEqual(['Hatchback', 'Sedan', 'SUV / MUV'])
  })

  test('how customers book, in the owner\'s words', () => {
    expect(parseBookingTypes('At our garage')).toEqual({ dropin: true, doorstep: false })
    expect(parseBookingTypes('Doorstep only')).toEqual({ dropin: false, doorstep: true })
    expect(parseBookingTypes('Both')).toEqual({ dropin: true, doorstep: true })
    expect(parseBookingTypes('Yes')).toBeNull()
  })

  test('a category from the name: one clear match, else to check', () => {
    expect(guessCategory('Foam wash')).toEqual({ category: 'car_wash' })
    expect(guessCategory('Ceramic coating')).toEqual({ category: 'coating' })
    expect(guessCategory('Interior cleaning')).toEqual({
      category: 'detailing',
      reason: 'Could be Detailing or Car wash.',
    })
    expect(guessCategory('Wheel alignment')).toEqual({
      category: 'others',
      reason: 'Category not clear from the name; set as Others.',
    })
  })
})
