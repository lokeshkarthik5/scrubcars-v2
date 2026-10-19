import { describe, expect, test } from 'bun:test'
import { BREAK_GLASS_SUBJECT, personalAdminSubject, personalLoginId, userIdFromSubject } from './admin-actor.js'

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
