import type { AdminBookingNote } from '@repo/core/api/admin'

/**
 * Whether this session may edit or delete a note (0065), as the API decides
 * it (apps/server/src/lib/booking-notes.ts): a typed note it wrote itself,
 * until 24 hours after it was written. A note an action wrote never changes.
 */
export function noteEditable(
  note: AdminBookingNote,
  mySub: string | null | undefined,
  now: number
): boolean {
  if (
    note.kind !== 'typed' ||
    !mySub ||
    note.authorSub !== mySub ||
    !note.editableUntil
  )
    return false
  return now < new Date(note.editableUntil).getTime()
}
