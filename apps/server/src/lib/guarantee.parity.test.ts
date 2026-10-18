import { describe, expect, test } from 'bun:test'
import * as server from './guarantee.js'

// The apps' twin lives in packages/core, which the server does not depend on.
// Loaded by path at run time (a computed specifier, so the server's TypeScript
// build never tries to compile a file outside src/). What the claim screen,
// the checkout badge and Help say must be what the API decides.
const coreUrl = new URL('../../../../packages/core/src/guarantee.ts', import.meta.url).href

type Core = {
  GUARANTEE_RULES: Record<string, number>
  GUARANTEE_ISSUES: readonly string[]
  ISSUE_LABELS: Record<string, string>
  CLAIM_STATUS_LABELS: Record<string, string>
}

describe('guarantee parity', () => {
  test('every number the apps show is the API’s', async () => {
    const core = (await import(coreUrl)) as Core
    for (const [key, value] of Object.entries(core.GUARANTEE_RULES)) {
      expect([key, value]).toEqual([key, (server.GUARANTEE_RULES as unknown as Record<string, number>)[key]])
    }
  })

  test('the same list of what can be wrong, with the same words', async () => {
    const core = (await import(coreUrl)) as Core
    expect([...core.GUARANTEE_ISSUES]).toEqual([...server.GUARANTEE_ISSUES])
    expect(core.ISSUE_LABELS).toEqual(server.ISSUE_LABELS)
  })

  test('a label for every status the API has', async () => {
    const core = (await import(coreUrl)) as Core
    expect(Object.keys(core.CLAIM_STATUS_LABELS).sort()).toEqual([...server.CLAIM_STATUSES].sort())
  })
})
