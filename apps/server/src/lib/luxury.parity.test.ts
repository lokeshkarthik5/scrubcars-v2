import { describe, expect, test } from 'bun:test'
import * as server from './luxury.js'

// The garage app's form and admin read the brands, the limits and the wait
// from core; the API refuses by the server's. They must be the same.
const coreUrl = new URL('../../../../packages/core/src/luxury.ts', import.meta.url).href
// Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/).
type Core = {
  LUXURY_MAKES: readonly string[]
  LUXURY_BRANDS: readonly string[]
  LUXURY_LIMITS: Record<string, number>
  LUXURY_STATUSES: readonly string[]
}
const core = (await import(coreUrl)) as Core

describe('luxury specialists: core and server agree', () => {
  test('the makes and the brands, in order', () => {
    expect([...core.LUXURY_MAKES]).toEqual([...server.LUXURY_MAKES])
    expect([...core.LUXURY_BRANDS]).toEqual([...server.LUXURY_BRANDS])
  })

  test('the limits and the wait', () => {
    expect(core.LUXURY_LIMITS).toEqual({ ...server.LUXURY_RULES })
  })

  test('the statuses', () => {
    expect([...core.LUXURY_STATUSES]).toEqual([...server.LUXURY_STATUSES])
  })
})
