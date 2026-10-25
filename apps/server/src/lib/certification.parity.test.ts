import { describe, expect, test } from 'bun:test'
import * as server from './certification.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The garage
// page's "What this means" sheet and the portal's card say these numbers,
// so they must be the ones the server certifies by.
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('Detlio Certified parity', () => {
  test('the thresholds and the check kinds are the same', async () => {
    const core = (await import(coreUrl('certification.ts'))) as {
      CERTIFICATION_THRESHOLDS: Record<string, number>
      QUALITY_CHECK_KIND_LABELS: Record<string, string>
    }
    for (const [key, value] of Object.entries(core.CERTIFICATION_THRESHOLDS)) {
      expect({ key, value }).toEqual({
        key,
        value: (server.CERTIFICATION_RULES as unknown as Record<string, number>)[key]!,
      })
    }
    expect(core.QUALITY_CHECK_KIND_LABELS).toEqual(server.QUALITY_CHECK_KIND_LABELS)
  })
})
