import { describe, expect, test } from 'bun:test'
import {
  closeComplaintSchema,
  complaintAdminNoteSchema,
  createComplaintSchema,
  listComplaintsQuerySchema,
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
