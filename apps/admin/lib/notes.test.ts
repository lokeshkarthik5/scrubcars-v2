import { describe, expect, test } from 'bun:test'
import { noteEditable } from './notes'

const NOW = Date.parse('2026-10-29T10:00:00Z')
const note = {
  id: 'n1',
  author: 'Mathew',
  body: 'Called',
  createdAt: '2026-10-29T09:00:00Z',
  kind: 'typed' as const,
  authorSub: 'admin:1',
  editedAt: null,
  editableUntil: '2026-10-30T09:00:00Z',
}

describe('a booking note\'s Edit and Delete (0065)', () => {
  test('only your own typed note, until its 24 hours are up', () => {
    expect(noteEditable(note, 'admin:1', NOW)).toBe(true)
    expect(noteEditable(note, 'admin:2', NOW)).toBe(false)
    expect(noteEditable(note, null, NOW)).toBe(false)
    expect(noteEditable(note, 'admin:1', Date.parse('2026-10-30T09:00:00Z'))).toBe(false)
    expect(noteEditable({ ...note, kind: 'system', authorSub: null, editableUntil: null }, 'admin:1', NOW)).toBe(false)
    // An older API sends no kind: never editable.
    expect(noteEditable({ id: 'n2', author: 'x', body: 'y', createdAt: note.createdAt }, 'admin:1', NOW)).toBe(false)
  })
})
