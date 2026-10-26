import type {
  AdminBooking,
  AdminBookingPickup,
  CancelledOnBehalfOf,
} from '@repo/core/api/admin'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { csvCell, downloadCsv } from '@repo/core/csv'
import type { BookingType } from '@repo/core/types'
import {
  formatClock as sharedFormatClock,
  formatWhen as sharedFormatWhen,
} from '@repo/core/format'
import { APP_TIMEZONE } from '@repo/core/utils'
import { formatMoney } from './format'

/**
 * Wording and small rules shared by the admin bookings list and detail pages.
 * Admin-only, so it lives in the app rather than in @repo/core.
 */

/**
 * A paid booking waiting this long for its garage is worth a call. The same
 * threshold as the Telegram nudge (NUDGE_AFTER_MINS in pending-digest.ts), so
 * the screen and the alert agree about what "too long" means.
 */
export const WAITING_ALERT_MINS = 30

/** "At garage", "Doorstep", "Pickup & drop", for a type as the API sends it. */
export function bookingTypeLabel(type: string): string {
  return BOOKING_TYPE_LABELS[type as BookingType] ?? BOOKING_TYPE_LABELS.dropin
}

/**
 * Where a pickup & drop car is, for the list row: its latest handover step
 * and when ("Out for delivery · Sun 4 Oct, 3:30 pm"). Null before pickup.
 */
export function pickupStepLine(pickup: AdminBookingPickup): string | null {
  const latest: Array<[string, string | null]> = [
    ['Delivered', pickup.deliveredAt],
    ['Out for delivery', pickup.outForDeliveryAt],
    ['At garage', pickup.atGarageAt],
    ['Picked up', pickup.pickedUpAt],
  ]
  const step = latest.find(([, at]) => at)
  return step ? `${step[0]} · ${formatWhen(step[1]!)}` : null
}

/** "45 min", "1 h 20 min", "3 h". */
export function formatWaiting(mins: number): string {
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/**
 * "Sun 4 Oct, 3:30 pm" in Chennai time, for a spreadsheet: always the date,
 * never "Today", since a sheet is read on another day. Assembled from parts,
 * as the Telegram alerts do, because whole-string toLocaleString punctuation
 * differs between browsers.
 */
const WHEN_PARTS = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: APP_TIMEZONE,
})

export function formatWhenForSheet(iso: string): string {
  const parts = WHEN_PARTS.formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}, ${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`
}

/**
 * On screen: "Today · 3:30 pm", "Tomorrow · 9:00 am", "Sun 4 Oct · 3:30 pm",
 * the shared rule of every app (@repo/core/format, quick win 7).
 */
export function formatWhen(iso: string): string {
  return sharedFormatWhen(iso)
}

/** "3:42 pm" in Chennai: when a screen last heard from the server. */
export function formatClock(at: number): string {
  return sharedFormatClock(new Date(at))
}

/** "₹1,299", "₹758.40": whole rupees with Indian grouping, paise only when there are any. */
export function formatRupees(amount: string | number): string {
  return formatMoney(amount)
}

/** The list's own URL params: its search and filters, and nothing else. */
const LIST_PARAMS = ['q', 'status', 'garage', 'from', 'to', 'test'] as const

/**
 * The list's search and filters as a query string, to carry to a booking and
 * back. Only the list's own params are kept, so the round trip can't grow.
 */
export function listQueryForDetail(params: {
  get(name: string): string | null
}): string {
  const kept = new URLSearchParams()
  for (const key of LIST_PARAMS) {
    const value = params.get(key)
    if (value) kept.set(key, value)
  }
  return kept.toString()
}

/**
 * Where a booking's back arrow goes: the list as ops left it, from the
 * `back` param the list's row link added. The value is re-read through
 * listQueryForDetail rather than used as given, so a hand-made link can only
 * ever change the list's filters, never send the arrow somewhere else.
 */
export function bookingsListHref(back: string | null | undefined): string {
  const query = back ? listQueryForDetail(new URLSearchParams(back)) : ''
  return query ? `/bookings?${query}` : '/bookings'
}

/** What ops may cancel. Mirrors ADMIN_CANCELLABLE_STATUSES on the server. */
export function canCancel(status: string): boolean {
  return (
    status === 'pending' || status === 'confirmed' || status === 'in_progress'
  )
}

/**
 * Whether "Mark no-show" is offered: an accepted booking whose start time has
 * passed. Mirrors checkNoShow on the server, which still has the final say.
 */
export function canMarkNoShow(
  booking: Pick<AdminBooking, 'status' | 'scheduledAt'>,
  now: number
): boolean {
  return (
    (booking.status === 'confirmed' || booking.status === 'in_progress') &&
    now >= Date.parse(booking.scheduledAt)
  )
}

export const ON_BEHALF_OF_OPTIONS: Array<{
  value: CancelledOnBehalfOf
  label: string
}> = [
  { value: 'customer', label: 'The customer' },
  { value: 'garage', label: 'The garage' },
  { value: 'detlio', label: 'Detlio' },
]

/** Who cancelled a booking, in one line. Null when it is not cancelled. */
export function cancellationLabel(
  booking: Pick<
    AdminBooking,
    'status' | 'cancelledBy' | 'cancelledOnBehalfOf' | 'noShow'
  > &
    Partial<Pick<AdminBooking, 'notAcceptedInTime'>>
): string | null {
  if (booking.status !== 'cancelled') return null
  if (booking.noShow === 'customer') return 'Customer no-show'
  if (booking.noShow === 'garage') return 'Garage no-show'
  // The cron cancelled it for the garage (0042): its side, like a decline,
  // but nobody at the garage pressed anything.
  if (booking.cancelledBy === 'vendor' && booking.notAcceptedInTime)
    return 'Not accepted in time'
  switch (booking.cancelledBy) {
    case 'admin':
      // "At … request", the same words the customer and garage apps use,
      // because "for the garage" reads as either for its benefit or at its
      // cost, and this line decides who is blamed and who is refunded.
      return booking.cancelledOnBehalfOf === 'customer'
        ? "Cancelled by Detlio at the customer's request"
        : booking.cancelledOnBehalfOf === 'garage'
          ? "Cancelled by Detlio at the garage's request"
          : 'Cancelled by Detlio'
    case 'user':
      return 'Cancelled by the customer'
    case 'vendor':
      return 'Declined by the garage'
    default:
      return 'Cancelled'
  }
}

/** "Paid", "Pending", … for a payment status. */
export function paymentStatusLabel(status: string | undefined): string {
  if (!status) return 'No payment'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

// One CSV cell (a leading = + - @ defused) and saving a file: in
// @repo/core/csv since the garage portal's Earnings download uses them too.
// Re-exported so the admin's exports keep importing them from here.
export { csvCell, downloadCsv }

/**
 * A phone number as a spreadsheet will keep it. Excel and Sheets read a bare
 * run of digits as a number, which drops a landline's leading 0, so the digits
 * are grouped with a space the way they are said aloud: "98765 43210",
 * "044 2345 6789". Not "+91…": csvCell would defuse the "+" with an
 * apostrophe, which then shows in the cell.
 */
export function phoneForSheet(phone: string | null | undefined): string | null {
  if (!phone) return null
  // Anything that isn't just a number as typed (an extension, a note) is
  // left alone.
  if (!/^[+\d\s()-]+$/.test(phone)) return phone
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0'))
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits
}

const CSV_COLUMNS: Array<
  [string, (b: AdminBooking) => string | number | null]
> = [
  // With its "#", as it is read out everywhere else. The "#" also keeps it
  // text: a bare "12E45678" opens as 1.2E+46, and "01234567" loses its 0.
  ['Reference', (b) => `#${b.reference}`],
  ['Status', (b) => b.status],
  ['Type', (b) => bookingTypeLabel(b.bookingType)],
  ['Scheduled (IST)', (b) => formatWhenForSheet(b.scheduledAt)],
  ['Booked (IST)', (b) => formatWhenForSheet(b.createdAt)],
  ['Waiting (min)', (b) => b.waitingMins],
  ['Garage', (b) => b.garage?.name ?? null],
  ['Garage phone', (b) => phoneForSheet(b.garage?.phone)],
  ['Customer', (b) => b.customer?.name ?? null],
  ['Customer phone', (b) => phoneForSheet(b.customer?.phone)],
  ['Address', (b) => b.address],
  ['Car', (b) => (b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : null)],
  ['Plate', (b) => b.vehicle?.plate ?? null],
  ['Services', (b) => b.items.map((item) => item.name).join(' + ')],
  ['Amount', (b) => Number(b.amount)],
  ['Payment', (b) => b.payment?.status ?? null],
  ['Razorpay payment id', (b) => b.payment?.gatewayTxnId ?? null],
  // Money still owed back, and given back, on the booking and its bills.
  ['Refund owed', (b) => (b.refundOwed ? Number(b.refundOwed) : null)],
  ['Refunded', (b) => (b.refunded ? Number(b.refunded) : null)],
  ['Cancelled', (b) => cancellationLabel(b)],
  ['Reason', (b) => b.cancellationReason],
  ['Notes', (b) => b.notesCount],
]

/** The rows on screen as a CSV file's text, header first. */
export function bookingsCsv(rows: AdminBooking[]): string {
  const lines = [
    CSV_COLUMNS.map(([header]) => csvCell(header)).join(','),
    ...rows.map((row) =>
      CSV_COLUMNS.map(([, read]) => csvCell(read(row))).join(',')
    ),
  ]
  // CRLF is what RFC 4180 and Excel expect.
  return `${lines.join('\r\n')}\r\n`
}

/** Today in Chennai as YYYY-MM-DD, for an export's filename. */
export function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}
