import { describe, expect, test } from 'bun:test'
import { decoyHash, hashPassword, verifyPassword } from './passwords.js'

describe('passwords', () => {
  test('a hash checks against its own password and no other', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(hash).not.toContain('correct horse battery')
    expect(await verifyPassword('correct horse battery', hash)).toBe(true)
    expect(await verifyPassword('correct horse batterY', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  test('two hashes of one password differ (a fresh salt each time)', async () => {
    const [a, b] = await Promise.all([hashPassword('same password'), hashPassword('same password')])
    expect(a).not.toBe(b)
    expect(await verifyPassword('same password', b)).toBe(true)
  })

  test('anything that is not one of our hashes is a refusal, not a crash', async () => {
    for (const stored of ['', 'plain', 'scrypt$', 'scrypt$x$8$1$c2FsdA==$aGFzaA==', 'bcrypt$1$2$3$4$5', 'scrypt$1073741824$8$1$c2FsdA==$aGFzaA==']) {
      expect(await verifyPassword('anything', stored)).toBe(false)
    }
  })

  test('the decoy is a real hash nobody can match', async () => {
    const decoy = await decoyHash()
    expect(decoy).toBe(await decoyHash())
    expect(await verifyPassword('', decoy)).toBe(false)
  })
})
