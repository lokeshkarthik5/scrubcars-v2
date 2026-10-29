import { describe, expect, test } from 'bun:test'
import * as server from './mark-checklist.js'

const coreUrl = new URL('../../../../packages/core/src/mark-checklist.ts', import.meta.url).href

type Shared = Pick<
  typeof server,
  'CHECKLIST_LIMITS' | 'noteItemId' | 'readChecklist' | 'checklistProgress' | 'statusForChecklist'
>

const NOTES = [null, '', 'Plain note', 'Intro\n- A\n- B', '- only\n• bullet', `${'- x\n'.repeat(40)}`]
const STATUSES = ['to_ask', 'asked', 'received'] as const
const LISTS = [[], [{ done: false }], [{ done: true }, { done: false }], [{ done: true }, { done: true }]]

describe('mark checklist parity', () => {
  test('the apps read a mark and its status the way the server does', async () => {
    const core = (await import(coreUrl)) as Shared
    expect(core.CHECKLIST_LIMITS).toEqual(server.CHECKLIST_LIMITS)
    expect(core.noteItemId(0)).toBe(server.noteItemId(0))
    for (const note of NOTES) {
      expect(core.readChecklist({ items: [], note })).toEqual(server.readChecklist({ items: [], note }))
    }
    for (const status of STATUSES) {
      for (const list of LISTS) {
        expect(core.statusForChecklist(status, list)).toBe(server.statusForChecklist(status, list))
        expect(core.checklistProgress(list)).toEqual(server.checklistProgress(list))
      }
    }
  })
})
