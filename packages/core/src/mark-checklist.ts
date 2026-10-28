/**
 * Marks as a checklist (owner, 28 Oct 2026; mockup marks-checklist): the
 * apps' side. The rules that decide what is stored (merging an edited list,
 * ticking one item) are the server's, in apps/server/src/lib/mark-checklist.ts;
 * the parts both read are twinned here and pinned by
 * mark-checklist.parity.test.ts: the limits, reading an old note's "- " lines
 * as items, progress and the status the ticks give.
 *
 * Ready-made lists and the call sheet's quick answers are only the panel's.
 */
import { splitListText } from './list-text'

export interface MarkChecklistItem {
  id: string
  text: string
  done: boolean
  /** The garage's answer, in a few words. */
  answer: string | null
  /** Who ticked or answered it last, and when (ISO). */
  answeredBy: string | null
  answeredAt: string | null
}

export const CHECKLIST_LIMITS = {
  items: 30,
  textMax: 120,
  answerMax: 200,
} as const

export type MarkStatus = 'to_ask' | 'asked' | 'received'

/** The id an item read from an old note gets: stable, so a tick can name it. */
export const noteItemId = (index: number) => `note-${index + 1}`

/**
 * A mark as the team reads it: its stored items, or, with none stored, the
 * "- " lines of its note as items (and the note without them).
 */
export function readChecklist(row: { items: MarkChecklistItem[] | null | undefined; note: string | null }): {
  items: MarkChecklistItem[]
  note: string | null
  /** The items came from the note and are not stored yet. */
  fromNote: boolean
} {
  const stored = Array.isArray(row.items) ? row.items : []
  if (stored.length > 0) return { items: stored, note: row.note, fromNote: false }
  const { intro, points } = splitListText(row.note)
  if (points.length === 0) return { items: [], note: row.note, fromNote: false }
  return {
    items: points.slice(0, CHECKLIST_LIMITS.items).map((text, index) => ({
      id: noteItemId(index),
      text: text.slice(0, CHECKLIST_LIMITS.textMax),
      done: false,
      answer: null,
      answeredBy: null,
      answeredAt: null,
    })),
    note: intro || null,
    fromNote: true,
  }
}

/** "N of M checked". */
export function checklistProgress(items: readonly Pick<MarkChecklistItem, 'done'>[]): {
  done: number
  total: number
} {
  return { done: items.filter((item) => item.done).length, total: items.length }
}

/**
 * The status the ticks give a mark: Received when every item is ticked,
 * Asked when some are (or, from Received, when one is unticked again), and
 * otherwise the mark's own. No items: the mark's own.
 */
export function statusForChecklist(current: MarkStatus, items: readonly Pick<MarkChecklistItem, 'done'>[]): MarkStatus {
  if (items.length === 0) return current
  const { done, total } = checklistProgress(items)
  if (done === total) return 'received'
  if (done > 0) return 'asked'
  return current === 'received' ? 'asked' : current
}

// ─── The panel's own ─────────────────────────────────────────────────────────

/** "1 of 4 checked". */
export function progressText(items: readonly Pick<MarkChecklistItem, 'done'>[]): string {
  const { done, total } = checklistProgress(items)
  return `${done} of ${total} checked`
}

/**
 * A ready-made list for the edit dialog's chips ("Start from a list"). The
 * items are only a start: the team edits them before saving.
 */
export interface ChecklistTemplate {
  name: string
  items: readonly string[]
}

export const CHECKLIST_TEMPLATES: readonly ChecklistTemplate[] = [
  {
    name: 'New garage call',
    items: ['At-garage services?', 'Doorstep radius', 'Pickup & drop radius (already doorstep?)', 'Payout details'],
  },
  {
    name: 'Doorstep checks',
    items: ['At-garage services?', 'Doorstep radius?', 'Pickup & drop radius?'],
  },
  {
    name: 'Payout setup',
    items: ['Bank account or UPI?', 'Account holder name', 'Payout details'],
  },
  {
    name: 'Photos & logo',
    items: ['Garage photos (3 or more)', 'Logo', 'Photos of their work'],
  },
  {
    name: 'Pickup & drop',
    items: ['Offers pickup & drop?', 'Pickup radius', 'Agreement signed?'],
  },
]

/**
 * The call sheet's quick-answer chips for an item, from its words: a radius
 * gets distances, payout details how they will come, and a question Yes or
 * No. Anything else is answered in the text box.
 */
export function quickAnswers(text: string): readonly string[] {
  const lower = text.toLowerCase()
  if (lower.includes('doorstep radius')) return ['No doorstep', '3 km', '5 km', '10 km']
  if (lower.includes('radius')) return ['No', '3 km', '5 km', '10 km']
  if (lower.includes('payout') || lower.includes('bank') || lower.includes('upi')) {
    return ['Will send on WhatsApp', 'Bank', 'UPI']
  }
  if (lower.trim().endsWith('?')) return ['Yes', 'No']
  return []
}

/**
 * The mark's status word with a checklist: "In progress" while some items
 * are ticked and some are not; otherwise null, and the mark's own word
 * stands.
 */
export function checklistStatusWord(items: readonly Pick<MarkChecklistItem, 'done'>[]): string | null {
  const { done, total } = checklistProgress(items)
  return total > 0 && done > 0 && done < total ? 'In progress' : null
}
