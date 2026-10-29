/**
 * The words of each ops alert: what the Detlio team reads in its Telegram
 * group when something happens to a booking that a person may need to act on.
 *
 * Kept free of the app's env and database so it can be tested on its own.
 */

import { bookingTypeLabel } from './booking-types.js'
import { MONTHS, WEEKDAYS } from './ist.js'

const APP_TIMEZONE = 'Asia/Kolkata'
const ADMIN_BOOKINGS_URL = 'https://admin.detlio.com/bookings'
const ADMIN_REFUNDS_URL = 'https://admin.detlio.com/refunds'
const ADMIN_GIFTS_URL = 'https://admin.detlio.com/gifts'
const ADMIN_REWARDS_URL = 'https://admin.detlio.com/rewards'
const ADMIN_PAYOUTS_URL = 'https://admin.detlio.com/payouts'
const ADMIN_COMPLAINTS_URL = 'https://admin.detlio.com/complaints'
const ADMIN_VENDORS_URL = 'https://admin.detlio.com/vendors'
const ADMIN_BYPASS_REPORTS_URL = 'https://admin.detlio.com/bypass-reports'
const ADMIN_GUARANTEE_URL = 'https://admin.detlio.com/guarantee'
const ADMIN_TODAY_URL = 'https://admin.detlio.com/today'

/** A free redo claim's page in admin (Detlio Guarantee, 0051). */
export function adminClaimUrl(id: string): string {
  return `${ADMIN_GUARANTEE_URL}/${id}`
}

/** A garage's Documents tab in admin, where its uploads are approved or rejected. */
export function adminGarageDocumentsUrl(vendorId: string): string {
  return `${ADMIN_VENDORS_URL}/${vendorId}/edit?tab=documents`
}

/** A garage's Certification tab in admin: its standards, checks, Certify and Revoke. */
export function adminGarageCertificationUrl(vendorId: string): string {
  return `${ADMIN_VENDORS_URL}/${vendorId}/edit?tab=certification`
}

/** A garage's page in admin (its strikes show at the top). */
export function adminGarageUrl(vendorId: string): string {
  return `${ADMIN_VENDORS_URL}/${vendorId}/edit`
}

/** A complaint's own page in admin, where it is acknowledged and answered. */
export function adminComplaintUrl(id: string): string {
  return `${ADMIN_COMPLAINTS_URL}/${id}`
}

/**
 * The booking's own page in admin. Whoever picks an alert up goes straight to
 * the row it is about — the list made them search for the reference first.
 */
export function adminBookingUrl(id: string): string {
  return `${ADMIN_BOOKINGS_URL}/${id}`
}

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
  /**
   * The garage cancelled a booking it had accepted, before the job started
   * (0066, lib/garage-cancel.ts). `late`: within 24 hours of the slot, so it
   * counts as a missed booking for the garage's tier.
   */
  | { kind: 'garage_cancelled'; booking: AlertBooking; reason: string; late: boolean }
  /** A garage owner asked to close the garage (0066), or took the request back. */
  | { kind: 'garage_closure_requested'; vendorId: string; garage: string; reason: string }
  | { kind: 'garage_closure_cancelled'; vendorId: string; garage: string }
  | { kind: 'rescheduled'; booking: AlertBooking; previousScheduledAt: Date }
  | {
      kind: 'admin_cancelled'
      booking: AlertBooking
      onBehalfOf: 'customer' | 'garage' | 'detlio'
      reason: string
    }
  | { kind: 'garage_no_show'; booking: AlertBooking }
  | {
      /** A garage raised the final bill of an inspection job, with a balance. */
      kind: 'final_bill_raised'
      booking: AlertBooking
      totalAmount: string
      paidBefore: string
      amountDue: string
    }
  | {
      kind: 'final_bill_paid'
      booking: AlertBooking
      amountDue: string
      paymentId: string
    }
  | {
      /**
       * The garage suggested other times instead of declining (0041). Nothing
       * to do unless the customer rings: they pick one in the app, or the
       * booking is cancelled with a full refund at `expiresAt`.
       */
      kind: 'time_proposal_made'
      booking: AlertBooking
      options: Date[]
      expiresAt: Date
    }
  | {
      /**
       * How a suggestion ended: the customer picked a time (the booking moved
       * there, accepted), said none work, or let it run out. The last two
       * cancel the booking as the garage's decline: a refund is due.
       */
      kind: 'time_proposal_outcome'
      outcome: 'chosen' | 'declined' | 'expired'
      booking: AlertBooking
      /** The time the booking was at before; for 'chosen', `booking` is the new one. */
      previousScheduledAt: Date
    }
  | {
      /**
       * The pending-digest cron cancelled a paid booking its garage did not
       * accept in time (0042, AUTO_CANCEL_UNANSWERED): the garage's side, a
       * full refund owed. With AUTO_REFUNDS on it goes out by itself (a
       * refund_sent alert follows); otherwise it waits on the Refunds page.
       */
      kind: 'not_accepted_in_time'
      booking: AlertBooking & { respondBy?: Date | null }
      autoRefunds: boolean
    }
  | {
      /** The customer approved extra work by paying it in the app (0041). */
      kind: 'extra_work_paid'
      booking: AlertBooking
      description: string
      amount: string
      paymentId: string
    }
  | {
      /** The customer declined extra work the garage asked for (0041). */
      kind: 'extra_work_declined'
      booking: AlertBooking
      description: string
      amount: string
    }
  | {
      /**
       * A payment landed for a final bill that could no longer take it, and
       * has to go back: the garage had replaced the bill, Detlio had cancelled
       * the booking, or the bill was already paid by another payment.
       */
      kind: 'final_bill_refund_due'
      reason: 'replaced' | 'booking_cancelled' | 'paid_twice'
      /** Extra work (0041) uses the same alert; absent means the final bill. */
      what?: 'final_bill' | 'extra_work'
      booking: AlertBooking
      amount: string
      paymentId: string
    }
  | {
      /**
       * Ops recorded a refund it did in Razorpay (or by UPI or bank). Nothing
       * to do: it keeps the group's history of the money complete, next to
       * the alert that asked for the refund.
       */
      kind: 'refund_recorded'
      what: 'booking' | 'checkout' | 'bill'
      /** The booking it belongs to; null for a checkout that became none. */
      bookingId: string | null
      garageName: string | null
      amount: string
      /** What was paid, and what has gone back so far including this one. */
      paid: string
      refundedTotal: string
      /** The Razorpay refund id; null when the money went back another way. */
      refundRef: string | null
      /** The Razorpay payment it refunds, to find it by. */
      paymentId: string | null
      /** Who recorded it, as their booking notes are signed. */
      by: string
    }
  | {
      /**
       * The app sent a refund through Razorpay: from the Refund now button
       * (`by` the admin) or by itself under AUTO_REFUNDS. Nothing to do
       * unless it later fails, which gets its own alert.
       */
      kind: 'refund_sent'
      what: 'booking' | 'checkout' | 'bill'
      bookingId: string | null
      garageName: string | null
      amount: string
      paid: string
      refundedTotal: string
      refundRef: string
      paymentId: string | null
      auto: boolean
      by: string
    }
  | {
      /**
       * A refund through Razorpay did not happen: Razorpay refused it when
       * the app sent it, or failed it later (refund.failed). The money is
       * owed again and back on the Refunds page.
       */
      kind: 'refund_failed'
      what: 'booking' | 'checkout' | 'bill'
      bookingId: string | null
      amount: string
      /** Null when Razorpay refused it outright and made no refund. */
      refundRef: string | null
      paymentId: string | null
      /** Plain words for the team; may be Razorpay's own. */
      reason: string
      auto: boolean
      /** The automatic mode has tried as often as it will. */
      gaveUp: boolean
    }
  | {
      /**
       * Razorpay holds a refund on this payment that doesn't fit what is owed
       * here (found while checking before a send). Nothing more was sent, and
       * nothing is owed again: a person reconciles it in Razorpay first,
       * since refunding again could pay the customer twice.
       */
      kind: 'refund_gateway_mismatch'
      what: 'booking' | 'checkout' | 'bill'
      bookingId: string | null
      /** The refund found on Razorpay. */
      amount: string
      refundRef: string
      paymentId: string | null
    }
  | {
      /**
       * The automatic refunds' retry in the pending-digest cron failed as a
       * whole (not one refund: those have their own alert). The digest still
       * ran. Throttled, so a stuck sweep doesn't post every run.
       */
      kind: 'auto_refund_sweep_failed'
      /** How long further failures stay quiet, so the message can say so. */
      quietMinutes: number
    }
  | {
      /**
       * The automatic mode reached its daily cap: no more automatic refunds
       * until tomorrow (IST). Sent once a day at most.
       */
      kind: 'auto_refund_cap_reached'
      cap: string
      sentToday: string
    }
  | {
      kind: 'pending_digest'
      now: Date
      waiting: DigestBooking[]
      missed: DigestBooking[]
      /**
       * The morning roll-up only: what Detlio owes garages in payouts
       * (modules/payouts). Absent, or null when nothing is due.
       */
      payouts?: { garages: number; total: string; oldestUnpaidAt: Date | null; overdue: boolean } | null
      /** Pickup & drop jobs past their time with the car not collected. */
      latePickups?: DigestBooking[]
      /**
       * The morning roll-up only (0042): bookings cancelled yesterday (IST)
       * because the garage did not accept in time, per garage, most first.
       * Absent, or empty when there were none.
       */
      missedResponses?: Array<{ garageName: string; count: number }>
    }
  | {
      kind: 'paid_no_booking'
      paymentId: string
      reason: string
      amount?: string
      garageName?: string
      scheduledAt?: Date
    }
  | {
      kind: 'sms_failed'
      /** The number the code was for. Masked here, whatever it arrives as. */
      phone: string
      /** What the SMS provider said, as it said it. */
      providerMessage: string
      /** How long further failures stay quiet, so the message can say so. */
      quietMinutes: number
    }
  | {
      kind: 'receipt_number_failed'
      /** The booking whose payment went through, or whose receipt was opened. */
      bookingId: string
      /** What the database said, as it said it. */
      errorMessage: string
      /** How long further failures stay quiet, so the message can say so. */
      quietMinutes: number
    }
  | {
      /**
       * The owner ran "Start pilot clean" in admin: test bookings and
       * checkouts were deleted for good. Nothing to do; the team should
       * know it happened, and who did it.
       */
      kind: 'test_data_cleared'
      /** The name the person typed to confirm. */
      by: string
      bookings: number
      checkouts: number
      /** The receipt plan, a year a line, in the dry run's words. */
      receipts: string[]
      auditId: string
    }
  | {
      /**
       * A garage was deleted forever from the admin Bin. Nothing to do; the
       * team should know it happened, who did it, and whether bookings with
       * real money were kept (the garage then stays as a tombstone).
       */
      kind: 'garage_deleted'
      /** The name the person typed. */
      by: string
      garage: string
      /** Bookings deleted with it, one per reschedule chain. */
      bookings: number
      /** Bookings kept for their real money. */
      keptBookings: number
      outcome: 'hard_delete' | 'tombstone' | 'partial'
      auditId: string
    }
  | {
      /**
       * A customer raised a complaint in the app. The clock has started: it
       * must be acknowledged by `acknowledgeBy` (24 hours, the Contact
       * page's promise), and the admin link is where that is done.
       */
      kind: 'complaint_received'
      complaintId: string
      /** "C-000123". */
      number: string
      /** The category as the customer picked it ("Payment or refund"). */
      category: string
      /** The booking it is about, if it came from one. */
      bookingId: string | null
      garageName: string | null
      customerName: string
      /** The customer's own words; quoted, scrubbed and cut short here. */
      message: string
      acknowledgeBy: Date
      /**
       * Set when the team logged it from a call or a message (0039): how it
       * came ("By phone") and the name of whoever logged it. Null when the
       * customer raised it in the app.
       */
      logged: { source: string; by: string } | null
    }
  | {
      /**
       * A garage uploaded a document for Detlio to check (0043). The files
       * are ID and bank proof, so the alert never carries a file, a link to
       * one or anything read off it: only the garage, the kind of document
       * and the admin page where it is opened.
       */
      kind: 'documents_uploaded'
      vendorId: string
      garage: string
      /** "Owner ID", or "Owner ID (replacing an approved one)" (uploadedLine). */
      what: string
      /** The garage's documents now waiting for review, this one included. */
      waiting: number
    }
  | {
      /**
       * Detlio Certified (0048): the nightly run found a garage that is not
       * certified meeting every standard, so the team can arrange its
       * quality check (a mystery visit or an inspection) and then certify it.
       */
      kind: 'certification_eligible'
      vendorId: string
      garage: string
    }
  | {
      /**
       * A certified garage fell short for the first night: it keeps the
       * badge until `keepsUntil` (an IST date label) unless it is put right.
       */
      kind: 'certification_at_risk'
      vendorId: string
      garage: string
      /** The standards not met, and the check if it does not stand (shortfallLine). */
      shortfall: string
      keepsUntil: string
    }
  | {
      /**
       * A garage lost Detlio Certified: 14 days short (`lapsed`), or an
       * admin revoked it, with their typed name and reason.
       */
      kind: 'certification_lost'
      vendorId: string
      garage: string
      how: 'lapsed' | 'revoked'
      /** The admin's typed name; null for a lapse. */
      by: string | null
      reason: string
    }
  | {
      /**
       * "Did the garage ask you to book directly?" (0052): a customer reported
       * a garage. Never who reported it (the garage must never learn it, and
       * the group chat keeps everything): the garage, the booking, what
       * happened and the customer's note, quoted and scrubbed.
       */
      kind: 'bypass_report_received'
      garage: string
      bookingId: string | null
      /** What happened, as the customer picked it. */
      what: string
      note: string | null
      /** The garage's strikes before this report is looked at. */
      strikes: number
    }
  | {
      /**
       * A confirmed report took a garage to 2 strikes (confirmed reports in
       * the last 180 days): time to talk to it, or to suspend it.
       */
      kind: 'bypass_strikes_reached'
      vendorId: string
      garage: string
      strikes: number
      windowDays: number
      /** Detlio Certified now: it will be at risk at the next nightly check. */
      certified: boolean
    }
  | {
      /**
       * Gift a wash (0049): a Razorpay payment for a gift that had already
       * been paid another way (two payments on one order), or for a gift the
       * team had cancelled. The gift itself is unchanged; the money is to
       * refund by hand.
       */
      kind: 'gift_payment_stray'
      giftNumber: string
      paymentId: string
      amount: string
      why: 'already_paid' | 'cancelled'
    }
  | {
      /**
       * A customer asked for a free redo (Detlio Guarantee, 0051), and where
       * it went: to the garage to answer, to Detlio (a review flag, or photos
       * waived), or approved at once because the garage took no photos.
       */
      kind: 'guarantee_claim'
      claimId: string
      bookingId: string
      garageName: string
      route: 'garage' | 'detlio' | 'auto'
      /** lib/guarantee.ts ROUTE_REASON_LABELS of its reasons. */
      reasons: string[]
      /** ISSUE_LABELS of what the customer picked. */
      issues: string[]
      respondBy: Date | null
      decideBy: Date | null
    }
  | {
      /** A claim now needs Detlio: the garage disputed it, or the redo did not happen on its side. */
      kind: 'guarantee_needs_detlio'
      claimId: string
      bookingId: string
      garageName: string
      why: 'disputed' | 'redo_failed'
      /** The garage's note on a dispute; quoted, scrubbed and cut short here. */
      note: string | null
      decideBy: Date
    }
  | {
      /**
       * Detlio Rewards (0050): this IST month's rewards issued reached
       * REWARDS_MONTHLY_CAP_INR. New scratch cards give a bonus stamp
       * instead of money; Shine Card and invite vouchers are still issued.
       * Sent once a month at most.
       */
      kind: 'rewards_cap_reached'
      month: string
      cap: string
      issued: string
    }
  | {
      /**
       * A collection list sent to a teammate from the Garages list (0059,
       * "Send to team"): what to collect from which garages. Long lists are
       * split into several messages (splitTelegramText).
       */
      kind: 'collection_list'
      list: CollectionListAlert
    }
  | {
      /**
       * A customer asked a garage just outside its reach to come (customer
       * reach, 0062): what, when and how far. Never the customer or the
       * address. `forwarded` when it was passed on from another garage.
       */
      kind: 'request_received'
      requestId: string
      garageName: string
      bookingType: string
      services: string[]
      windowLabel: string
      beyond: string
      respondBy: Date
      forwarded: boolean
    }
  | {
      /**
       * A request has waited 30 minutes with no answer: the team phones the
       * garage. Carries the garage's business phone, as the pending digest
       * does, for that call.
       */
      kind: 'request_no_reply'
      requestId: string
      garageName: string
      garagePhone: string | null
      bookingType: string
      services: string[]
      windowLabel: string
      respondBy: Date
    }

/** A collection list as its Telegram post reads it (0059). */
export interface CollectionListAlert {
  id: string
  assigneeName: string
  createdByName: string
  /** YYYY-MM-DD, IST. */
  dueOn: string | null
  note: string | null
  garages: Array<{
    businessName: string
    /** Where it is: "Adyar, Chennai". */
    area: string
    ownerName: string | null
    ownerPhone: string | null
    mapsUrl: string | null
    /** What to collect, as checklist words ("Payout details"). */
    items: string[]
  }>
}

/** A collection list in admin: the Today page's Mine tab opens it. */
export function adminCollectionListUrl(id: string): string {
  return `${ADMIN_TODAY_URL}?list=${id}`
}

/** "Thu 29 Oct", for a YYYY-MM-DD date key. */
function dueLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return dateKey
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/**
 * The words of a collection list's post. Plain text: a header, the note,
 * one numbered block per garage (owner · phone · Map, then a ☐ line per
 * thing), and the admin link. Blocks are separated by a blank line, which
 * is where splitTelegramText cuts a long list.
 */
export function collectionListText(list: CollectionListAlert): string {
  const flat = (text: string) => text.replace(/\s+/g, ' ').trim()
  const header = lines(
    `📋 Collection list for ${flat(list.assigneeName)}`,
    `From ${flat(list.createdByName)}${list.dueOn ? ` · by ${dueLabel(list.dueOn)}` : ''}`,
    list.note?.trim() ? `Note: ${flat(list.note)}` : null
  )
  const blocks = list.garages.map((garage, index) => {
    const contact = [
      garage.ownerName ? flat(garage.ownerName) : null,
      garage.ownerPhone,
      garage.mapsUrl ? `Map: ${garage.mapsUrl}` : null,
    ].filter(Boolean)
    return lines(
      `${index + 1}. ${flat(garage.businessName)}${garage.area ? `, ${flat(garage.area)}` : ''}`,
      contact.length > 0 ? contact.join(' · ') : null,
      ...garage.items.map((item) => `☐ ${flat(item)}`)
    )
  })
  return [
    header,
    ...blocks,
    `Open the list in admin: ${adminCollectionListUrl(list.id)}`,
  ].join('\n\n')
}

/** Telegram's limit on one message, in characters. */
export const TELEGRAM_MAX_CHARS = 4096

/**
 * A message cut into Telegram-sized parts: at blank lines (between a
 * collection list's garages) where it can, else at line ends, else hard.
 * Text that fits is one part, unchanged. Counted in UTF-16 units, which is
 * at least what Telegram counts, so a part never runs over.
 */
export function splitTelegramText(text: string, max = TELEGRAM_MAX_CHARS): string[] {
  if (text.length <= max) return [text]
  const parts: string[] = []
  let current = ''
  const push = (piece: string, joiner: string) => {
    if (!current) current = piece
    else if (current.length + joiner.length + piece.length <= max) current += joiner + piece
    else {
      parts.push(current)
      current = piece
    }
  }
  for (const block of text.split('\n\n')) {
    if (block.length <= max) {
      push(block, '\n\n')
      continue
    }
    // A block too long on its own starts a part and goes line by line, and
    // a line too long on its own in hard cuts.
    if (current) parts.push(current)
    current = ''
    for (const line of block.split('\n')) {
      if (line.length <= max) {
        push(line, '\n')
        continue
      }
      for (let at = 0; at < line.length; at += max) push(line.slice(at, at + max), '\n')
    }
  }
  if (current) parts.push(current)
  return parts
}

/** A paid booking still waiting for its garage, as the digest lists it. */
export interface DigestBooking {
  id: string
  scheduledAt: Date
  bookingType: string
  waitingSince: Date
  garageName: string
  garagePhone: string
  /** The garage's deadline to accept (0042); null on bookings without one. */
  respondBy?: Date | null
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
        adminBookingUrl(b.id)
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
        adminBookingUrl(b.id)
      )
    }

    case 'garage_cancelled': {
      const b = alert.booking
      const paid = isPaid(b)
      return lines(
        `🚫 Garage cancelled accepted booking #${reference(b.id)}${paid ? ' · refund due' : ''}`,
        garageLine(b),
        `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`,
        alert.late
          ? 'Within 24 hours of the slot: counted as a missed booking for its tier.'
          : 'More than 24 hours before the slot: counted like a decline.',
        paid
          ? `${rupees(b.amount)} was paid. It is refunded through the usual refund path; offer the customer another garage.`
          : 'Not paid online, so nothing to refund.',
        quoted('Garage wrote', alert.reason),
        adminBookingUrl(b.id)
      )
    }

    case 'garage_closure_requested':
      return lines(
        `🔒 ${alert.garage} asked to close the garage`,
        quoted('Owner wrote', alert.reason),
        'Call the owner first. To close it, move the garage to the Bin; the owner can still cancel the request until then.',
        adminGarageUrl(alert.vendorId)
      )

    case 'garage_closure_cancelled':
      return lines(`↩️ ${alert.garage} no longer asks to close the garage`, adminGarageUrl(alert.vendorId))

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
        adminBookingUrl(b.id)
      )
    }

    case 'admin_cancelled': {
      // Sent by ops' own action, so it is a to-do rather than news: whoever
      // cancelled may not be the one who does the refund.
      const b = alert.booking
      const paid = isPaid(b)
      return lines(
        `🛑 Detlio cancelled #${reference(b.id)}${paid ? ' · refund due' : ''}`,
        garageLine(b),
        `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`,
        ON_BEHALF_OF[alert.onBehalfOf],
        paid
          ? `${rupees(b.amount)} was paid. Refund it in Razorpay.`
          : 'Not paid online, so nothing to refund.',
        quoted('Reason', alert.reason),
        adminBookingUrl(b.id)
      )
    }

    case 'garage_no_show': {
      // The policy: when the garage doesn't turn up, the customer always gets
      // their money back in full.
      const b = alert.booking
      const paid = isPaid(b)
      return lines(
        `🚫 Garage no-show #${reference(b.id)}${paid ? ' · refund due' : ''}`,
        garageLine(b),
        `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`,
        paid
          ? `${rupees(b.amount)} was paid. Refund the customer in full in Razorpay.`
          : 'Not paid online, so nothing to refund.',
        adminBookingUrl(b.id)
      )
    }

    case 'final_bill_raised': {
      // Nothing to do yet: the customer pays in the app. Said so ops can
      // answer the call when a customer rings about a bigger bill.
      const b = alert.booking
      return lines(
        `🧾 Final bill #${reference(b.id)} · ${rupees(alert.totalAmount)} total, ${rupees(alert.amountDue)} to pay`,
        garageLine(b),
        services(b),
        `Paid at booking ${rupees(alert.paidBefore)}. The customer pays the rest in the app.`,
        adminBookingUrl(b.id)
      )
    }

    case 'final_bill_paid': {
      const b = alert.booking
      return lines(
        `✅ Final bill paid #${reference(b.id)} · ${rupees(alert.amountDue)}`,
        garageLine(b),
        `Razorpay payment ${alert.paymentId}`,
        adminBookingUrl(b.id)
      )
    }

    case 'time_proposal_made': {
      const b = alert.booking
      return lines(
        `🕑 Garage suggested other times #${reference(b.id)}`,
        garageLine(b),
        `Booked for ${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`,
        `Offered: ${alert.options.map(when).join(' · ')}`,
        `The customer picks one in the app by ${when(alert.expiresAt)}, or it is cancelled with a full refund.`,
        adminBookingUrl(b.id)
      )
    }

    case 'time_proposal_outcome': {
      const b = alert.booking
      const paid = isPaid(b)
      if (alert.outcome === 'chosen') {
        return lines(
          `✅ Customer picked a suggested time #${reference(b.id)}`,
          garageLine(b),
          `${when(alert.previousScheduledAt)} → ${when(b.scheduledAt)}`,
          'Moved and accepted: the garage offered this time.',
          adminBookingUrl(b.id)
        )
      }
      return lines(
        alert.outcome === 'declined'
          ? `❌ None of the suggested times worked #${reference(b.id)}${paid ? ' · refund due' : ''}`
          : `⌛ Suggested times ran out unanswered #${reference(b.id)}${paid ? ' · refund due' : ''}`,
        garageLine(b),
        `${when(alert.previousScheduledAt)} · ${modeLabel(b.bookingType)}`,
        paid
          ? `Cancelled as the garage's decline. ${rupees(b.amount)} was paid: refund it in full, and offer the customer another garage.`
          : "Cancelled as the garage's decline. Not paid online, so nothing to refund.",
        adminBookingUrl(b.id)
      )
    }

    case 'not_accepted_in_time': {
      const b = alert.booking
      const paid = isPaid(b)
      return lines(
        `⌛ Not accepted in time: ${b.vendor?.businessName ?? 'garage'}, booking #${reference(b.id)}${paid ? ` · refund ${rupees(b.amount)} ${alert.autoRefunds ? 'started' : 'owed'}` : ''}`,
        garageLine(b),
        `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)}`,
        b.respondBy ? `Had until ${when(b.respondBy)} to accept.` : null,
        paid
          ? alert.autoRefunds
            ? `Cancelled as the garage's. Full refund of ${rupees(b.amount)} going back automatically; the customer was shown other garages.`
            : `Cancelled as the garage's. ${rupees(b.amount)} was paid: refund it in full from the Refunds page. The customer was shown other garages.`
          : "Cancelled as the garage's. Not paid online, so nothing to refund.",
        adminBookingUrl(b.id)
      )
    }

    case 'extra_work_paid': {
      const b = alert.booking
      return lines(
        `🔧 Extra work approved and paid #${reference(b.id)} · ${rupees(alert.amount)}`,
        garageLine(b),
        quoted('Work', alert.description),
        `Razorpay payment ${alert.paymentId}`,
        adminBookingUrl(b.id)
      )
    }

    case 'extra_work_declined': {
      const b = alert.booking
      return lines(
        `🙅 Customer declined extra work #${reference(b.id)} · ${rupees(alert.amount)}`,
        garageLine(b),
        quoted('Work', alert.description),
        'Nothing to do: the garage sees it declined. The customer may ring about it.',
        adminBookingUrl(b.id)
      )
    }

    case 'final_bill_refund_due': {
      const b = alert.booking
      if (alert.what === 'extra_work') {
        const [title, why] = {
          replaced: [
            'Extra work paid after it was withdrawn or declined',
            'The request no longer stood when the payment landed. Refund this payment in Razorpay; the customer was told it would be refunded.',
          ],
          booking_cancelled: [
            'Extra work paid after the booking was cancelled',
            'The booking was cancelled while the customer was paying for extra work. Refund this payment in Razorpay; the customer was told it would be refunded.',
          ],
          paid_twice: [
            'Extra work paid twice',
            'The request was already paid by another payment. Refund this second one in Razorpay; the customer was told it would be refunded.',
          ],
        }[alert.reason]
        return lines(
          `⚠️ ${title} #${reference(b.id)} · refund due`,
          garageLine(b),
          `${rupees(alert.amount)} · Razorpay payment ${alert.paymentId}`,
          why,
          adminBookingUrl(b.id)
        )
      }
      const [title, why] = {
        replaced: [
          'Final bill paid after it was replaced',
          'The garage changed the bill while the customer was paying. Refund this payment in Razorpay; the customer was told it would be refunded and can pay the new bill.',
        ],
        booking_cancelled: [
          'Final bill paid after the booking was cancelled',
          'The booking was cancelled while the customer was paying its bill. Refund this payment in Razorpay; the customer was told it would be refunded.',
        ],
        paid_twice: [
          'Final bill paid twice',
          'The bill was already paid by another payment. Refund this second one in Razorpay; the customer was told it would be refunded.',
        ],
      }[alert.reason]
      return lines(
        `⚠️ ${title} #${reference(b.id)} · refund due`,
        garageLine(b),
        `${rupees(alert.amount)} · Razorpay payment ${alert.paymentId}`,
        why,
        adminBookingUrl(b.id)
      )
    }

    case 'refund_recorded': {
      const full = Number(alert.refundedTotal) >= Number(alert.paid)
      return lines(
        `💸 Refund recorded${alert.bookingId ? ` #${reference(alert.bookingId)}` : ''} · ${rupees(alert.amount)}`,
        [REFUND_WHAT[alert.what], alert.garageName].filter(Boolean).join(' · '),
        alert.refundRef
          ? `Razorpay refund ${alert.refundRef}${alert.paymentId ? ` for ${alert.paymentId}` : ''}`
          : `Refunded outside Razorpay${alert.paymentId ? ` (payment ${alert.paymentId})` : ''}. How is in the note in admin.`,
        full
          ? 'Refunded in full.'
          : `Part refund: ${rupees(alert.refundedTotal)} of ${rupees(alert.paid)} back so far. The rest is still owed.`,
        `Recorded by ${alert.by}.`,
        alert.bookingId ? adminBookingUrl(alert.bookingId) : ADMIN_REFUNDS_URL
      )
    }

    case 'refund_sent': {
      const full = Number(alert.refundedTotal) >= Number(alert.paid)
      return lines(
        `💸 Refund ${rupees(alert.amount)} started${alert.bookingId ? ` for booking #${reference(alert.bookingId)}` : ' for a payment with no booking'} · ${alert.auto ? 'auto' : 'admin'}`,
        [REFUND_WHAT[alert.what], alert.garageName].filter(Boolean).join(' · '),
        `Razorpay refund ${alert.refundRef}${alert.paymentId ? ` for ${alert.paymentId}` : ''}`,
        full
          ? 'All of it is on its way back.'
          : `Part refund: ${rupees(alert.refundedTotal)} of ${rupees(alert.paid)} back so far. The rest is still owed.`,
        alert.auto ? 'Sent automatically.' : `Sent by ${alert.by}.`,
        alert.bookingId ? adminBookingUrl(alert.bookingId) : ADMIN_REFUNDS_URL
      )
    }

    case 'refund_failed':
      return lines(
        `⚠️ Refund ${rupees(alert.amount)} failed${alert.bookingId ? ` for booking #${reference(alert.bookingId)}` : ' for a payment with no booking'} · ${alert.auto ? 'auto' : 'admin'}`,
        REFUND_WHAT[alert.what],
        alert.refundRef
          ? `Razorpay refund ${alert.refundRef}${alert.paymentId ? ` for ${alert.paymentId}` : ''}`
          : alert.paymentId
            ? `Razorpay payment ${alert.paymentId}`
            : null,
        `Why: ${alert.reason}`,
        alert.gaveUp
          ? 'The money is owed again. Automatic refunds have stopped trying this one: refund it from the Refunds page.'
          : 'The money is owed again and back on the Refunds page.',
        alert.bookingId ? adminBookingUrl(alert.bookingId) : ADMIN_REFUNDS_URL
      )

    case 'refund_gateway_mismatch':
      return lines(
        `🛑 Razorpay refund doesn't match${alert.bookingId ? ` booking #${reference(alert.bookingId)}` : ' a payment with no booking'}`,
        REFUND_WHAT[alert.what],
        `Razorpay holds refund ${alert.refundRef} of ${rupees(alert.amount)}${alert.paymentId ? ` on ${alert.paymentId}` : ''}, which doesn't fit what is owed here.`,
        'Nothing more was sent. Do not refund this again: reconcile the payment in Razorpay first, then record what it shows with Mark refunded.',
        alert.bookingId ? adminBookingUrl(alert.bookingId) : ADMIN_REFUNDS_URL
      )

    case 'auto_refund_sweep_failed':
      return lines(
        `⚠️ Automatic refunds' check failed`,
        "The retry of automatic refunds in the pending-booking job didn't run through, so refunds it would have sent are still owed. The digest itself still ran.",
        'Check the server logs (ops:auto_refund_sweep_failed). Meanwhile refund from the Refunds page.',
        `Further failures in the next ${alert.quietMinutes} minutes won't be alerted.`,
        ADMIN_REFUNDS_URL
      )

    case 'auto_refund_cap_reached':
      return lines(
        `🛑 Automatic refunds paused for today`,
        `${rupees(alert.sentToday)} refunded automatically today; the daily cap is ${rupees(alert.cap)}.`,
        'Eligible automatic refunds resume tomorrow. Anything else owed (final bills, part refunds, bookings with an open complaint, money owed over 3 days) needs a manual review: use Refund now on the Refunds page.',
        ADMIN_REFUNDS_URL
      )

    case 'rescheduled': {
      const b = alert.booking
      return lines(
        `🔁 Rescheduled #${reference(b.id)}`,
        garageLine(b),
        `${when(alert.previousScheduledAt)} → ${when(b.scheduledAt)}`,
        // A moved booking goes back to pending: the garage has to accept the
        // new time, and the 30-minute nudge covers it like any new booking.
        'Back to Requested: waiting for the garage to accept the new time.',
        adminBookingUrl(b.id)
      )
    }

    case 'pending_digest': {
      const sections: string[] = []
      if (alert.waiting.length > 0) {
        sections.push(
          lines(
            `⏰ ${plural(alert.waiting.length, 'paid booking')} waiting for the garage to accept`,
            ...digestRows(alert.waiting, (b) =>
              `${when(b.scheduledAt)} · ${modeLabel(b.bookingType)} · waiting ${duration(alert.now.getTime() - b.waitingSince.getTime())}${deadlineNote(b, alert.now)}`
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
      const payouts = alert.payouts
      if (payouts) {
        // "Payouts due: 3 garages, ₹4,210 total, oldest Thu 15 Oct, 6:00 pm ⚠️"
        sections.push(
          lines(
            `💰 Payouts due: ${plural(payouts.garages, 'garage')}, ${rupees(payouts.total)} total${
              payouts.oldestUnpaidAt ? `, oldest ${when(payouts.oldestUnpaidAt)}` : ''
            }${payouts.overdue ? ' · past 24 hours' : ''}`,
            ADMIN_PAYOUTS_URL
          )
        )
      }
      const missedResponses = alert.missedResponses ?? []
      if (missedResponses.length > 0) {
        // "⌛ Not accepted in time yesterday: 3 bookings" and one line a garage.
        const total = missedResponses.reduce((sum, row) => sum + row.count, 0)
        sections.push(
          lines(
            `⌛ Not accepted in time yesterday: ${plural(total, 'booking')}, cancelled and refunded`,
            ...missedResponses.slice(0, DIGEST_MAX_ROWS).map((row) => `${row.garageName} · ${row.count}`),
            missedResponses.length > DIGEST_MAX_ROWS ? `…and ${missedResponses.length - DIGEST_MAX_ROWS} more garages` : null
          )
        )
      }
      const late = alert.latePickups ?? []
      if (late.length > 0) {
        sections.push(
          lines(
            `🚗 ${plural(late.length, 'pickup & drop job')} past ${late.length === 1 ? 'its' : 'their'} time with the car not picked up`,
            ...digestRows(late, (b) =>
              `${when(b.scheduledAt)} · ${duration(alert.now.getTime() - b.scheduledAt.getTime())} late`
            ),
            'Call the garage: is the driver on the way? If the customer gave the code but the garage could not enter it, confirm Picked up from the booking.'
          )
        )
      }
      if (alert.waiting.length === 0 && alert.missed.length === 0 && late.length === 0) {
        return sections.join('\n\n')
      }
      return lines(sections.join('\n\n'), ADMIN_BOOKINGS_URL)
    }

    case 'paid_no_booking':
      return lines(
        `⚠️ Payment taken, no booking · refund due`,
        `${alert.amount ? rupees(alert.amount) : 'Amount unknown'} · Razorpay payment ${alert.paymentId}`,
        alert.garageName ? `Garage: ${alert.garageName}` : null,
        alert.scheduledAt ? `Was for ${when(alert.scheduledAt)}` : null,
        `Why: ${failureReasonText(alert.reason)}`,
        'Refund this payment in Razorpay, then mark it refunded on the Refunds page. The customer was told it would be refunded.',
        // A checkout that became no booking has no booking page; the Refunds
        // page is where it is found and marked done.
        ADMIN_REFUNDS_URL
      )

    case 'sms_failed':
      // About the provider, not the customer: while it lasts nobody can log
      // in, so the number is only there to tell one failure from another.
      return lines(
        `📵 A login code failed to send`,
        `For ${maskedPhone(alert.phone)}. If this keeps happening, nobody can log in.`,
        quoted('Provider said', alert.providerMessage),
        'Check the SMS account (balance, sender approval) and its status page.',
        `Further failures in the next ${alert.quietMinutes} minutes won't be alerted.`
      )

    case 'receipt_number_failed':
      // The money is recorded; only the number is missing. But the causes
      // that outlast a retry (a counter set behind the numbers by hand, a
      // migration not applied) do not fix themselves, and until they are
      // fixed the customer's receipt will not open.
      return lines(
        `🧾 Receipt number not issued #${reference(alert.bookingId)}`,
        "The payment is recorded. The customer's receipt won't open until it has a number.",
        quoted('Database said', alert.errorMessage),
        'Check that migration 0030 is applied, and that receipt_counters is not behind the highest seq in receipt_numbers for this financial year.',
        `Further failures in the next ${alert.quietMinutes} minutes won't be alerted.`,
        adminBookingUrl(alert.bookingId)
      )

    case 'test_data_cleared':
      return lines(
        `🧹 Test data cleared by ${alert.by}: ${alert.bookings} ${alert.bookings === 1 ? 'booking' : 'bookings'}`,
        alert.checkouts > 0
          ? `${alert.checkouts} ${alert.checkouts === 1 ? 'checkout' : 'checkouts'} with it, refunds and photos included.`
          : null,
        ...alert.receipts,
        `Audit record ${alert.auditId}.`
      )

    case 'garage_deleted':
      return lines(
        `🗑️ Garage deleted by ${alert.by}: ${alert.garage}, ${alert.bookings} ${alert.bookings === 1 ? 'booking' : 'bookings'}`,
        alert.keptBookings > 0
          ? `${alert.keptBookings} ${alert.keptBookings === 1 ? 'booking' : 'bookings'} with real money kept for the accounts, with the garage's name and address.`
          : null,
        alert.outcome === 'partial'
          ? 'More bookings than one run deletes: the garage is still in the Bin, and Delete forever must be pressed again.'
          : null,
        `Audit record ${alert.auditId}.`
      )

    case 'complaint_received':
      return lines(
        `📣 New complaint ${alert.number} · ${alert.category}`,
        alert.garageName || alert.bookingId
          ? [
              alert.garageName ? `Garage: ${alert.garageName}` : null,
              alert.bookingId ? `booking #${reference(alert.bookingId)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'Not about a booking.',
        `Customer: ${firstName(alert.customerName)}`,
        alert.logged ? `${alert.logged.source}, logged by ${alert.logged.by}.` : null,
        quoted(alert.logged ? 'What they said' : 'Customer wrote', alert.message),
        `Acknowledge by ${when(alert.acknowledgeBy)}.`,
        adminComplaintUrl(alert.complaintId)
      )

    case 'documents_uploaded':
      return lines(
        `📄 Documents to review: ${alert.garage}`,
        `Uploaded: ${alert.what}.`,
        `${alert.waiting} ${alert.waiting === 1 ? 'document waits' : 'documents wait'} for review at this garage.`,
        adminGarageDocumentsUrl(alert.vendorId)
      )

    case 'certification_eligible':
      return lines(
        `🥇 Eligible for Gold: ${alert.garage}`,
        'It meets every Gold standard. Arrange a quality check (mystery visit or inspection), record it, then Award Gold.',
        adminGarageCertificationUrl(alert.vendorId)
      )

    case 'certification_at_risk':
      return lines(
        `⚠️ Gold at risk: ${alert.garage}`,
        `Falling short: ${alert.shortfall}.`,
        `It keeps Gold until ${alert.keepsUntil} unless this is put right.`,
        adminGarageCertificationUrl(alert.vendorId)
      )

    case 'certification_lost':
      return lines(
        `Gold removed: ${alert.garage}`,
        alert.how === 'lapsed'
          ? `Lost automatically. ${alert.reason}`
          : `Revoked by ${alert.by ?? 'admin'}.`,
        alert.how === 'revoked' ? quoted('Reason', alert.reason) : null,
        'Customers no longer see its Gold medal.',
        adminGarageCertificationUrl(alert.vendorId)
      )

    case 'bypass_report_received':
      return lines(
        `🚩 Bypass report: ${alert.garage}`,
        [alert.bookingId ? `booking #${reference(alert.bookingId)}` : null, alert.what].filter(Boolean).join(' · '),
        alert.note ? quoted('Customer wrote', alert.note) : null,
        alert.strikes > 0
          ? `This garage has ${alert.strikes} ${alert.strikes === 1 ? 'strike' : 'strikes'} already.`
          : null,
        'Look into it, then Confirm or Dismiss. The garage must never learn who reported it.',
        ADMIN_BYPASS_REPORTS_URL
      )

    case 'bypass_strikes_reached':
      return lines(
        `⛔ ${alert.garage} reached ${alert.strikes} strikes`,
        `${alert.strikes} confirmed reports of taking customers off Detlio in the last ${alert.windowDays} days.`,
        alert.certified
          ? 'It is Gold: the next nightly check puts Gold at risk.'
          : null,
        'Talk to the garage about its agreement, or pause or suspend it.',
        adminGarageUrl(alert.vendorId)
      )

    case 'guarantee_claim':
      return lines(
        alert.route === 'auto'
          ? `🔁 Free redo approved automatically — no garage photos · #${reference(alert.bookingId)}`
          : alert.route === 'garage'
            ? `🔁 New free redo claim · #${reference(alert.bookingId)} · with the garage`
            : `🔁 New free redo claim · #${reference(alert.bookingId)} · needs Detlio`,
        `Garage: ${alert.garageName}`,
        `What's wrong: ${alert.issues.join(', ')}`,
        alert.reasons.length > 0 ? `Why: ${alert.reasons.join(', ')}` : null,
        alert.respondBy ? `Garage answers by ${when(alert.respondBy)}; no answer approves it.` : null,
        alert.decideBy ? `Decide by ${when(alert.decideBy)}.` : null,
        alert.route === 'auto' ? 'The garage took no before/after photos, so there was nothing to defend it with.' : null,
        adminClaimUrl(alert.claimId)
      )

    case 'guarantee_needs_detlio':
      return lines(
        alert.why === 'disputed'
          ? `⚖️ Free redo claim disputed by the garage · #${reference(alert.bookingId)}`
          : `⚖️ Free redo did not happen on the garage's side · #${reference(alert.bookingId)}`,
        `Garage: ${alert.garageName}`,
        alert.why === 'disputed' ? quoted('Garage wrote', alert.note) : 'Approve another redo, a refund instead, or close it.',
        `Decide by ${when(alert.decideBy)}, comparing both sides' photos.`,
        adminClaimUrl(alert.claimId)
      )

    case 'gift_payment_stray':
      return lines(
        `⚠️ Gift payment with nothing to pay for · refund due`,
        `${rupees(alert.amount)} · Razorpay payment ${alert.paymentId} · gift ${alert.giftNumber}`,
        alert.why === 'cancelled'
          ? 'The gift had been cancelled by the team before this payment landed.'
          : 'The gift had already been paid for with another payment.',
        'Refund this payment in the Razorpay dashboard. The gift is unchanged.',
        ADMIN_GIFTS_URL
      )

    case 'rewards_cap_reached':
      return lines(
        `🎟️ Rewards budget reached for ${alert.month}`,
        `${rupees(alert.issued)} of rewards issued this month; the cap is ${rupees(alert.cap)}.`,
        'New scratch cards now give a bonus stamp instead of money. Shine Card and invite vouchers are still issued.',
        'Raise REWARDS_MONTHLY_CAP_INR to change it.',
        ADMIN_REWARDS_URL
      )

    case 'collection_list':
      return collectionListText(alert.list)

    case 'request_received':
      return lines(
        alert.forwarded
          ? `📨 Request passed on to ${alert.garageName} · ${modeLabel(alert.bookingType)}`
          : `📨 New request for ${alert.garageName} · ${modeLabel(alert.bookingType)}`,
        alert.services.join(', '),
        `${alert.windowLabel} · ${alert.beyond}`,
        `Garage answers by ${when(alert.respondBy)}; no answer passes it on.`,
        `Request ${reference(alert.requestId)}`
      )

    case 'request_no_reply':
      return lines(
        `☎️ No answer in 30 min: ${alert.garageName} · ${modeLabel(alert.bookingType)}`,
        alert.services.join(', '),
        alert.windowLabel,
        alert.garagePhone ? `Call the garage: ${phone(alert.garagePhone)}` : 'No phone on file for the garage.',
        `It passes to the next garage at ${when(alert.respondBy)}.`,
        `Request ${reference(alert.requestId)}`
      )
  }
}

/**
 * Only the last four digits: enough to match a customer who calls in, and
 * nothing a group chat should keep. "******4321".
 */
export function maskedPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 4) return '******'
  return `******${digits.slice(-4)}`
}

/** Whose call an admin cancellation was, as one line. */
const ON_BEHALF_OF: Record<'customer' | 'garage' | 'detlio', string> = {
  customer: 'On behalf of the customer.',
  garage: 'On behalf of the garage.',
  detlio: "Detlio's own decision.",
}

/** What a refund was of, as one phrase. */
const REFUND_WHAT: Record<'booking' | 'checkout' | 'bill', string> = {
  booking: 'Booking payment',
  checkout: 'Payment with no booking',
  bill: 'Final bill payment',
}

/**
 * Why a checkout's payment became no booking, in the team's words: the
 * refunds list in admin says it the same way as this alert.
 */
export function failureReasonText(reason: string | null | undefined): string {
  if (!reason) return 'the booking could not be written'
  return FAILURE_REASONS[reason] ?? reason
}

/** The reasons failIntent records, as the team would say them. */
const FAILURE_REASONS: Record<string, string> = {
  intent_expired: 'the checkout expired before the payment went through',
  vehicle_double_booked: 'that car already had a booking at that time',
  discount_exhausted: 'the promo code ran out before the payment went through',
  slot_full: 'the garage was booked up at that time before the payment went through',
  garage_closed: 'the garage marked that day as a holiday before the payment went through',
  garage_paused: 'the garage paused new bookings before the payment went through',
  credit_exhausted: "the customer's Detlio credit was spent or ran out before the payment went through (only the card/UPI part is to refund)",
  request_gone: 'the garage’s yes to the request was no longer open (cancelled, or already confirmed) when the payment went through',
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

/**
 * The garage's deadline on a waiting row (0042): " · accept by Mon 19 Oct,
 * 10:42 am", or " · time to accept ran out Mon 19 Oct, 10:42 am" once it
 * has passed (the cron cancels it when AUTO_CANCEL_UNANSWERED is on).
 */
function deadlineNote(b: DigestBooking, now: Date): string {
  if (!b.respondBy) return ''
  return b.respondBy.getTime() > now.getTime()
    ? ` · accept by ${when(b.respondBy)}`
    : ` · time to accept ran out ${when(b.respondBy)}`
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
  return bookingTypeLabel(bookingType)
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
