/**
 * Booking notes (0065): the team's notes on a booking are of two kinds. A
 * `typed` note is what a person wrote with "Add note"; a `system` note is
 * what an action left behind (a cancel, a waiver, the Test mark, a pickup
 * override) and is the record of what ops did, so it never changes.
 *
 * The person who typed a note (the same session subject) may edit or delete
 * it for 24 hours after it was written; nobody else, and nobody after. Pure:
 * the caller passes now.
 */

export const NOTE_EDIT_HOURS = 24

export type NoteKind = 'typed' | 'system'

export type NoteEditRefusal = 'system_note' | 'not_author' | 'window_closed'

export function noteEditRefusal(
  note: { kind: NoteKind; authorSub: string | null; createdAt: Date },
  sub: string,
  now: Date
): NoteEditRefusal | null {
  if (note.kind !== 'typed') return 'system_note'
  if (!note.authorSub || note.authorSub !== sub) return 'not_author'
  if (now.getTime() >= noteEditableUntil(note.createdAt).getTime()) return 'window_closed'
  return null
}

/** The moment a typed note stops being editable. */
export function noteEditableUntil(createdAt: Date): Date {
  return new Date(createdAt.getTime() + NOTE_EDIT_HOURS * 60 * 60 * 1000)
}
