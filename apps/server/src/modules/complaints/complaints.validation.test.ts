import { describe, expect, test } from 'bun:test'
import {
  closeComplaintSchema,
  complaintAdminNoteSchema,
  complaintLookupQuerySchema,
  createComplaintSchema,
  listComplaintsQuerySchema,
  logComplaintSchema,
  nationalMobileDigits,
  resolveComplaintSchema,
} from './complaints.validation.js'

const BOOKING = 'e2e00000-0000-4000-8000-000000000601'
const MESSAGE = 'The garage scratched the rear bumper while washing.'

describe('createComplaintSchema', () => {
  test('a category and a message, with a booking or without', () => {
    expect(createComplaintSchema.parse({ category: 'damage', message: `  ${MESSAGE}  ` })).toEqual({
      category: 'damage',
      message: MESSAGE,
    })
    expect(
      createComplaintSchema.parse({ category: 'damage', message: MESSAGE, bookingId: BOOKING })
    ).toEqual({ category: 'damage', message: MESSAGE, bookingId: BOOKING })
  })

  test('refuses an unknown category, a short or long message, and a bad booking id', () => {
    expect(createComplaintSchema.safeParse({ category: 'refund', message: MESSAGE }).success).toBe(false)
    expect(createComplaintSchema.safeParse({ category: 'other', message: '   too short ' }).success).toBe(false)
    expect(createComplaintSchema.safeParse({ category: 'other', message: 'x'.repeat(1001) }).success).toBe(false)
    expect(createComplaintSchema.safeParse({ category: 'other', message: 'x'.repeat(1000) }).success).toBe(true)
    expect(
      createComplaintSchema.safeParse({ category: 'other', message: MESSAGE, bookingId: '42' }).success
    ).toBe(false)
  })

  test('nothing else rides along: not a garage, a status or someone else', () => {
    for (const extra of [
      { vendorId: BOOKING },
      { status: 'resolved' },
      { userId: BOOKING },
      { number: 1 },
    ]) {
      expect(
        createComplaintSchema.safeParse({ category: 'other', message: MESSAGE, ...extra }).success
      ).toBe(false)
    }
  })
})

describe('listComplaintsQuerySchema', () => {
  test('Open by default; the four filters and nothing else', () => {
    expect(listComplaintsQuerySchema.parse({})).toEqual({ show: 'open' })
    for (const show of ['open', 'overdue', 'resolved', 'all'] as const) {
      expect(listComplaintsQuerySchema.parse({ show })).toEqual({ show })
    }
    expect(listComplaintsQuerySchema.safeParse({ show: 'closed' }).success).toBe(false)
  })
})

describe('the team’s actions', () => {
  test('resolving needs a note for the customer', () => {
    expect(resolveComplaintSchema.safeParse({}).success).toBe(false)
    expect(resolveComplaintSchema.safeParse({ resolutionNote: '   ' }).success).toBe(false)
    expect(resolveComplaintSchema.parse({ resolutionNote: ' Refunded ₹499 to your card. ' })).toEqual({
      resolutionNote: 'Refunded ₹499 to your card.',
    })
  })

  test('closing may say why, or not', () => {
    expect(closeComplaintSchema.parse({})).toEqual({})
    expect(closeComplaintSchema.parse({ resolutionNote: 'Same as C-000122.' })).toEqual({
      resolutionNote: 'Same as C-000122.',
    })
  })

  test('the internal note may be cleared, and has a cap', () => {
    expect(complaintAdminNoteSchema.parse({ adminNote: '  ' })).toEqual({ adminNote: '' })
    expect(complaintAdminNoteSchema.safeParse({ adminNote: 'x'.repeat(2001) }).success).toBe(false)
  })
})

describe('logComplaintSchema', () => {
  const LOGGED = {
    phone: '98765 43210',
    source: 'whatsapp',
    category: 'payment_or_refund',
    message: 'Charged twice for one wash on Saturday.',
    loggedBy: 'Ravi',
  } as const

  test('a phone however it was typed, a source and what they said; who logged it is the session', () => {
    // A typed name is ignored: adminSignedJson signs it with the session (0058).
    expect(logComplaintSchema.parse(LOGGED)).toEqual({ ...LOGGED, phone: '9876543210', loggedBy: '' })
    for (const phone of ['+91 98765 43210', '098765-43210', '0091 9876543210', '919876543210']) {
      expect(logComplaintSchema.parse({ ...LOGGED, phone }).phone).toBe('9876543210')
    }
  })

  test('the team picks how it came, never "app"', () => {
    for (const source of ['phone', 'whatsapp', 'email', 'in_person', 'other']) {
      expect(logComplaintSchema.safeParse({ ...LOGGED, source }).success).toBe(true)
    }
    expect(logComplaintSchema.safeParse({ ...LOGGED, source: 'app' }).success).toBe(false)
    expect(logComplaintSchema.safeParse({ ...LOGGED, source: 'sms' }).success).toBe(false)
    const { source: _source, ...withoutSource } = LOGGED
    expect(logComplaintSchema.safeParse(withoutSource).success).toBe(false)
  })

  test('refuses a number that is not an Indian mobile; needs no typed name', () => {
    for (const phone of ['12345', '1234567890', '98765432101', 'call me']) {
      expect(logComplaintSchema.safeParse({ ...LOGGED, phone }).success).toBe(false)
    }
    const { loggedBy: _loggedBy, ...unsigned } = LOGGED
    expect(logComplaintSchema.parse(unsigned).loggedBy).toBe('')
  })

  test('a booking reference with or without its #, in any case', () => {
    expect(logComplaintSchema.parse({ ...LOGGED, bookingRef: ' #C0A10001 ' }).bookingRef).toBe('c0a10001')
    expect(logComplaintSchema.safeParse({ ...LOGGED, bookingRef: 'C0A1' }).success).toBe(false)
    expect(logComplaintSchema.safeParse({ ...LOGGED, bookingRef: 'NOTAREF1' }).success).toBe(false)
  })

  test('when it was received is a full timestamp, when given', () => {
    expect(
      logComplaintSchema.parse({ ...LOGGED, receivedAt: '2026-10-17T21:15:00+05:30' }).receivedAt
    ).toBe('2026-10-17T21:15:00+05:30')
    expect(logComplaintSchema.safeParse({ ...LOGGED, receivedAt: 'yesterday' }).success).toBe(false)
  })

  test('nothing else rides along: not a user id, a status or a garage', () => {
    for (const extra of [{ userId: BOOKING }, { status: 'resolved' }, { vendorId: BOOKING }, { number: 1 }]) {
      expect(logComplaintSchema.safeParse({ ...LOGGED, ...extra }).success).toBe(false)
    }
  })
})

describe('complaintLookupQuerySchema', () => {
  test('either look-up, both, or neither', () => {
    expect(complaintLookupQuerySchema.parse({})).toEqual({})
    expect(complaintLookupQuerySchema.parse({ phone: '+91 98765 43210', bookingRef: '#ABCDEF12' })).toEqual({
      phone: '9876543210',
      bookingRef: 'abcdef12',
    })
    expect(complaintLookupQuerySchema.safeParse({ q: 'x' }).success).toBe(false)
  })
})

describe('nationalMobileDigits', () => {
  test('never eats a real number that starts with 91 or 0', () => {
    expect(nationalMobileDigits('9198765432')).toBe('9198765432')
    expect(nationalMobileDigits('+91 91987 65432')).toBe('9198765432')
  })
})
