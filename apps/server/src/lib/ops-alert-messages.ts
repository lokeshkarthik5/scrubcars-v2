/**
 * The words of each ops alert: what the Detlio team reads in its Telegram
 * group when something happens to a booking that a person may need to act on.
 *
 * Kept free of the app's env and database so it can be tested on its own.
 */

const APP_TIMEZONE = 'Asia/Kolkata'
const ADMIN_BOOKINGS_URL = 'https://admin.detlio.com/bookings'

/**
 * What an alert needs from a booking. Every booking row the service reloads
 * after a change (findBookingById) already carries this shape.
 */
export interface AlertBooking {
  id: string
  scheduledAt: Date
  bookingType: string
  amount: string
  vendor?: { businessName: string; phone: string } | null
  user?: { name: string } | null
  items?: Array<{ name: string }> | null
  service?: { name: string } | null
  payment?: { status: string } | null
}

export type OpsAlert =
  | { kind: 'booking_paid'; booking: AlertBooking }
  | { kind: 'garage_declined'; booking: AlertBooking; reason?: string | null }
  | { kind: 'customer_cancelled'; booking: AlertBooking; reason?: string | null }
  | { kind: 'rescheduled'; booking: AlertBooking; previousScheduledAt: Date }
  | {
      kind: 'pending_digest'
      now: Date
      waiting: DigestBooking[]
      missed: DigestBooking[]
    }
  | {
      kind: 'paid_no_booking'
      paymentId: string
      reason: string
      amount?: string
      garageName?: string
      scheduledAt?: Date
    }

/** A paid booking still waiting for its garage, as the digest lists it. */
export interface DigestBooking {
  id: string
  scheduledAt: Date
  bookingType: string
  waitingSince: Date
  garageName: string
  garagePhone: string
}

/** Rows per section: Telegram caps a message at 4096 characters. */
const DIGEST_MAX_ROWS = 10

/** The message text for an alert. Plain text, one fact per line. */
export function formatOpsAlert(alert: OpsAlert): string {
  switch (alert.kind) {
    case 'booking_paid': {
      const b = alert.booking
      return lines(
        `🆕 New paid booking #${reference(b.id)}`,
        garageLine(b),
        services(b),
        `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`,
        `${rupees(b.amount)} · Customer: ${firstName(b.user?.name)}`,
        'Waiting for the garage to accept.',
        ADMIN_BOOKINGS_URL
      )
    }

    case 'garage_declined': {
      const b = alert.booking
      const paid = isPaid(b)
      return lines(
        `❌ Garage declined #${reference(b.id)}${paid ? ' · refund due' : ''}`,
        garageLine(b),
        `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`,
        paid
          ? `${rupees(b.amount)} was paid. Refund it in Razorpay, and offer the customer another garage.`
          : 'Not paid online, so nothing to refund.',
        quoted('Garage wrote', alert.reason),
        ADMIN_BOOKINGS_URL
      )
    }

    case 'customer_cancelled': {
      const b = alert.booking
      const paid = isPaid(b)
      return lines(
        `↩️ Customer cancelled #${reference(b.id)}${paid ? ' · refund due' : ''}`,
        garageLine(b),
        `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`,
        paid
          ? `${rupees(b.amount)} was paid. Refund it in Razorpay.`
          : 'Not paid online, so nothing to refund.',
        quoted('Customer wrote', alert.reason),
        ADMIN_BOOKINGS_URL
      )
    }

    case 'rescheduled': {
      const b = alert.booking
      return lines(
        `🔁 Rescheduled #${reference(b.id)}`,
        garageLine(b),
        `${when(alert.previousScheduledAt)} → ${when(b.scheduledAt)}`,
        // A moved booking goes back to pending: the garage has to accept the
        // new time, and the 30-minute nudge covers it like any new booking.
        'Back to Requested: waiting for the garage to accept the new time.',
        ADMIN_BOOKINGS_URL
      )
    }

    case 'pending_digest': {
      const sections: string[] = []
      if (alert.waiting.length > 0) {
        sections.push(
          lines(
            `⏰ ${plural(alert.waiting.length, 'paid booking')} waiting for the garage to accept`,
            ...digestRows(alert.waiting, (b) =>
              `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)} · waiting ${duration(alert.now.getTime() - b.waitingSince.getTime())}`
            ),
            'Call the garage to accept or decline.'
          )
        )
      }
      if (alert.missed.length > 0) {
        sections.push(
          lines(
            `🚫 ${plural(alert.missed.length, 'booking')} reached its time without the garage accepting · refund due`,
            ...digestRows(alert.missed, (b) => `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`),
            "The garage can't accept these now. Ask it to decline, or the customer to cancel, then refund in Razorpay."
          )
        )
      }
      return lines(sections.join('\n\n'), ADMIN_BOOKINGS_URL)
    }

    case 'paid_no_booking':
      return lines(
        `⚠️ Payment taken, no booking · refund due`,
        `${alert.amount ? rupees(alert.amount) : 'Amount unknown'} · Razorpay payment ${alert.paymentId}`,
        alert.garageName ? `Garage: ${alert.garageName}` : null,
        alert.scheduledAt ? `Was for ${when(alert.scheduledAt)}` : null,
        `Why: ${FAILURE_REASONS[alert.reason] ?? alert.reason}`,
        'Refund this payment in Razorpay. The customer was told it would be refunded.'
      )
  }
}

/** The reasons failIntent records, as the team would say them. */
const FAILURE_REASONS: Record<string, string> = {
  intent_expired: 'the checkout expired before the payment went through',
  vehicle_double_booked: 'that car already had a booking at that time',
  discount_exhausted: 'the promo code ran out before the payment went through',
}

/**
 * Someone's own words, as one clearly quoted line under Detlio's.
 *
 * A reason is typed by a customer or a garage, and it lands in a group chat
 * that keeps everything: so it is flattened to one line (no faking a line of
 * Detlio's instructions), capped, and stripped of anything that reaches a
 * person or account — numbers, emails and UPI ids, links. The full text stays
 * on the booking for admin.
 */
const QUOTE_MAX = 120

export function quoted(label: string, text: string | null | undefined): string {
  const clean = (text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]')
    .replace(/\S+@\S+/g, '[id]')
    .replace(/\+?\d[\d\s-]{5,}\d/g, '[number]')
    .trim()
  if (!clean) return `${label}: no reason given.`
  const short = clean.length > QUOTE_MAX ? `${clean.slice(0, QUOTE_MAX - 1).trimEnd()}…` : clean
  return `${label}: "${short.replace(/"/g, "'")}"`
}

function digestRows(rows: DigestBooking[], detail: (b: DigestBooking) => string): string[] {
  const shown = rows.slice(0, DIGEST_MAX_ROWS).flatMap((b) => [
    `#${reference(b.id)} · ${b.garageName} · ${phone(b.garagePhone)}`,
    `   ${detail(b)}`,
  ])
  const more = rows.length - DIGEST_MAX_ROWS
  return more > 0 ? [...shown, `…and ${more} more`] : shown
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** "45 min", "1 h 20 min", "3 h". */
function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours === 0) return `${mins} min`
  return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`
}

function lines(...parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => !!part).join('\n')
}

/** The short booking number customers see ("#3F2A9C1B"), same as the apps. */
function reference(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

function garageLine(b: AlertBooking): string {
  if (!b.vendor) return 'Garage: unknown'
  return `${b.vendor.businessName} · ${phone(b.vendor.phone)}`
}

function services(b: AlertBooking): string {
  const names = (b.items ?? []).map((item) => item.name)
  if (names.length > 0) return names.join(' + ')
  return b.service?.name ?? 'Services unknown'
}

/**
 * "Sun 4 Oct, 3:30 pm" in Chennai time. Assembled from parts rather than taken
 * whole from toLocaleString, whose punctuation differs between ICU versions
 * (Node on Vercel vs Bun locally: "Sun, 4 Oct, 3:30 pm" vs "Sun, 4 Oct at 3:30 PM").
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

function when(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    WHEN_PARTS.formatToParts(date).find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}, ${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`
}

function modeLabel(bookingType: string): string {
  return bookingType === 'doorstep' ? 'Doorstep' : 'At garage'
}

function rupees(amount: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return `₹${amount}`
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/**
 * First name only: the team can look the customer up in admin when they need
 * to, and a chat app is no place to collect full names and numbers.
 */
function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'unnamed'
}

/** "+91 98765 00011" — the garage's business number, ready to tap. */
function phone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(-10)
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : raw
}

function isPaid(b: AlertBooking): boolean {
  return b.payment?.status === 'paid'
}
