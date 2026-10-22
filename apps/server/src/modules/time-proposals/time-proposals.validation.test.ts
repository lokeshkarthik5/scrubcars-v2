import { describe, expect, test } from 'bun:test'
import { chooseTimeSchema, proposalSlotsQuerySchema, suggestTimesSchema } from './time-proposals.validation.js'

describe('suggestTimesSchema', () => {
  const slot = (h: number) => `2026-10-17T${String(h).padStart(2, '0')}:30:00.000Z`

  test('one to three ISO times and an optional note', () => {
    expect(suggestTimesSchema.parse({ slots: [slot(5)], note: ' ' })).toEqual({ slots: [slot(5)], note: undefined })
    expect(suggestTimesSchema.parse({ slots: [slot(5), slot(6), slot(7)], note: 'Bay 2 is busy' }).note).toBe('Bay 2 is busy')
  })

  test('refuses none, four, a date without a time, and anything extra', () => {
    expect(suggestTimesSchema.safeParse({ slots: [] }).success).toBe(false)
    expect(suggestTimesSchema.safeParse({ slots: [slot(5), slot(6), slot(7), slot(8)] }).success).toBe(false)
    expect(suggestTimesSchema.safeParse({ slots: ['2026-10-17'] }).success).toBe(false)
    expect(suggestTimesSchema.safeParse({ slots: [slot(5)], status: 'accepted' }).success).toBe(false)
    expect(suggestTimesSchema.safeParse({ slots: [slot(5)], note: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('chooseTimeSchema and the slots query', () => {
  test('one time, nothing else; a YYYY-MM-DD day', () => {
    expect(chooseTimeSchema.safeParse({ slot: '2026-10-17T13:00:00+05:30' }).success).toBe(true)
    expect(chooseTimeSchema.safeParse({ slot: '2026-10-17T13:00:00+05:30', bookingId: 'x' }).success).toBe(false)
    expect(proposalSlotsQuerySchema.safeParse({ date: '2026-10-17' }).success).toBe(true)
    expect(proposalSlotsQuerySchema.safeParse({ date: '17-10-2026' }).success).toBe(false)
  })
})
