import { describe, expect, test } from 'bun:test'
import { hasPgCode } from './errors.js'

describe('hasPgCode', () => {
  test('reads the SQLSTATE off the error or the driver error drizzle wraps', () => {
    expect(hasPgCode({ code: '23514' }, '23514')).toBe(true)
    expect(hasPgCode(Object.assign(new Error('Failed query'), { cause: { code: '23514' } }), '23514')).toBe(true)
    expect(hasPgCode({ code: '23505' }, '23514')).toBe(false)
    expect(hasPgCode(new Error('boom'), '23514')).toBe(false)
    expect(hasPgCode(null, '23514')).toBe(false)
  })
})
