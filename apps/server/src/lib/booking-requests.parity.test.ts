import { describe, expect, test } from 'bun:test'
import { REQUEST_RULES } from './booking-requests.js'

// The apps' copy lives in packages/core, which the server does not depend on:
// loaded by path at run time, as the other parity tests do.
const coreUrl = new URL('../../../../packages/core/src/booking-requests.ts', import.meta.url).href

describe('booking requests: the apps say the server’s numbers', () => {
  test('respond, alert, confirm, limits, days ahead and travel fees', async () => {
    const core = (await import(coreUrl)) as { REQUEST_RULES: Record<string, unknown> }
    for (const key of ['respondMinutes', 'alertAfterMinutes', 'confirmMinutes', 'maxOpenPerCustomer', 'maxGarages', 'pickDayAheadDays'] as const) {
      expect(core.REQUEST_RULES[key]).toBe(REQUEST_RULES[key])
    }
    expect(core.REQUEST_RULES.travelFees).toEqual([...REQUEST_RULES.travelFees])
  })
})
