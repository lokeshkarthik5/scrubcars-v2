import { describe, expect, test } from 'bun:test'
import {
  BREAK_GLASS_SUBJECT,
  canDeleteAnything,
  personalAdminSubject,
  personalLoginId,
  userIdFromSubject,
} from './admin-actor.js'

const ID = 'e2e00000-0000-4000-8000-000000004100'

describe('admin subjects', () => {
  test('a personal login round-trips through its subject', () => {
    expect(personalAdminSubject(ID)).toBe(`admin:${ID}`)
    expect(personalLoginId(personalAdminSubject(ID))).toBe(ID)
  })

  test('only a personal subject with a real id names a login', () => {
    for (const subject of [BREAK_GLASS_SUBJECT, ID, 'admin:', 'admin:not-a-uuid', `admin:${ID}x`, `xadmin:${ID}`]) {
      expect(personalLoginId(subject)).toBeNull()
    }
  })

  test('only a bare uuid is a users id: never the shared or a personal login', () => {
    expect(userIdFromSubject(ID)).toBe(ID)
    expect(userIdFromSubject(BREAK_GLASS_SUBJECT)).toBeNull()
    expect(userIdFromSubject(personalAdminSubject(ID))).toBeNull()
  })
})

describe('who may delete anything (owner, 10 Nov 2026)', () => {
  test('the owner\'s login and the shared break-glass login may', () => {
    expect(canDeleteAnything({ kind: 'personal', isOwner: true })).toBe(true)
    expect(canDeleteAnything({ kind: 'shared', isOwner: false })).toBe(true)
  })

  test('another personal login or a member admin may not', () => {
    expect(canDeleteAnything({ kind: 'personal', isOwner: false })).toBe(false)
    expect(canDeleteAnything({ kind: 'member', isOwner: false })).toBe(false)
  })
})
