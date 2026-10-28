import { describe, expect, test } from 'bun:test'
import type { ImportedGarage } from '@repo/core/api/admin'
import { EMPTY_GARAGE_TEXT, missingForCreate, missingLine } from './garage-form'
import {
  formFromImport,
  importFileKind,
  importSourceLine,
  importSummary,
  pickedFilesProblem,
  tallyRowMeta,
  untimedLine,
  visibleMark,
} from './garage-import'

// The review screen's rules: which files are taken, how a reading fills the
// form, which notes show, and what the counts say. The garage below is the
// API's fake poster (FAKE_GARAGE_READING), as it arrives.

const POSTER: ImportedGarage = {
  label: { businessName: 'SKT Car Wash and Polish', ownerName: null, submittedAt: null },
  draft: {
    businessName: 'SKT Car Wash and Polish',
    ownerName: null,
    ownerPhone: '9000009101',
    phone: '9000009101',
    whatsapp: '9000009101',
    email: null,
    yearsInOperation: 'Since 2016',
    address: '14, Main Road, near Bus Stand',
    city: 'Chennai',
    pincode: null,
    mapsUrl: null,
    dropinEnabled: true,
    doorstepEnabled: null,
    doorstepRadiusKm: null,
    workingHours: [
      { dayOfWeek: 0, openTime: '09:00', closeTime: '18:00', isClosed: true },
      ...[1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '09:00', closeTime: '20:00', isClosed: false })),
    ],
    vehicleTypes: [],
    services: [
      { name: 'Foam wash', description: null, category: 'car_wash', pricingType: 'flat', price: 399, priceHatchback: null, priceSedan: null, priceSuv: null, durationMins: null },
      { name: 'Full wash', description: null, category: 'car_wash', pricingType: 'flat', price: 799, priceHatchback: null, priceSedan: null, priceSuv: null, durationMins: null },
      { name: 'Interior cleaning', description: null, category: 'detailing', pricingType: 'on_inspection', price: null, priceHatchback: null, priceSedan: null, priceSuv: null, durationMins: null },
    ],
  },
  fields: {
    businessName: { confidence: 'sure' },
    ownerName: { confidence: 'missing' },
    ownerPhone: { confidence: 'check', reason: "Copied from the garage's number. The owner signs in to Detlio with it." },
    phone: { confidence: 'sure' },
    whatsapp: { confidence: 'sure' },
    email: { confidence: 'missing' },
    yearsInOperation: { confidence: 'sure' },
    address: { confidence: 'sure' },
    city: { confidence: 'sure' },
    pincode: { confidence: 'missing' },
    mapsUrl: { confidence: 'missing' },
    bookingTypes: { confidence: 'sure' },
    doorstepRadiusKm: { confidence: 'missing' },
    workingHours: { confidence: 'sure' },
    vehicleTypes: { confidence: 'missing' },
    'services.0.name': { confidence: 'sure' },
    'services.0.category': { confidence: 'sure' },
    'services.0.price': { confidence: 'sure' },
    'services.0.durationMins': { confidence: 'missing' },
    'services.1.name': { confidence: 'sure' },
    'services.1.category': { confidence: 'sure' },
    'services.1.price': { confidence: 'check', reason: 'The poster shows ₹999 crossed out. We used the offer price.' },
    'services.1.durationMins': { confidence: 'missing' },
    'services.2.name': { confidence: 'sure' },
    'services.2.category': { confidence: 'check', reason: 'Could be Car wash or Detailing.' },
    'services.2.price': { confidence: 'missing', reason: 'Says “Call”, so we set On inspection. Ask the garage for its fee.' },
    'services.2.durationMins': { confidence: 'missing' },
  },
}

describe('files', () => {
  test('what a picked file is, from its type or its name', () => {
    expect(importFileKind({ name: 'poster.jpg', type: 'image/jpeg' })).toBe('image')
    expect(importFileKind({ name: 'form.pdf', type: 'application/pdf' })).toBe('pdf')
    expect(importFileKind({ name: 'IMG_0042.HEIC', type: '' })).toBe('heic')
    expect(importFileKind({ name: 'IMG_0042.jpg', type: 'image/heic' })).toBe('heic')
    expect(importFileKind({ name: 'scan.png', type: '' })).toBe('image')
    expect(importFileKind({ name: 'rates.docx', type: 'application/msword' })).toBe('other')
  })

  test('HEIC asks to convert; more than 5 or another kind is refused, by name', () => {
    expect(pickedFilesProblem([{ name: 'poster.jpg', type: 'image/jpeg' }])).toBeNull()
    expect(pickedFilesProblem([{ name: 'IMG_0042.HEIC', type: 'image/heic' }])).toContain(
      '“IMG_0042.HEIC” is a HEIC photo, which can\'t be read here. Take a screenshot of it'
    )
    expect(pickedFilesProblem([{ name: 'rates.docx', type: 'application/msword' }])).toBe(
      '“rates.docx” isn\'t a photo or a PDF. Upload JPG, PNG, WebP or PDF files.'
    )
    expect(pickedFilesProblem(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.jpg`, type: 'image/jpeg' })))).toBe(
      'Up to 5 files at a time. Pick the pages that matter most.'
    )
  })

  test('the review\'s subtitle says where the garage came from', () => {
    expect(importSourceLine({ kind: 'files', files: [{ name: 'a.jpg', type: 'image/jpeg' }] })).toBe('Add garage · from a photo')
    expect(
      importSourceLine({ kind: 'files', files: [{ name: 'a.jpg', type: 'image/jpeg' }, { name: 'b.png', type: 'image/png' }] })
    ).toBe('Add garage · from 2 photos')
    expect(importSourceLine({ kind: 'files', files: [{ name: 'f.pdf', type: 'application/pdf' }] })).toBe('Add garage · from a PDF')
    expect(importSourceLine({ kind: 'tally' })).toBe('Add garage · from Tally')
  })
})

describe('importSummary', () => {
  test('the fake poster: 3 to check and 3 to fill in, as the review screen counts them', () => {
    expect(importSummary(POSTER)).toEqual({ filled: 17, check: 3, missing: 3 })
  })

  test('optional fields not found are not "to fill in"', () => {
    const { missing } = importSummary({
      fields: { email: { confidence: 'missing' }, mapsUrl: { confidence: 'missing' }, 'services.0.durationMins': { confidence: 'missing' } },
    })
    expect(missing).toBe(0)
  })
})

describe('formFromImport', () => {
  const form = formFromImport(POSTER)

  test('each value in its field; what was not found left empty', () => {
    expect(form.initial.text).toMatchObject({
      businessName: 'SKT Car Wash and Polish',
      ownerName: '',
      ownerPhone: '9000009101',
      phone: '9000009101',
      pincode: '',
      openTime: '09:00',
      closeTime: '20:00',
    })
    expect(form.initial.workingDays).toEqual([1, 2, 3, 4, 5, 6])
    expect(form.initial.bookingMode).toBe('garage')
    expect(form.initial.doorstepRadius).toBe('')
  })

  test('services become rows; no time stays no time', () => {
    const rows = form.initial.services ?? []
    expect(rows.map((r) => [r.name, r.category, r.pricingType, r.price, r.durationValue])).toEqual([
      ['Foam wash', 'car_wash', 'flat', '399', ''],
      ['Full wash', 'car_wash', 'flat', '799', ''],
      ['Interior cleaning', 'detailing', 'on_inspection', '', ''],
    ])
    expect(form.untimedServices).toBe(3)
    expect(untimedLine(3, 3)).toBe(
      'No times given for these services, so each takes one booking slot. You can change this later.'
    )
  })

  test('the row notes: what to check, and why a price is empty', () => {
    const [, full, interior] = form.initial.services ?? []
    expect(form.rowNotes[full.key]).toEqual([
      { field: 'price', kind: 'check', reason: 'The poster shows ₹999 crossed out. We used the offer price.' },
    ])
    expect(form.rowNotes[interior.key]).toEqual([
      { field: 'category', kind: 'check', reason: 'Could be Car wash or Detailing.' },
      { field: 'price', kind: 'missing', reason: 'Says “Call”, so we set On inspection. Ask the garage for its fee.' },
    ])
  })

  test('a day with other hours is named, to set on the edit page', () => {
    const sundayHalfDay = formFromImport({
      ...POSTER,
      draft: {
        ...POSTER.draft,
        workingHours: [
          { dayOfWeek: 0, openTime: '09:00', closeTime: '13:00', isClosed: false },
          ...[1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '09:00', closeTime: '20:00', isClosed: false })),
        ],
      },
    })
    expect(sundayHalfDay.initial.workingDays).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(sundayHalfDay.initial.text?.closeTime).toBe('20:00')
    expect(sundayHalfDay.marks.workingHours).toEqual({
      confidence: 'check',
      reason:
        'Other hours on Sun 09:00–13:00. This form takes one time for every open day; set that day on the edit page after creating.',
    })
  })

  test('how customers book, from the two switches', () => {
    const both = formFromImport({ ...POSTER, draft: { ...POSTER.draft, dropinEnabled: true, doorstepEnabled: true, doorstepRadiusKm: 8 } })
    expect([both.initial.bookingMode, both.initial.doorstepRadius]).toEqual(['both', '8'])
    const doorstep = formFromImport({ ...POSTER, draft: { ...POSTER.draft, dropinEnabled: null, doorstepEnabled: true } })
    expect(doorstep.initial.bookingMode).toBe('doorstep')
  })
})

describe('visibleMark', () => {
  const text = { ...EMPTY_GARAGE_TEXT }

  test('"Check this" always shows', () => {
    expect(visibleMark('ownerPhone', POSTER.fields.ownerPhone, { ...text, ownerPhone: '9000009101' })).toEqual({
      kind: 'check',
      reason: "Copied from the garage's number. The owner signs in to Detlio with it.",
    })
  })

  test('"Not found — fill in" shows on a field Create needs, until it is filled', () => {
    expect(visibleMark('ownerName', POSTER.fields.ownerName, text)).toEqual({ kind: 'missing', reason: undefined })
    expect(visibleMark('ownerName', POSTER.fields.ownerName, { ...text, ownerName: 'Senthil' })).toBeNull()
    // Half a pincode is not filled.
    expect(visibleMark('pincode', POSTER.fields.pincode, { ...text, pincode: '6000' })).toEqual({ kind: 'missing', reason: undefined })
    // An optional field not found says nothing.
    expect(visibleMark('email', POSTER.fields.email, text)).toBeNull()
    expect(visibleMark('businessName', POSTER.fields.businessName, text)).toBeNull()
  })

  test('a doorstep-only garage is not asked for the address, and an empty pincode is fine (0061)', () => {
    const missing = { confidence: 'missing' as const }
    expect(visibleMark('address', missing, text)).toEqual({ kind: 'missing', reason: undefined })
    expect(visibleMark('address', missing, text, false)).toBeNull()
    expect(visibleMark('pincode', missing, text, false)).toBeNull()
    expect(visibleMark('pincode', missing, { ...text, pincode: '6000' }, false)).toEqual({ kind: 'missing', reason: undefined })
  })
})

describe('missingForCreate', () => {
  test('the fake poster waits for the owner name, the pincode and the inspection fee', () => {
    const form = formFromImport(POSTER)
    const text = { ...EMPTY_GARAGE_TEXT, ...form.initial.text }
    const rows = form.initial.services ?? []
    expect(missingForCreate(text, rows)).toBe(3)
    expect(missingLine(3)).toBe('Fill in the 3 missing fields to create')

    const filled = { ...text, ownerName: 'Senthil Kumar', pincode: '600042' }
    const priced = rows.map((row) => (row.pricingType === 'on_inspection' ? { ...row, price: '199' } : row))
    expect(missingForCreate(filled, priced)).toBe(0)
    expect(missingLine(0)).toBeNull()
    expect(missingLine(1)).toBe('Fill in the 1 missing field to create')
  })
})

describe('the Tally pick list', () => {
  test('owner and the day it was sent', () => {
    expect(tallyRowMeta({ businessName: 'A', ownerName: 'Ravi', submittedAt: '2026-10-01 10:20:00' })).toBe('Ravi · sent 2026-10-01')
    expect(tallyRowMeta({ businessName: 'A', ownerName: null, submittedAt: null })).toBe('')
  })
})
