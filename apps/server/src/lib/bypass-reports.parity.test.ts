import { describe, expect, test } from 'bun:test'
import * as server from './bypass-reports.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The booking
// page's form, admin's labels and the reward line say these numbers and
// words, so they must be the ones the server decides by.
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('bypass reports parity', () => {
  test('the numbers, the kinds and their words are the same', async () => {
    const core = (await import(coreUrl('bypass-reports.ts'))) as {
      BYPASS_NUMBERS: Record<string, number>
      BYPASS_KINDS: readonly string[]
      BYPASS_KIND_LABELS: Record<string, string>
    }
    expect(core.BYPASS_NUMBERS).toEqual({ ...server.BYPASS_RULES })
    expect([...core.BYPASS_KINDS]).toEqual([...server.BYPASS_KINDS])
    expect(core.BYPASS_KIND_LABELS).toEqual(server.BYPASS_KIND_LABELS)
  })
})
