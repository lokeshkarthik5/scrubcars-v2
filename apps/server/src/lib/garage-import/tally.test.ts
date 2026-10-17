import { describe, expect, test } from 'bun:test'
import { garagesFromTallyCsv, mapTallyHeaders, parseCsv, splitServiceLine } from './tally.js'

// The Tally import, from the file the owner downloads (Responses → Download
// → CSV). No AI: each column is mapped by its question's wording.

/** A file as Tally writes it: its own columns first, then the form's questions. */
const HEADER = [
  'Submission ID',
  'Respondent ID',
  'Submitted at',
  'Garage name',
  "Owner's name",
  "Owner's mobile number",
  'Garage phone number',
  'WhatsApp number',
  'Email address',
  'Garage address',
  'City',
  'Pincode',
  'Google Maps link',
  'Do you offer doorstep service?',
  'How far do you travel (km)?',
  'Working days',
  'Timings',
  'Which cars do you take? (car types)',
  'Services and prices',
  'Upload your logo',
]

const csvLine = (cells: string[]) =>
  cells.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')

const ROW_ONE = [
  'abc1',
  'r1',
  '2026-10-01 10:20:00',
  'SPARKLE AUTO SPA',
  'Ravi Kumar',
  '+91 98400 12345',
  '044 2345 6789',
  '98400 12345',
  'ravi@example.com',
  '12, Anna Salai',
  'Chennai',
  '600002',
  'maps.app.goo.gl/abc',
  'Both',
  '8 km',
  'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday',
  '9 am - 8 pm',
  'Hatchback, Sedan, SUV',
  'Foam wash - 399\nFull wash: Hatch 499 / Sedan 549 / SUV 649 (45 min)\nInterior cleaning – Call\nCeramic coating from ₹15,000 (2 days)',
  'https://storage.tally.so/logo.png',
]

const ROW_TWO = [
  'abc2',
  'r2',
  '2026-10-03 18:05:00',
  'Mani Car Care',
  'Mani',
  '9000000102',
  '',
  '',
  'not-an-email',
  'Velachery Main Road',
  'Chennai',
  '6000',
  '',
  'At our garage',
  '',
  '',
  'Mon-Sat 9-7, Sunday holiday',
  'All cars',
  'Body wash 299, Polish 999',
  '',
]

const FILE = [csvLine(HEADER), csvLine(ROW_ONE), csvLine(ROW_TWO)].join('\r\n')

describe('parseCsv', () => {
  test('quotes, doubled quotes, commas and line breaks inside a field', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ])
  })

  test('a byte-order mark, CRLF, and empty rows', () => {
    expect(parseCsv('﻿a,b\r\n\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('mapTallyHeaders', () => {
  test('each question to its field; Tally\'s own columns and unknown ones ignored', () => {
    expect(mapTallyHeaders(HEADER)).toEqual([
      null,
      null,
      'submittedAt',
      'businessName',
      'ownerName',
      'ownerPhone',
      'phone',
      'whatsapp',
      'email',
      'address',
      'city',
      'pincode',
      'mapsUrl',
      'bookingTypes',
      'doorstepKm',
      'hours',
      'hours',
      'vehicleTypes',
      'services',
      null,
    ])
  })

  test('a single "Mobile number" is the owner\'s, and "Name of your garage" the business', () => {
    expect(mapTallyHeaders(['Your name', 'Name of your garage', 'Mobile number', 'Alternate phone number'])).toEqual([
      'ownerName',
      'businessName',
      'ownerPhone',
      'phone',
    ])
  })
})

describe('splitServiceLine', () => {
  test('name, price and time, however the line is written', () => {
    expect(splitServiceLine('1. Foam wash - 399')).toEqual({ name: 'Foam wash', price: '399', duration: null })
    expect(splitServiceLine('Full wash: Hatch 499 / SUV 649 (45 min)')).toEqual({
      name: 'Full wash',
      price: 'Hatch 499 / SUV 649',
      duration: '45 min',
    })
    expect(splitServiceLine('• Interior cleaning – Call')).toEqual({
      name: 'Interior cleaning',
      price: 'Call',
      duration: null,
    })
    expect(splitServiceLine('Ceramic coating ₹15000')).toEqual({
      name: 'Ceramic coating',
      price: '₹15000',
      duration: null,
    })
    expect(splitServiceLine('Engine bay cleaning')).toEqual({
      name: 'Engine bay cleaning',
      price: null,
      duration: null,
    })
    expect(splitServiceLine('   ')).toBeNull()
  })
})

describe('garagesFromTallyCsv', () => {
  const garages = garagesFromTallyCsv(FILE)

  test('one garage per row, labelled for the pick list', () => {
    expect(garages.map((g) => g.label)).toEqual([
      { businessName: 'Sparkle Auto Spa', ownerName: 'Ravi Kumar', submittedAt: '2026-10-01 10:20:00' },
      { businessName: 'Mani Car Care', ownerName: 'Mani', submittedAt: '2026-10-03 18:05:00' },
    ])
  })

  test('a full row: every field read, phones to 10 digits, the landline said', () => {
    const { draft, fields } = garages[0].import
    expect(draft).toMatchObject({
      businessName: 'Sparkle Auto Spa',
      ownerName: 'Ravi Kumar',
      ownerPhone: '9840012345',
      phone: '4423456789',
      whatsapp: '9840012345',
      email: 'ravi@example.com',
      address: '12, Anna Salai',
      city: 'Chennai',
      pincode: '600002',
      mapsUrl: 'maps.app.goo.gl/abc',
      dropinEnabled: true,
      doorstepEnabled: true,
      doorstepRadiusKm: 8,
      vehicleTypes: ['Hatchback', 'Sedan', 'SUV / MUV'],
    })
    expect(fields.phone).toEqual({ confidence: 'check', reason: 'Looks like a landline.' })
    // The owner signs in with it: always to check.
    expect(fields.ownerPhone.confidence).toBe('check')
    expect(fields.ownerPhone.reason).toContain('The owner signs in to Detlio with it.')
    expect(fields.businessName).toEqual({ confidence: 'sure' })

    // "Working days" and "Timings" read together as one week.
    expect(draft.workingHours?.filter((d) => !d.isClosed).map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6])
    expect(draft.workingHours?.[1]).toEqual({ dayOfWeek: 1, openTime: '09:00', closeTime: '20:00', isClosed: false })
    expect(fields.workingHours).toEqual({ confidence: 'check', reason: 'Sun not mentioned, so set as closed.' })
  })

  test('services by the shared price rules; a missing time stays missing', () => {
    const { draft, fields } = garages[0].import
    expect(draft.services).toEqual([
      {
        name: 'Foam wash',
        description: null,
        category: 'car_wash',
        pricingType: 'flat',
        price: 399,
        priceHatchback: null,
        priceSedan: null,
        priceSuv: null,
        durationMins: null,
      },
      {
        name: 'Full wash',
        description: null,
        category: 'car_wash',
        pricingType: 'per_vehicle',
        price: null,
        priceHatchback: 499,
        priceSedan: 549,
        priceSuv: 649,
        durationMins: 45,
      },
      {
        name: 'Interior cleaning',
        description: null,
        category: 'detailing',
        pricingType: 'on_inspection',
        price: null,
        priceHatchback: null,
        priceSedan: null,
        priceSuv: null,
        durationMins: null,
      },
      {
        name: 'Ceramic coating',
        description: null,
        category: 'coating',
        pricingType: 'flat',
        price: 15000,
        priceHatchback: null,
        priceSedan: null,
        priceSuv: null,
        durationMins: 2880,
      },
    ])
    expect(fields['services.0.durationMins']).toEqual({ confidence: 'missing' })
    expect(fields['services.2.price']).toEqual({
      confidence: 'missing',
      reason: 'Says “Call”, so we set On inspection. Ask the garage for its fee.',
    })
    expect(fields['services.2.category']).toEqual({ confidence: 'check', reason: 'Could be Detailing or Car wash.' })
    expect(fields['services.3.price'].confidence).toBe('check')
  })

  test('a sparse row: what is missing is missing, and one phone fills both', () => {
    const { draft, fields } = garages[1].import
    expect(draft.ownerPhone).toBe('9000000102')
    expect(draft.phone).toBe('9000000102')
    expect(fields.phone).toEqual({ confidence: 'check', reason: "Copied from the owner's number." })
    expect(draft.pincode).toBeNull()
    expect(fields.pincode).toEqual({ confidence: 'missing', reason: '“6000” is not a 6-digit pincode.' })
    expect(draft.dropinEnabled).toBe(true)
    expect(draft.doorstepEnabled).toBe(false)
    expect(draft.workingHours?.[0].isClosed).toBe(true)
    expect(draft.workingHours?.[6]).toEqual({ dayOfWeek: 6, openTime: '09:00', closeTime: '19:00', isClosed: false })
    // Two priced items on one line, split at the comma.
    expect(draft.services.map((s) => [s.name, s.price])).toEqual([
      ['Body wash', 299],
      ['Polish', 999],
    ])
  })

  test("only a landline: copied to the owner's field, which says it can't be the sign-in number", () => {
    const row = [...ROW_TWO]
    row[3] = 'Lakshmi Auto Care'
    row[5] = ''
    row[6] = '044 2345 6789'
    const [garage] = garagesFromTallyCsv([csvLine(HEADER), csvLine(row)].join('\r\n'))
    const { draft, fields } = garage.import
    expect(draft.phone).toBe('4423456789')
    expect(draft.ownerPhone).toBe('4423456789')
    expect(fields.phone).toEqual({ confidence: 'check', reason: 'Looks like a landline.' })
    expect(fields.ownerPhone).toEqual({
      confidence: 'check',
      reason:
        "Copied from the garage's number, which looks like a landline. The owner signs in to Detlio with a mobile number; ask for theirs.",
    })
  })

  test('a file with no garage questions, or no rows, gives nothing', () => {
    expect(garagesFromTallyCsv('Name,Colour\nAsha,Blue')).toEqual([])
    expect(garagesFromTallyCsv(csvLine(HEADER))).toEqual([])
    expect(garagesFromTallyCsv('')).toEqual([])
  })
})
