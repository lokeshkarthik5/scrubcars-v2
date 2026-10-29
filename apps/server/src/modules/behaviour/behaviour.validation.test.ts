import { describe, expect, test } from 'bun:test'
import { behaviourQuerySchema } from './behaviour.validation.js'

const parse = (query: Record<string, string>) => behaviourQuerySchema.safeParse(query)

describe('the Behaviour query', () => {
  test('a period, with Source and Device defaulting to all', () => {
    const parsed = parse({ from: '2026-10-22', to: '2026-10-28' })
    expect(parsed.success && parsed.data).toEqual({
      from: '2026-10-22',
      to: '2026-10-28',
      source: 'all',
      device: 'all',
    })
  })

  test('the filters the page offers, and nothing else', () => {
    expect(parse({ from: '2026-10-01', to: '2026-10-28', source: 'instagram', device: 'phone' }).success).toBe(true)
    expect(parse({ from: '2026-10-01', to: '2026-10-28', source: 'other', device: 'desktop' }).success).toBe(true)
    expect(parse({ from: '2026-10-01', to: '2026-10-28', source: 'tiktok' }).success).toBe(false)
    expect(parse({ from: '2026-10-01', to: '2026-10-28', device: 'tablet' }).success).toBe(false)
  })

  test('real dates, in order, at most 92 days', () => {
    expect(parse({ from: '2026-10-28', to: '2026-10-01' }).success).toBe(false)
    expect(parse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(false)
    expect(parse({ from: '2026-07-01', to: '2026-10-28' }).success).toBe(false)
    expect(parse({ from: '2026-07-29', to: '2026-10-28' }).success).toBe(true)
  })
})
