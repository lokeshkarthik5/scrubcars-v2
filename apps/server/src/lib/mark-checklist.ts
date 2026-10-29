/**
 * Marks as a checklist (owner, 28 Oct 2026; mockup marks-checklist).
 *
 * One mark holds several things to find out. Whoever calls the garage goes
 * down the list, ticks each item and saves the answer, so the next person
 * sees what is settled and what is still open. Each tick keeps who answered
 * and when.
 *
 * - Stored as `vendor_onboarding_marks.items` (0064), a JSON array, at most
 *   30 items.
 * - A mark from before 0064 whose note has "- " lines reads those lines as
 *   its items (the rest of the note stays the note) until it is next changed,
 *   when they are saved as items: nothing is migrated in SQL.
 * - Status follows the ticks, on the marks' own three steps: nothing ticked
 *   keeps To ask; some ticked is Asked ("In progress" on screen); all ticked
 *   is Received, which closes the mark. A mark with no items keeps the status
 *   the team sets by hand, as before.
 *
 * Pure: the caller passes the clock and the signed-in name. The apps' twin
 * of the shared parts is packages/core/src/mark-checklist.ts
 * (mark-checklist.parity.test.ts).
 */
import { splitListText } from './list-text.js'

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

const clean = (value: string | null | undefined, max: number): string | null => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

/** An item as the team sent it (the edit dialog's list). */
export interface ItemInput {
  /** Absent for a new item. */
  id?: string
  text: string
  done?: boolean
  answer?: string | null
}

/**
 * The list the edit dialog saved, against what was there: items keep their
 * id and who answered them unless their tick or answer changed, which
 * stamps the signed-in name and the time. New items get a fresh id (from
 * `newId`). Blank items are dropped; at most 30.
 */
export function mergeChecklist(
  before: readonly MarkChecklistItem[],
  incoming: readonly ItemInput[],
  actorName: string,
  now: Date,
  newId: () => string
): MarkChecklistItem[] {
  const byId = new Map(before.map((item) => [item.id, item]))
  const out: MarkChecklistItem[] = []
  const seen = new Set<string>()
  for (const input of incoming) {
    const text = clean(input.text, CHECKLIST_LIMITS.textMax)
    if (!text) continue
    const old = input.id && !seen.has(input.id) ? byId.get(input.id) : undefined
    const done = input.done ?? old?.done ?? false
    const answer = input.answer === undefined ? (old?.answer ?? null) : clean(input.answer, CHECKLIST_LIMITS.answerMax)
    const changed = !old ? done || answer !== null : old.done !== done || old.answer !== answer
    const id = old ? old.id : newId()
    seen.add(id)
    out.push({
      id,
      text,
      done,
      answer,
      answeredBy: changed ? actorName : (old?.answeredBy ?? null),
      answeredAt: changed ? now.toISOString() : (old?.answeredAt ?? null),
    })
    if (out.length >= CHECKLIST_LIMITS.items) break
  }
  return out
}

/** One item ticked, unticked or answered (the checklist and call mode). */
export interface ItemPatch {
  done?: boolean
  answer?: string | null
}

/**
 * The list with one item changed, stamped with who and when; null when the
 * item is not on the list. A patch that changes nothing changes no stamp.
 */
export function patchChecklistItem(
  items: readonly MarkChecklistItem[],
  itemId: string,
  patch: ItemPatch,
  actorName: string,
  now: Date
): MarkChecklistItem[] | null {
  const index = items.findIndex((item) => item.id === itemId)
  if (index === -1) return null
  const old = items[index]
  const done = patch.done ?? old.done
  const answer = patch.answer === undefined ? old.answer : clean(patch.answer, CHECKLIST_LIMITS.answerMax)
  if (done === old.done && answer === old.answer) return [...items]
  const next = [...items]
  next[index] = { ...old, done, answer, answeredBy: actorName, answeredAt: now.toISOString() }
  return next
}
