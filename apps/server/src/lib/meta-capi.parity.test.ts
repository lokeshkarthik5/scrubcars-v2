import { describe, expect, test } from 'bun:test'
import { purchaseEventId } from './meta-capi.js'

// The browser's twin (the Pixel's Purchase) lives in packages/core, which
// the server does not depend on. Loaded by path at run time, as
// stats-range.parity.test.ts does. If these two ever differ, Meta counts
// every paid booking twice: once from the Pixel, once from this API.
const coreUrl = new URL('../../../../packages/core/src/api/payments.ts', import.meta.url).href

describe('the Purchase event id: the Pixel and the Conversions API agree', () => {
  test('Web Crypto in the browser and node:crypto on the server give the same id', async () => {
    const core = (await import(coreUrl)) as { purchaseEventId: (bookingId: string) => Promise<string> }
    for (const bookingId of [
      'e2e00000-0000-4000-8000-000000009001',
      '8d3c1f2e-4b5a-4c6d-9e7f-0a1b2c3d4e5f',
      '2B7F6F0E-5D1C-4C11-9B55-2F0B6A1C9D10',
      crypto.randomUUID(),
      crypto.randomUUID(),
    ]) {
      const browser = await core.purchaseEventId(bookingId)
      expect(browser).toBe(purchaseEventId(bookingId))
      expect(browser).toMatch(/^purchase_[0-9a-f]{32}$/)
    }
  })
})
