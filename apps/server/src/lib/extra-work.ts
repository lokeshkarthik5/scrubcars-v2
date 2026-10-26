/**
 * Extra work a garage asks for mid-job, approved by the customer paying it in
 * the app (0041), as pure rules. Clock-free.
 *
 * Owner decisions (17 Oct 2026):
 *
 *   - On a confirmed or in-progress booking the garage can ask: what (a short
 *     line), the price, up to three photos and an optional note. The customer
 *     sees it on Home and their booking and either pays it (that is the
 *     approval) or declines. Never on a booking with a service priced on
 *     inspection: that job already has the final bill for whatever the
 *     inspection finds.
 *   - It is a booking charge (`booking_charges`, kind 'extra_work'), paid
 *     like the final bill (lib/final-bill.ts: one Razorpay order per charge,
 *     settled conditionally by the app's verify and the webhook). Several
 *     per booking, at most three waiting for the customer at once.
 *   - The garage can withdraw one the customer has not paid. A paid one
 *     stands.
 *   - The job cannot be marked complete (or delivered) while one is still
 *     waiting for the customer: the garage withdraws it or waits for an
 *     answer. So nothing lapses on its own, and a customer is never asked to
 *     pay for work on a job that is already finished.
 *   - Money (lib/refunds.ts): paid extra work is kept only if the booking
 *     completes. If the booking ends any other way — cancelled by anyone,
 *     moved, or a no-show on either side — it is refunded, because the work
 *     was not delivered. A payment that lands on a withdrawn or declined
 *     request is refunded like any stray bill payment.
 *   - Commission and payouts treat paid extra work exactly like a paid final
 *     bill: part of the garage's price, charged at the rate of the booking's
 *     main service (lib/commission.ts), paid out with the booking.
 */
import type { PhotoLink } from './job-records.js'

/** The most requests waiting for the customer on one booking. */
export const EXTRA_WORK_MAX_OPEN = 3

/** The most photos on one request. */
export const EXTRA_WORK_MAX_PHOTOS = 3

/** "Replace front brake pads": short enough for one line on a phone. */
export const EXTRA_WORK_DESCRIPTION_MAX_CHARS = 80

/** The optional note, as long as the final bill's. */
export const EXTRA_WORK_NOTE_MAX_CHARS = 500

/** The booking statuses extra work can be asked on. */
const OPEN_STATUSES = new Set(['confirmed', 'in_progress'])

/** Why the garage cannot ask for extra work on a booking now. */
export type ExtraWorkRefusal =
  /** A service is priced on inspection: the final bill covers it. */
  | 'on_inspection'
  /** Not accepted yet, finished, cancelled or moved. */
  | 'not_open'
  /** Already EXTRA_WORK_MAX_OPEN waiting for the customer. */
  | 'too_many_open'

export function extraWorkRefusal(input: {
  status: string
  pricingTypes: string[]
  openCount: number
}): ExtraWorkRefusal | null {
  if (input.pricingTypes.includes('on_inspection')) return 'on_inspection'
  if (!OPEN_STATUSES.has(input.status)) return 'not_open'
  if (input.openCount >= EXTRA_WORK_MAX_OPEN) return 'too_many_open'
  return null
}

/** Whether the customer can pay (or decline) extra work on a booking in this status. */
export function extraWorkPayable(bookingStatus: string): boolean {
  return OPEN_STATUSES.has(bookingStatus)
}

type ChargeLike = { kind: string; status: string }

/** The extra-work requests still waiting for the customer. */
export function openExtraWork<T extends ChargeLike>(charges: T[] | null | undefined): T[] {
  return (charges ?? []).filter((c) => c.kind === 'extra_work' && c.status === 'due')
}

/** Every extra-work request on a booking, whatever became of it. */
export function extraWorkOf<T extends ChargeLike>(charges: T[] | null | undefined): T[] {
  return (charges ?? []).filter((c) => c.kind === 'extra_work')
}

/**
 * Whether the job can be marked complete (or delivered): not while extra
 * work is still waiting for the customer.
 */
export function completionBlockedByExtraWork(charges: ChargeLike[] | null | undefined): boolean {
  return openExtraWork(charges).length > 0
}

/** Where a request stands, in the words both apps key their display on. */
export type ExtraWorkState = 'awaiting' | 'paid' | 'declined' | 'withdrawn' | 'closed'

export function extraWorkState(charge: { status: string; cancelReason?: string | null }): ExtraWorkState {
  switch (charge.status) {
    case 'due':
      return 'awaiting'
    case 'paid':
      return 'paid'
    default:
      if (charge.cancelReason === 'declined') return 'declined'
      if (charge.cancelReason === 'withdrawn') return 'withdrawn'
      return 'closed'
  }
}

/** A request row as the repository returns it. */
export interface ExtraWorkRecord {
  id: string
  kind: string
  status: string
  lines: Array<{ description: string; amount: string }>
  amountDue: string
  note: string | null
  photos?: Array<{ storageKey: string; url: string }>
  paidAt: Date | null
  cancelledAt?: Date | null
  cancelReason?: string | null
  createdAt: Date
  refundedAmount?: string | null
}

/**
 * A request as the customer and the garage see it: what, how much, the
 * photos (at the address `link` gives: lib/job-photo-storage.ts
 * `jobPhotoLink`) and where it stands. No Razorpay ids or storage keys.
 */
export function toExtraWorkView(charge: ExtraWorkRecord, link: PhotoLink) {
  return {
    id: charge.id,
    description: charge.lines[0]?.description ?? 'Extra work',
    amount: Number(charge.amountDue).toFixed(2),
    note: charge.note,
    photos: (charge.photos ?? []).map((photo) => ({ url: link(photo.url) })),
    state: extraWorkState(charge),
    paidAt: charge.paidAt?.toISOString() ?? null,
    cancelledAt: charge.cancelledAt?.toISOString() ?? null,
    createdAt: charge.createdAt.toISOString(),
  }
}

/** Every request on a booking, newest first, as toExtraWorkView shapes them. */
export function extraWorkViews(charges: ExtraWorkRecord[] | null | undefined, link: PhotoLink) {
  return extraWorkOf(charges)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((charge) => toExtraWorkView(charge, link))
}
