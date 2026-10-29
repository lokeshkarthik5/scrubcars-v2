import { describe, expect, test } from 'bun:test'
import {
  NOTE_EDIT_HOURS,
  noteEditRefusal,
  noteEditableUntil,
} from './booking-notes.js'

const AT = new Date('2026-10-29T10:00:00.000Z')
const later = (hours: number) => new Date(AT.getTime() + hours * 60 * 60 * 1000)
const typed = { kind: 'typed' as const, authorSub: 'admin:1', createdAt: AT }

describe('editing a booking note (0065)', () => {
  test('its author edits or deletes a typed note for 24 hours', () => {
    expect(NOTE_EDIT_HOURS).toBe(24)
    expect(noteEditRefusal(typed, 'admin:1', AT)).toBeNull()
    expect(noteEditRefusal(typed, 'admin:1', later(23.99))).toBeNull()
    expect(noteEditRefusal(typed, 'admin:1', later(24))).toBe('window_closed')
    expect(noteEditableUntil(AT)).toEqual(later(24))
  })

  test('nobody else, and never a note an action wrote', () => {
    expect(noteEditRefusal(typed, 'admin:2', AT)).toBe('not_author')
    expect(noteEditRefusal({ ...typed, authorSub: null }, 'admin:1', AT)).toBe(
      'not_author'
    )
    expect(
      noteEditRefusal(
        { kind: 'system', authorSub: null, createdAt: AT },
        'admin:1',
        AT
      )
    ).toBe('system_note')
  })
})
