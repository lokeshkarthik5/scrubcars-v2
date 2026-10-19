import { describe, expect, test } from 'bun:test'
import { greetingFor } from './home-header'

describe('greetingFor', () => {
  test('greets by the time of day in Chennai', () => {
    // 9:40 am, 1:00 pm and 7:30 pm IST.
    expect(greetingFor(new Date('2026-10-19T04:10:00Z'))).toBe('Good morning')
    expect(greetingFor(new Date('2026-10-19T07:30:00Z'))).toBe('Good afternoon')
    expect(greetingFor(new Date('2026-10-19T14:00:00Z'))).toBe('Good evening')
  })
})
