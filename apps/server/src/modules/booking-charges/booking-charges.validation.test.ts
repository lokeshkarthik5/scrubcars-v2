import { describe, expect, test } from 'bun:test'
import { raiseFinalBillSchema } from './booking-charges.validation.js'

const line = (description: string, amount: number) => ({ description, amount })

describe('raiseFinalBillSchema', () => {
  test('lines with a description and an amount, and an optional note', () => {
    const parsed = raiseFinalBillSchema.parse({
      lines: [line('  Rear bumper respray ', 2200), line('Polish', 300.5)],
      note: '  Paint matched to the original. ',
    })
    expect(parsed.lines[0].description).toBe('Rear bumper respray')
    expect(parsed.note).toBe('Paint matched to the original.')
  })

  test('an empty note is no note', () => {
    expect(raiseFinalBillSchema.parse({ lines: [line('Polish', 300)], note: '   ' }).note).toBeUndefined()
  })

  test('between one and twenty lines', () => {
    expect(raiseFinalBillSchema.safeParse({ lines: [] }).success).toBe(false)
    const twenty = Array.from({ length: 20 }, (_, i) => line(`Part ${i + 1}`, 10))
    expect(raiseFinalBillSchema.safeParse({ lines: twenty }).success).toBe(true)
    expect(raiseFinalBillSchema.safeParse({ lines: [...twenty, line('One more', 10)] }).success).toBe(false)
  })

  test('each description 1–80 characters', () => {
    expect(raiseFinalBillSchema.safeParse({ lines: [line('   ', 100)] }).success).toBe(false)
    expect(raiseFinalBillSchema.safeParse({ lines: [line('x'.repeat(80), 100)] }).success).toBe(true)
    expect(raiseFinalBillSchema.safeParse({ lines: [line('x'.repeat(81), 100)] }).success).toBe(false)
  })

  test('each amount above zero, in rupees and paise', () => {
    expect(raiseFinalBillSchema.safeParse({ lines: [line('Polish', 0)] }).success).toBe(false)
    expect(raiseFinalBillSchema.safeParse({ lines: [line('Polish', -50)] }).success).toBe(false)
    expect(raiseFinalBillSchema.safeParse({ lines: [line('Polish', 10.255)] }).success).toBe(false)
    expect(raiseFinalBillSchema.safeParse({ lines: [line('Polish', 10.25)] }).success).toBe(true)
  })

  test('the bill comes to at least ₹1', () => {
    expect(raiseFinalBillSchema.safeParse({ lines: [line('Washer', 0.5)] }).success).toBe(false)
    expect(
      raiseFinalBillSchema.safeParse({ lines: [line('Washer', 0.5), line('Clip', 0.5)] }).success
    ).toBe(true)
  })

  test('amounts are numbers, not strings', () => {
    expect(raiseFinalBillSchema.safeParse({ lines: [{ description: 'Polish', amount: '300' }] }).success).toBe(
      false
    )
  })
})
