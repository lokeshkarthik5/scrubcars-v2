import { describe, expect, test } from 'bun:test'
import { FAKE_GARAGE_READING, calmCapitals, importFromReading, parseReading, type GarageReading } from './vision.js'

// The AI's reading of a poster, turned into a draft by the same rules as a
// Tally answer. The model only copies; these decide.

/** The fake poster with changes, so each test says only what it is about. */
const reading = (change: Partial<GarageReading> = {}): GarageReading => ({
  ...structuredClone(FAKE_GARAGE_READING),
  ...change,
})

describe('parseReading', () => {
  test('a well-formed answer is a reading', () => {
    expect(parseReading(JSON.stringify(FAKE_GARAGE_READING))).toEqual(FAKE_GARAGE_READING)
  })

  test('anything else is not: not JSON, cut off, the wrong shape, empty', () => {
    expect(parseReading('')).toBeNull()
    expect(parseReading('Sorry, I can’t help with that.')).toBeNull()
    expect(parseReading(JSON.stringify(FAKE_GARAGE_READING).slice(0, 200))).toBeNull()
    expect(parseReading(JSON.stringify({ ...FAKE_GARAGE_READING, services: 'Foam wash 399' }))).toBeNull()
  })
})

describe('calmCapitals', () => {
  test('a shouted name in normal case, initials kept', () => {
    expect(calmCapitals('SKT CAR WASH AND POLISH')).toBe('SKT Car Wash and Polish')
    expect(calmCapitals('THE AUTO SPA')).toBe('The Auto Spa')
    // The garage's own spelling is left alone.
    expect(calmCapitals('GoBumpr Car Care')).toBe('GoBumpr Car Care')
  })
})

describe('importFromReading: the fake poster', () => {
  const { draft, fields } = importFromReading(FAKE_GARAGE_READING)

  test('what the poster says is filled in', () => {
    expect(draft).toMatchObject({
      businessName: 'SKT Car Wash and Polish',
      phone: '9000009101',
      whatsapp: '9000009101',
      yearsInOperation: 'Since 2016',
      address: '14, Main Road, near Bus Stand',
      city: 'Chennai',
      dropinEnabled: true,
      doorstepEnabled: null,
    })
    expect(draft.workingHours?.map((d) => d.isClosed)).toEqual([true, false, false, false, false, false, false])
    expect(fields.workingHours).toEqual({ confidence: 'sure' })
  })

  test('the owner phone is copied from the poster and always to check', () => {
    expect(draft.ownerPhone).toBe('9000009101')
    expect(fields.ownerPhone).toEqual({
      confidence: 'check',
      reason: "Copied from the garage's number. The owner signs in to Detlio with it.",
    })
  })

  test('what it does not say is missing', () => {
    expect(draft.ownerName).toBeNull()
    expect(fields.ownerName).toEqual({ confidence: 'missing' })
    expect(fields.pincode).toEqual({ confidence: 'missing' })
    expect(fields.email).toEqual({ confidence: 'missing' })
  })

  test('services: the reader\'s notes, the rules\' verdicts, no times guessed', () => {
    expect(draft.services.map((s) => [s.name, s.category, s.pricingType, s.price, s.durationMins])).toEqual([
      ['Foam wash', 'car_wash', 'flat', 399, null],
      ['Full wash', 'car_wash', 'flat', 799, null],
      ['Interior cleaning', 'detailing', 'on_inspection', null, null],
    ])
    expect(fields['services.0.price']).toEqual({ confidence: 'sure' })
    expect(fields['services.1.price']).toEqual({
      confidence: 'check',
      reason: 'The poster shows ₹999 crossed out. We used the offer price.',
    })
    expect(fields['services.2.category']).toEqual({ confidence: 'check', reason: 'Could be Car wash or Detailing.' })
    expect(fields['services.2.price']).toEqual({
      confidence: 'missing',
      reason: 'Says “Call”, so we set On inspection. Ask the garage for its fee.',
    })
    expect(fields['services.0.durationMins']).toEqual({ confidence: 'missing' })
  })
})

describe('importFromReading: the rules', () => {
  test('days the document leaves out are closed, and said', () => {
    const { draft, fields } = importFromReading(
      reading({ hours: { days: [{ dayOfWeek: 1, open: '9:00', close: '18:30', closed: false }], note: null } })
    )
    expect(draft.workingHours?.[1]).toEqual({ dayOfWeek: 1, openTime: '09:00', closeTime: '18:30', isClosed: false })
    expect(draft.workingHours?.filter((d) => d.isClosed)).toHaveLength(6)
    expect(fields.workingHours).toEqual({
      confidence: 'check',
      reason: 'Sun, Tue, Wed, Thu, Fri, Sat not on the document, so set as closed.',
    })
  })

  test('both numbers given: the owner\'s is still to check, a landline said', () => {
    const { draft, fields } = importFromReading(
      reading({
        ownerPhone: { value: '+91 99400 11223', note: null },
        businessPhone: { value: '044-2345 6789', note: null },
      })
    )
    expect([draft.ownerPhone, draft.phone]).toEqual(['9940011223', '4423456789'])
    expect(fields.ownerPhone).toEqual({
      confidence: 'check',
      reason: "The owner signs in to Detlio with it. Make sure it is the owner's mobile.",
    })
    expect(fields.phone).toEqual({ confidence: 'check', reason: 'Looks like a landline.' })
  })

  test('a pincode that is not 6 digits is left to fill in, saying what was read', () => {
    const { draft, fields } = importFromReading(reading({ pincode: { value: '6000 1', note: null } }))
    expect(draft.pincode).toBeNull()
    expect(fields.pincode).toEqual({ confidence: 'missing', reason: 'Couldn\'t read a 6-digit pincode in “60001”.' })
    expect(importFromReading(reading({ pincode: { value: '600 017', note: null } })).draft.pincode).toBe('600017')
  })

  test('car types Detlio does not book are named, and a combo is said', () => {
    const { draft, fields } = importFromReading(
      reading({
        vehicleTypes: { value: ['Hatchback', 'Sedan', 'Luxury'], note: null },
        services: [
          {
            name: 'Wash + Polish combo',
            category: 'detailing',
            price: 'Small 499 Medium 599 Large 699 7-seater 799',
            duration: '2 hrs',
            description: null,
            notes: { name: null, category: null, price: null, duration: null },
          },
        ],
      })
    )
    expect(draft.vehicleTypes).toEqual(['Hatchback', 'Sedan'])
    expect(fields.vehicleTypes.reason).toBe('Also listed: Luxury. Detlio books hatchbacks, sedans and SUVs only.')
    expect(draft.services[0]).toMatchObject({
      pricingType: 'per_vehicle',
      priceHatchback: 499,
      priceSedan: 599,
      priceSuv: 699,
      durationMins: 120,
      description: 'Prices: Small 499 Medium 599 Large 699 7-seater 799',
    })
    expect(fields['services.0.price'].confidence).toBe('check')
    expect(fields['services.0.name'].reason).toContain('Looks like a combo')
  })

  test('a service with no category is guessed from its name, to check', () => {
    const { draft, fields } = importFromReading(
      reading({
        services: [
          {
            name: 'Ceramic coating',
            category: null,
            price: 'from ₹12,000',
            duration: null,
            description: null,
            notes: { name: null, category: null, price: null, duration: null },
          },
        ],
      })
    )
    expect(draft.services[0]).toMatchObject({ category: 'coating', price: 12000 })
    expect(fields['services.0.category']).toEqual({ confidence: 'sure' })
    expect(fields['services.0.price'].reason).toContain('bigger cars may cost more')
  })
})
