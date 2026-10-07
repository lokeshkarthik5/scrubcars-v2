import { describe, expect, test } from 'bun:test'
import {
  adminCancelBookingSchema,
  createBookingNoteSchema,
  listBookingsQuerySchema,
  markNoShowSchema,
  pauseVendorSchema,
  pilotStatsQuerySchema,
  updateVendorSchema,
} from './admin.validation.js'

describe('listBookingsQuerySchema', () => {
  test('the panel from before search existed still parses: no params, or status alone', () => {
    expect(listBookingsQuerySchema.parse({})).toEqual({ limit: 100, page: 1 })
    expect(listBookingsQuerySchema.parse({ status: 'pending' })).toMatchObject({
      status: 'pending',
      limit: 100,
      page: 1,
    })
  })

  test('query-string numbers are coerced and bounded', () => {
    expect(
      listBookingsQuerySchema.parse({ limit: '50', page: '3' })
    ).toMatchObject({
      limit: 50,
      page: 3,
    })
    expect(listBookingsQuerySchema.safeParse({ limit: '500' }).success).toBe(
      false
    )
    expect(listBookingsQuerySchema.safeParse({ page: '0' }).success).toBe(false)
  })

  test('dates are IST calendar days, in order', () => {
    expect(
      listBookingsQuerySchema.safeParse({
        from: '2026-10-04',
        to: '2026-10-04',
      }).success
    ).toBe(true)
    expect(
      listBookingsQuerySchema.safeParse({
        from: '2026-10-05',
        to: '2026-10-04',
      }).success
    ).toBe(false)
    expect(
      listBookingsQuerySchema.safeParse({ from: '04/10/2026' }).success
    ).toBe(false)
  })

  test('a date that does not exist is refused, not rolled over or sent to the query', () => {
    // Month 13 would be an Invalid Date and a 500; 31 February would quietly
    // become 3 March.
    expect(
      listBookingsQuerySchema.safeParse({ from: '2026-13-01' }).success
    ).toBe(false)
    expect(
      listBookingsQuerySchema.safeParse({ to: '2026-02-31' }).success
    ).toBe(false)
    expect(
      listBookingsQuerySchema.safeParse({ to: '2028-02-29' }).success
    ).toBe(true)
  })

  test('a cursor is read into the row the next page starts after', () => {
    const parsed = listBookingsQuerySchema.parse({
      cursor: '2026-10-04T10:30:00.000Z_AD5EA7C1-0000-4000-8000-000000000001',
    })
    expect(parsed.cursor?.scheduledAt.toISOString()).toBe(
      '2026-10-04T10:30:00.000Z'
    )
    expect(parsed.cursor?.id).toBe('ad5ea7c1-0000-4000-8000-000000000001')
    expect(
      listBookingsQuerySchema.safeParse({ cursor: 'page-2' }).success
    ).toBe(false)
  })

  test('the garage filter must be an id', () => {
    expect(
      listBookingsQuerySchema.safeParse({ vendorId: 'garage-1' }).success
    ).toBe(false)
  })
})

describe('adminCancelBookingSchema', () => {
  test('needs whose call it was and a reason', () => {
    expect(
      adminCancelBookingSchema.safeParse({
        onBehalfOf: 'garage',
        reason: 'Power cut',
      }).success
    ).toBe(true)
    expect(
      adminCancelBookingSchema.safeParse({ onBehalfOf: 'garage' }).success
    ).toBe(false)
    expect(
      adminCancelBookingSchema.safeParse({
        onBehalfOf: 'garage',
        reason: '   ',
      }).success
    ).toBe(false)
    expect(
      adminCancelBookingSchema.safeParse({ onBehalfOf: 'admin', reason: 'x' })
        .success
    ).toBe(false)
  })

  test('caps the reason at 500 characters', () => {
    expect(
      adminCancelBookingSchema.safeParse({
        onBehalfOf: 'detlio',
        reason: 'a'.repeat(501),
      }).success
    ).toBe(false)
  })
})

describe('markNoShowSchema', () => {
  test('names the party; the note is optional', () => {
    expect(markNoShowSchema.safeParse({ party: 'customer' }).success).toBe(true)
    expect(
      markNoShowSchema.safeParse({ party: 'garage', note: 'Called twice' })
        .success
    ).toBe(true)
    expect(markNoShowSchema.safeParse({ party: 'detlio' }).success).toBe(false)
  })
})

describe('createBookingNoteSchema', () => {
  test('a note has to say something, and not too much', () => {
    expect(
      createBookingNoteSchema.safeParse({ body: 'Customer called' }).success
    ).toBe(true)
    expect(createBookingNoteSchema.safeParse({ body: '  ' }).success).toBe(
      false
    )
    expect(
      createBookingNoteSchema.safeParse({ body: 'a'.repeat(2001) }).success
    ).toBe(false)
  })
})

describe('pilotStatsQuerySchema', () => {
  test('a week unless asked otherwise, as a number', () => {
    expect(pilotStatsQuerySchema.parse({})).toEqual({ days: 7 })
    expect(pilotStatsQuerySchema.parse({ days: '30' })).toEqual({ days: 30 })
  })

  test('only the two windows the dashboard offers', () => {
    expect(pilotStatsQuerySchema.safeParse({ days: '14' }).success).toBe(false)
    expect(pilotStatsQuerySchema.safeParse({ days: '365' }).success).toBe(false)
  })
})

describe('updateVendorSchema working hours', () => {
  const day = (dayOfWeek: number, closeTime = '18:00:00') => ({
    dayOfWeek,
    openTime: '09:00:00',
    closeTime,
    isClosed: false,
  })

  test('a save that never touched the hours carries none, so none change', () => {
    const parsed = updateVendorSchema.parse({ businessName: 'Renamed Garage' })
    expect(parsed.workingHours).toBeUndefined()
    expect(parsed.workingDays).toBeUndefined()
  })

  test('takes each day on its own, so a short Saturday stays short', () => {
    const parsed = updateVendorSchema.parse({
      workingHours: [day(1), day(6, '13:00:00')],
    })
    expect(parsed.workingHours?.[1]).toMatchObject({ dayOfWeek: 6, closeTime: '13:00:00' })
  })

  test('refuses the same day twice', () => {
    expect(
      updateVendorSchema.safeParse({ workingHours: [day(1), day(1, '13:00:00')] }).success
    ).toBe(false)
  })
})

describe('pauseVendorSchema', () => {
  test('the reason is optional and capped', () => {
    expect(pauseVendorSchema.parse({})).toEqual({})
    expect(pauseVendorSchema.parse({ reason: '  Owner unwell  ' })).toEqual({
      reason: 'Owner unwell',
    })
    expect(pauseVendorSchema.safeParse({ reason: 'x'.repeat(201) }).success).toBe(false)
  })
})
