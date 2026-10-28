import { describe, expect, test } from 'bun:test'
import * as server from './agreements.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). Admin checks
// a picked PDF against the core limits before asking for a link, and the
// garage reads the core words, so they must be the server's.
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('garage agreement parity', () => {
  test('the words, the type, the limits and the 30 days are the same', async () => {
    const core = (await import(coreUrl('agreements.ts'))) as {
      AGREEMENT_TITLE: string
      AGREEMENT_TICK: string
      AGREEMENT_CONTENT_TYPE: string
      AGREEMENT_MAX_BYTES: number
      AGREEMENT_GRACE_DAYS: number
      AGREEMENT_NOTE_MAX: number
    }
    expect(core.AGREEMENT_TITLE).toBe(server.AGREEMENT_TITLE)
    expect(core.AGREEMENT_TICK).toBe(server.AGREEMENT_TICK)
    expect(core.AGREEMENT_CONTENT_TYPE).toBe(server.AGREEMENT_CONTENT_TYPE)
    expect(core.AGREEMENT_MAX_BYTES).toBe(server.AGREEMENT_MAX_BYTES)
    expect(core.AGREEMENT_GRACE_DAYS).toBe(server.AGREEMENT_GRACE_DAYS)
    expect(core.AGREEMENT_NOTE_MAX).toBe(server.AGREEMENT_NOTE_MAX)
  })
})
