import { describe, expect, test } from 'bun:test'
import {
  CHECKLIST_LIMITS,
  checklistProgress,
  mergeChecklist,
  patchChecklistItem,
  readChecklist,
  statusForChecklist,
  type MarkChecklistItem,
} from './mark-checklist.js'

const NOW = new Date('2026-10-28T06:10:00Z')
const item = (id: string, over: Partial<MarkChecklistItem> = {}): MarkChecklistItem => ({
  id,
  text: `Item ${id}`,
  done: false,
  answer: null,
  answeredBy: null,
  answeredAt: null,
  ...over,
})
let seq = 0
const newId = () => `new-${++seq}`

describe('reading a mark', () => {
  test('stored items win; the note is left as it is', () => {
    const read = readChecklist({ items: [item('a')], note: '- not read' })
    expect(read).toEqual({ items: [item('a')], note: '- not read', fromNote: false })
  })

  test('with none stored, an old note’s "- " lines are its items, and the rest stays the note', () => {
    const read = readChecklist({ items: [], note: 'Owner busy till 5\n- Check doorstep\n- Ask radius' })
    expect(read.fromNote).toBe(true)
    expect(read.note).toBe('Owner busy till 5')
    expect(read.items.map((i) => [i.id, i.text, i.done])).toEqual([
      ['note-1', 'Check doorstep', false],
      ['note-2', 'Ask radius', false],
    ])
  })

  test('a note of only items leaves no note; one with no list is unchanged', () => {
    expect(readChecklist({ items: null, note: '- A' }).note).toBeNull()
    expect(readChecklist({ items: [], note: 'Plain' })).toEqual({ items: [], note: 'Plain', fromNote: false })
    expect(readChecklist({ items: [], note: null })).toEqual({ items: [], note: null, fromNote: false })
  })

  test('at most 30 items, each cut to 120 characters', () => {
    const note = Array.from({ length: 40 }, (_, i) => `- ${'x'.repeat(130)} ${i}`).join('\n')
    const read = readChecklist({ items: [], note })
    expect(read.items).toHaveLength(CHECKLIST_LIMITS.items)
    expect(read.items[0].text).toHaveLength(CHECKLIST_LIMITS.textMax)
  })
})

describe('status follows the ticks', () => {
  test('none, some and all ticked', () => {
    expect(checklistProgress([item('a', { done: true }), item('b')])).toEqual({ done: 1, total: 2 })
    expect(statusForChecklist('to_ask', [item('a'), item('b')])).toBe('to_ask')
    expect(statusForChecklist('asked', [item('a'), item('b')])).toBe('asked')
    expect(statusForChecklist('to_ask', [item('a', { done: true }), item('b')])).toBe('asked')
    expect(statusForChecklist('asked', [item('a', { done: true }), item('b', { done: true })])).toBe('received')
  })

  test('unticking a received mark reopens it as Asked; no items keeps the mark’s own', () => {
    expect(statusForChecklist('received', [item('a'), item('b')])).toBe('asked')
    expect(statusForChecklist('received', [item('a', { done: true }), item('b')])).toBe('asked')
    expect(statusForChecklist('received', [])).toBe('received')
    expect(statusForChecklist('to_ask', [])).toBe('to_ask')
  })
})

describe('saving the whole list', () => {
  test('kept items keep who answered; a changed tick or answer is stamped; new ones get ids', () => {
    const before = [
      item('a', { done: true, answer: 'Yes', answeredBy: 'Ravi', answeredAt: '2026-10-27T05:00:00.000Z' }),
      item('b'),
    ]
    const out = mergeChecklist(
      before,
      [
        { id: 'a', text: 'Item a renamed', done: true, answer: 'Yes' },
        { id: 'b', text: 'Item b', answer: '5 km' },
        { text: '  New   one ' },
        { text: '   ' },
      ],
      'Mathew',
      NOW,
      newId
    )
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ id: 'a', text: 'Item a renamed', answeredBy: 'Ravi', answeredAt: '2026-10-27T05:00:00.000Z' })
    expect(out[1]).toMatchObject({ id: 'b', answer: '5 km', done: false, answeredBy: 'Mathew', answeredAt: NOW.toISOString() })
    expect(out[2]).toMatchObject({ text: 'New one', done: false, answer: null, answeredBy: null })
    expect(out[2].id.startsWith('new-')).toBe(true)
  })

  test('an unknown or repeated id is a new item; a new ticked one is stamped; at most 30', () => {
    const out = mergeChecklist(
      [item('a')],
      [{ id: 'a', text: 'A' }, { id: 'a', text: 'A again' }, { id: 'zzz', text: 'Z', done: true }],
      'Mathew',
      NOW,
      newId
    )
    expect(out[0].id).toBe('a')
    expect(out[1].id).not.toBe('a')
    expect(out[2]).toMatchObject({ text: 'Z', done: true, answeredBy: 'Mathew' })
    const many = mergeChecklist([], Array.from({ length: 35 }, (_, i) => ({ text: `T${i}` })), 'M', NOW, newId)
    expect(many).toHaveLength(30)
  })

  test('answers are trimmed, cut to 200 and blank is none', () => {
    const out = mergeChecklist([], [{ text: 'A', answer: '   ' }, { text: 'B', answer: 'y'.repeat(250) }], 'M', NOW, newId)
    expect(out[0].answer).toBeNull()
    expect(out[0].answeredBy).toBeNull()
    expect(out[1].answer).toHaveLength(200)
  })
})

describe('one item at a time', () => {
  test('a tick or an answer is stamped; nothing changed changes no stamp; unknown is null', () => {
    const items = [item('a'), item('b', { done: true, answeredBy: 'Ravi', answeredAt: 'then' })]
    const ticked = patchChecklistItem(items, 'a', { done: true, answer: ' Yes ' }, 'Mathew', NOW)!
    expect(ticked[0]).toMatchObject({ done: true, answer: 'Yes', answeredBy: 'Mathew', answeredAt: NOW.toISOString() })
    expect(ticked[1]).toEqual(items[1])
    const same = patchChecklistItem(items, 'b', { done: true }, 'Mathew', NOW)!
    expect(same[1]).toEqual(items[1])
    expect(patchChecklistItem(items, 'zzz', { done: true }, 'M', NOW)).toBeNull()
    // Clearing an answer.
    const cleared = patchChecklistItem(ticked, 'a', { answer: null }, 'Mathew', NOW)!
    expect(cleared[0].answer).toBeNull()
  })
})
