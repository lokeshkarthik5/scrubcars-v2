/**
 * The rules behind the admin bookings screens: finding a booking from
 * whatever ops has in hand, how long a request has been waiting, which
 * bookings ops may cancel, and when a no-show can be marked.
 *
 * Pure and clock-free (callers pass `now`), so every rule is unit-tested
 * without a database.
 */

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const IST_OFFSET = '+05:30'

/**
 * The short booking number customers and garages see ("3F2A9C1B"), which is
 * what they read out on a call. Same rule as the apps and the Telegram alerts.
 */
export function bookingReference(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

/** What a search box entry can be matched against. */
export interface BookingSearch {
  /** The trimmed text, matched against customer and garage names. */
  text: string
  /** Lowercase id prefix, when the text could be a booking reference. */
  idPrefix: string | null
  /** Digits to match a customer phone against, when the text looks like one. */
  phoneDigits: string | null
  /**
   * A receipt number in its stored shape ("DTL/26-27/000123"), when the text
   * is exactly one, however it was written: a customer quotes it from their
   * receipt, or sends the PDF named after it.
   */
  receiptNumber: string | null
}

/**
 * Reads a search box entry.
 *
 * Ops gets a booking reference read out as "hash three F two A…", a phone
 * number in whatever format the caller used, a receipt number, or a name —
 * and has no way to say which. So the text is matched every way it plausibly
 * could be, and the repository ORs them together.
 *
 * Four characters is the shortest reference prefix accepted: shorter would
 * match a large slice of all bookings and is never what someone meant.
 */
export function parseBookingSearch(
  q: string | null | undefined
): BookingSearch | null {
  const text = (q ?? '').trim()
  if (!text) return null

  const ref = text.replace(/^#/, '').toLowerCase()
  const idPrefix = /^[0-9a-f]{4}[0-9a-f-]{0,32}$/.test(ref) ? ref : null

  let phoneDigits: string | null = null
  if (/^[+\d\s()-]+$/.test(text)) {
    const digits = text.replace(/\D/g, '')
    // Stored numbers are ten digits with no country code, so "+91 98765…"
    // has to lose its prefix to match.
    const local =
      digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
    phoneDigits = local.length >= 4 ? local : null
  }

  // Whole numbers only: a part of one, like "26-27", would match a year's
  // worth. The separators are not, because the number reaches ops in more
  // than one shape. Printed it is "DTL/26-27/000123" (formatReceiptSerial,
  // lib/receipts.ts), but a saved PDF is named "Detlio receipt
  // DTL-26-27-000123" (a file name cannot hold a slash), and a customer
  // usually sends that PDF on WhatsApp, which shows the file name. Read out
  // on a call it gets typed with spaces. So any run of spaces, slashes or
  // hyphens is accepted between the parts, and the number is rebuilt in the
  // stored shape.
  const receipt = text.match(
    /^(?:detlio\s+receipt\s+)?DTL[\s/-]*(\d{2})[\s/-]*(\d{2})[\s/-]*(\d{6})(?:\.pdf)?$/i
  )
  const receiptNumber = receipt
    ? `DTL/${receipt[1]}-${receipt[2]}/${receipt[3]}`
    : null

  return { text, idPrefix, phoneDigits, receiptNumber }
}

/** A LIKE pattern that matches `text` anywhere, with its own wildcards made literal. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

/**
 * Where the next page of the bookings list starts: just after the last row
 * the previous page ended on, in the list's own order (scheduled time, then
 * id, both newest first).
 *
 * A position rather than an offset because the list refreshes every 30
 * seconds while new bookings keep arriving. With an offset, a booking that
 * sorts above the boundary pushes the last row of page 1 onto page 2, so it
 * shows twice; a booking that leaves a filtered list pulls a row back across
 * the boundary, so it never shows. A position is where it is regardless.
 */
export interface BookingListCursor {
  scheduledAt: Date
  id: string
}

const CURSOR_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/**
 * Reads a cursor of the form "<scheduledAt as ISO>_<id>", which the panel
 * builds from the last row it has. Null for anything else.
 */
export function parseBookingListCursor(
  cursor: string
): BookingListCursor | null {
  const match = CURSOR_PATTERN.exec(cursor)
  if (!match) return null
  const scheduledAt = new Date(match[1]!)
  if (Number.isNaN(scheduledAt.getTime())) return null
  return { scheduledAt, id: match[2]!.toLowerCase() }
}

/**
 * Whether "2026-02-31" is a day that exists. The shape alone lets through
 * months past 12, which make an Invalid Date that fails deep in the query,
 * and days past the month's end, which roll silently into the next month.
 */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

/**
 * Minutes a pending booking has waited for its garage, or null for any other
 * status.
 *
 * Waiting starts at the later of creation and payment — the same rule as the
 * Telegram digest — so a rescheduled booking (a new row carrying an old
 * payment) counts from the move, and one paid late counts from the payment.
 */
export function waitingMinutes(
  booking: { status: string; createdAt: Date; paidAt?: Date | null },
  now: number
): number | null {
  if (booking.status !== 'pending') return null
  const since = Math.max(
    booking.createdAt.getTime(),
    booking.paidAt?.getTime() ?? 0
  )
  return Math.max(0, Math.floor((now - since) / MINUTE_MS))
}

/**
 * What ops may cancel. A completed job is history, and a cancelled or
 * rescheduled one is already off.
 */
export const ADMIN_CANCELLABLE_STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
] as const

export function isAdminCancellable(
  status: string
): status is (typeof ADMIN_CANCELLABLE_STATUSES)[number] {
  return (ADMIN_CANCELLABLE_STATUSES as readonly string[]).includes(status)
}

/**
 * Only an accepted booking can be a no-show: a pending one was never agreed,
 * so nobody failed to turn up for it.
 */
export const NO_SHOW_STATUSES = ['confirmed', 'in_progress'] as const

export type NoShowCheck = 'ok' | 'wrong_status' | 'too_early'

/**
 * Whether a no-show can be marked now. Before the start time nobody has
 * failed to turn up yet, and marking one early would let a customer no-show
 * (which keeps their money) be recorded while they are still on their way.
 */
export function checkNoShow(
  booking: { status: string; scheduledAt: Date },
  now: number
): NoShowCheck {
  if (!(NO_SHOW_STATUSES as readonly string[]).includes(booking.status))
    return 'wrong_status'
  if (now < booking.scheduledAt.getTime()) return 'too_early'
  return 'ok'
}

/**
 * IST calendar dates ("2026-10-04") as the half-open instant range they
 * cover: from the start of `from` up to, not including, the day after `to`.
 * Ops thinks in Chennai days, and a booking at 2 am IST is still "today" there
 * even though it is yesterday in UTC.
 */
export function istDateRange(
  from?: string,
  to?: string
): { start: Date | null; end: Date | null } {
  return {
    start: from ? new Date(`${from}T00:00:00${IST_OFFSET}`) : null,
    end: to
      ? new Date(new Date(`${to}T00:00:00${IST_OFFSET}`).getTime() + DAY_MS)
      : null,
  }
}

const PARTY_LABEL = {
  customer: 'the customer',
  garage: 'the garage',
} as const

/**
 * The internal note an admin cancellation leaves behind, so the notes read as
 * a complete history of what ops did to a booking.
 */
export function adminCancellationNote(
  onBehalfOf: 'customer' | 'garage' | 'detlio',
  reason: string
): string {
  const who =
    onBehalfOf === 'detlio'
      ? "Cancelled by Detlio's own decision."
      : `Cancelled on behalf of ${PARTY_LABEL[onBehalfOf]}.`
  return `${who} Reason: ${reason}`
}

/**
 * The internal note a no-show leaves behind. It states the money consequence
 * outright, because that is what the next person reading it needs to act on.
 */
export function noShowNote(
  party: 'customer' | 'garage',
  note?: string | null
): string {
  const what =
    party === 'customer'
      ? "Marked as a customer no-show. Payment kept, no refund (the customer didn't turn up for an accepted booking)."
      : 'Marked as a garage no-show. Refund the customer in full in Razorpay.'
  const extra = note?.trim()
  return extra ? `${what}\n${extra}` : what
}
