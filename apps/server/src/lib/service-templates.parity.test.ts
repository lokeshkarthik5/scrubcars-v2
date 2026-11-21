import { describe, expect, test } from 'bun:test'
import * as server from './service-templates.js'

// The admin editor hides a template a garage already has, and the API
// refuses a second template of the same name, by the same name rule; the
// panel's "New" is the API's 14 days.
const coreUrl = new URL('../../../../packages/core/src/service-templates.ts', import.meta.url).href
// Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/).
type Core = { serviceNameKey(name: string): string; TEMPLATE_NEW_DAYS: number }
const core = (await import(coreUrl)) as Core

const NAMES = ['Foam wash', '  FOAM-WASH ', 'Wheel alignment & balancing', 'AC service!', 'Engine-bay   Cleaning', '', '—']

describe('service templates: core and server agree', () => {
  test.each(NAMES)('%p', (name) => {
    expect(core.serviceNameKey(name)).toBe(server.serviceNameKey(name))
  })

  test('New lasts as long on both sides', () => {
    expect(core.TEMPLATE_NEW_DAYS).toBe(server.TEMPLATE_NEW_DAYS)
  })
})
