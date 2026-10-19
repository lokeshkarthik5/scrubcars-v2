/**
 * The six status colours and what each one means, the same on every screen
 * of all three apps (the UX audit's consistency system). Each tone is a
 * tint, a text colour and a dot in packages/ui/styles/globals.css
 * (`--color-tone-*`), drawn by StatusChip; the label always goes with the
 * colour, so no state is told by colour alone.
 */
export type StatusTone =
  'new' | 'progress' | 'done' | 'attention' | 'late' | 'closed'

/** One line each, for a legend. */
export const STATUS_TONE_MEANING: Record<StatusTone, string> = {
  new: 'Waiting for the garage to answer. The only red status.',
  progress: 'Accepted or being worked on.',
  done: 'Finished or paid. Green only ever means done.',
  attention: 'A problem to fix: rejected, overdue, or the last few minutes.',
  late: "Past its time, or can't be undone.",
  closed: 'Cancelled, moved or no longer active.',
}

const BOOKING_TONES: Record<string, StatusTone> = {
  pending: 'new',
  confirmed: 'progress',
  in_progress: 'progress',
  completed: 'done',
  cancelled: 'closed',
  rescheduled: 'closed',
}

/** A booking's status as a tone. Anything unknown is `closed`, the quiet one. */
export function bookingStatusTone(status: string): StatusTone {
  return Object.hasOwn(BOOKING_TONES, status) ? BOOKING_TONES[status] : 'closed'
}
