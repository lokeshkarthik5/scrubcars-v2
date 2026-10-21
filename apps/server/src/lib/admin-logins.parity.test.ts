import { describe, expect, test } from 'bun:test'
import * as server from './admin-logins.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/).
const coreUrl = new URL('../../../../packages/core/src/admin-logins.ts', import.meta.url).href

type Core = typeof server

const SAMPLES = ['', 'ab', 'Raga', ' raga ', 'raga.k', '-raga', 'ra ga', 'r'.repeat(41), 'owner_1', 'ÄDMIN']
const NAMES = ['', 'R', 'Raga', '  Raga   K  ', 'Raga\nOps', 'x'.repeat(61)]
const PASSWORDS = ['', 'short', '          ', 'long enough!', 'p'.repeat(201)]

describe('admin logins parity', () => {
  test('the limits, the rules and the words are the same', async () => {
    const core = (await import(coreUrl)) as Core
    expect(core.ADMIN_LOGIN_LIMITS).toEqual(server.ADMIN_LOGIN_LIMITS)
    expect(core.ADMIN_USERNAME_RE.source).toBe(server.ADMIN_USERNAME_RE.source)
    for (const value of SAMPLES) {
      expect(core.normalizeAdminUsername(value)).toBe(server.normalizeAdminUsername(value))
      expect(core.adminUsernameProblem(value)).toBe(server.adminUsernameProblem(value))
    }
    for (const value of NAMES) {
      expect(core.normalizeAdminName(value)).toBe(server.normalizeAdminName(value))
      expect(core.adminNameProblem(value)).toBe(server.adminNameProblem(value))
    }
    for (const value of PASSWORDS) expect(core.adminPasswordProblem(value)).toBe(server.adminPasswordProblem(value))
  })

  test('the username rule matches the 0058 CHECK', () => {
    expect(server.ADMIN_USERNAME_RE.source).toBe('^[a-z0-9][a-z0-9._-]{2,39}$')
    expect(server.adminUsernameProblem(' Raga ')).toBeNull()
    expect(server.normalizeAdminUsername(' Raga ')).toBe('raga')
    expect(server.adminUsernameProblem('ra ga')).not.toBeNull()
    expect(server.normalizeAdminName('  Raga\n K ')).toBe('Raga K')
  })
})
