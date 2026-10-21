import { describe, expect, test } from 'bun:test'
import {
  AMOUNT_BUCKETS,
  amountBucket,
  BOOKING_MODES,
  BROWSE_CATEGORIES,
  cleanPath,
  CLIENT_EVENTS,
  DEVICE_CLASSES,
  EVENT_PROPS,
  EVENT_STEPS,
  MAX_EVENTS_PER_BATCH,
  MAX_PATH_LENGTH,
  SOURCE_PATTERN,
} from './analytics.js'

// The customer app's twin lives in packages/core, which the server does not
// depend on. Loaded by path at run time, as stats-range.parity.test.ts does.
const coreUrl = new URL('../../../../packages/core/src/analytics-events.ts', import.meta.url).href

describe('usage events: the app sends only what the API takes', () => {
  test('the same events, props, enums and limits on both sides', async () => {
    const core = (await import(coreUrl)) as Record<string, unknown> & {
      amountBucket: (rupees: number) => string
      cleanPath: (raw: string) => string
    }
    expect(core.CLIENT_EVENTS).toEqual([...CLIENT_EVENTS])
    for (const name of CLIENT_EVENTS) {
      expect((core.EVENT_PROPS as Record<string, string[]>)[name]).toEqual([...EVENT_PROPS[name]])
    }
    expect(core.BOOKING_MODES).toEqual([...BOOKING_MODES])
    expect(core.BROWSE_CATEGORIES).toEqual([...BROWSE_CATEGORIES])
    expect(core.AMOUNT_BUCKETS).toEqual([...AMOUNT_BUCKETS])
    expect(core.EVENT_STEPS).toEqual([...EVENT_STEPS])
    expect(core.DEVICE_CLASSES).toEqual([...DEVICE_CLASSES])
    expect(core.MAX_EVENTS_PER_BATCH).toBe(MAX_EVENTS_PER_BATCH)
    expect(core.MAX_PATH_LENGTH).toBe(MAX_PATH_LENGTH)
    expect(String(core.SOURCE_PATTERN)).toBe(String(SOURCE_PATTERN))

    for (const rupees of [0, 1, 499.99, 500, 999, 1000, 1999.5, 2000, 4999, 5000, 25000, Number.NaN]) {
      expect(core.amountBucket(rupees)).toBe(amountBucket(rupees))
    }
    for (const path of [
      '/',
      '',
      '/garage/2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10?mode=doorstep',
      '/bookings/2B7F6F0E-5D1C-4C11-9B55-2F0B6A1C9D10/receipt#x',
      '/search/<b>hi</b>',
      `/${'z'.repeat(300)}`,
    ]) {
      expect(core.cleanPath(path)).toBe(cleanPath(path))
    }
  })
})
