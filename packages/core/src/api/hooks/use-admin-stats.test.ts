import { describe, expect, test } from 'bun:test'
import { ApiError } from '@repo/core/api/client'
import { retryStats } from './use-admin-stats'

describe('retryStats', () => {
  test('a timeout is shown at once, not run twice more on the shared connection', () => {
    const timeout = new ApiError(503, 'These numbers took too long to work out. Try a shorter period or one garage.', 'STATS_TIMEOUT')
    expect(retryStats(0, timeout)).toBe(false)
  })

  test('a 4xx is an answer', () => {
    expect(retryStats(0, new ApiError(400, 'Bad range', 'VALIDATION_ERROR'))).toBe(false)
  })

  test('any other failure is tried twice more, as everywhere else', () => {
    const blip = new ApiError(502, 'Bad gateway')
    expect(retryStats(0, blip)).toBe(true)
    expect(retryStats(1, new TypeError('Failed to fetch'))).toBe(true)
    expect(retryStats(2, blip)).toBe(false)
  })
})
