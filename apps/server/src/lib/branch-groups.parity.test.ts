import { describe, expect, test } from 'bun:test'
import * as server from './branch-groups.js'

// The admin panel names a group before it exists ("Joins the Shine Auto Spa
// group") with core's twin of the server's rule.
const coreUrl = new URL('../../../../packages/core/src/branches.ts', import.meta.url).href
// Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/).
type Core = { groupNameOf(name: string): string; branchLabelOf(name: string): string }
const core = (await import(coreUrl)) as Core

const NAMES = [
  'Shine Auto Spa – Anna Nagar',
  'Shine Auto Spa - Velachery',
  'Shine Auto Spa — OMR',
  'A1 Cars – T. Nagar - West',
  'Auto-Kraft Detailing',
  '  Revathi Auto Spa  ',
  '– Velachery',
  'Spa -',
]

describe('branch names: core and server agree', () => {
  test.each(NAMES)('%p', (name) => {
    expect(core.groupNameOf(name)).toBe(server.groupNameOf(name))
    expect(core.branchLabelOf(name)).toBe(server.branchLabelOf(name))
  })
})
