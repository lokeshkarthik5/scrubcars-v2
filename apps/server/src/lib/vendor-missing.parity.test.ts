import { describe, expect, test } from 'bun:test'
import * as server from './vendor-missing.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/).
const coreUrl = new URL(
  '../../../../packages/core/src/onboarding-marks.ts',
  import.meta.url
).href

type Core = {
  MISSING_KEYS: readonly string[]
  MISSING_LABELS: Record<string, string>
  MISSING_TABS: Record<string, string>
  MISSING_ASKS: Record<string, string>
  isMissingKey: (value: unknown) => boolean
  markLabel: (kind: string, label: string | null | undefined) => string
}

describe('missing keys parity', () => {
  test('the server and the apps have the same keys, in the same order', async () => {
    const core = (await import(coreUrl)) as Core
    expect([...core.MISSING_KEYS]).toEqual([...server.MISSING_KEYS])
    // Every key has its words and its tab in the apps.
    for (const key of server.MISSING_KEYS) {
      expect(core.MISSING_LABELS[key]).toBeTruthy()
      expect(core.MISSING_TABS[key]).toBeTruthy()
      expect(core.MISSING_ASKS[key]).toBeTruthy()
    }
    expect(core.MISSING_LABELS).toEqual(server.MISSING_LABELS)
    for (const value of [...server.MISSING_KEYS, 'custom', '', 'Photos', 3]) {
      expect(core.isMissingKey(value)).toBe(server.isMissingKey(value))
    }
    for (const kind of server.MARK_KINDS) {
      for (const label of [null, undefined, '', '  ', ' Call back ']) {
        expect(core.markLabel(kind, label)).toBe(server.markLabel(kind, label))
      }
    }
  })
})
