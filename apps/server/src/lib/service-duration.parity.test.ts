import { describe, expect, test } from 'bun:test'
import * as server from './service-duration.js'

const coreUrl = new URL('../../../../packages/core/src/service-duration.ts', import.meta.url).href

describe('service duration parity', () => {
  test('the apps hold the same default and read an empty duration the same way', async () => {
    const core = (await import(coreUrl)) as typeof server
    expect(core.DEFAULT_SERVICE_DURATION_MINS).toBe(server.DEFAULT_SERVICE_DURATION_MINS)
    for (const durationMins of [null, undefined, 0, -5, 30, 90, 1440, Number.NaN]) {
      expect(core.effectiveDurationMins({ durationMins })).toBe(server.effectiveDurationMins({ durationMins }))
      expect(core.hasDuration({ durationMins })).toBe(server.hasDuration({ durationMins }))
    }
  })
})
