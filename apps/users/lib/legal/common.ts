/**
 * Sentences and figures more than one legal page uses, so the pages cannot
 * drift apart. Every booking figure in RULES is imported from @repo/core,
 * not typed here. The notice periods, the change cutoff and the refund
 * wording are the very constants the app uses; the rest (reschedules,
 * checkout lifetime, job photos, the final-bill window) are core's mirrors of
 * server constants, each commented with the server file to change with it.
 */
import { inlineToPlain, orTbc, tbc } from './doc-format'
import {
  BOOKING_DAYS_AHEAD,
  CHECKOUT_MINUTES,
  CONFIRMED_CHANGE_CUTOFF_MINS,
  MAX_RESCHEDULES,
  MIN_NOTICE_MINS,
} from '@repo/core/booking-types'
import {
  FINAL_BILL_WINDOW_DAYS,
  MAX_JOB_PHOTOS_PER_STAGE,
  PHOTO_EDIT_WINDOW_DAYS,
} from '@repo/core/job-records'
import { BANK_DAYS, customerRefundLine } from '@repo/core/refunds'
import { RECEIPT_NOT_TAX_INVOICE } from '@repo/core/receipts'
import { SUPPORT_WHATSAPP_HREF } from '@repo/core/support'
import {
  BUSINESS,
  DISPUTE_WINDOW_DAYS,
  GRIEVANCE_OFFICER,
} from './details'
import { LEGAL_PATHS } from './routes'

const hours = (mins: number) => {
  const h = mins / 60
  return h === 1 ? '1 hour' : `${h} hours`
}

/** The booking rules the server enforces, in words. */
export const RULES = {
  /** "1 hour" — At garage minimum notice (slots.ts MIN_NOTICE_MS). */
  noticeAtGarage: hours(MIN_NOTICE_MINS.dropin),
  /** "3 hours" — Doorstep minimum notice. */
  noticeDoorstep: hours(MIN_NOTICE_MINS.doorstep),
  /** "2 hours" — the cancel/reschedule cutoff once a garage has accepted. */
  changeCutoff: hours(CONFIRMED_CHANGE_CUTOFF_MINS),
  /** MAX_RESCHEDULES in apps/server/src/modules/bookings/bookings.service.ts. */
  maxReschedules: MAX_RESCHEDULES,
  /** How far ahead the slot picker offers days (slot-picker.tsx buildDateOptions). */
  daysAhead: BOOKING_DAYS_AHEAD,
  /** Job photos per stage, and how long after completion they can change (lib/job-records.ts). */
  photosPerStage: MAX_JOB_PHOTOS_PER_STAGE,
  photosFrozenAfterDays: PHOTO_EDIT_WINDOW_DAYS,
  /** FINAL_BILL_WINDOW_DAYS in apps/server/src/lib/final-bill.ts. */
  finalBillWindowDays: FINAL_BILL_WINDOW_DAYS,
  /** The checkout's lifetime (booking-intents.service.ts INTENT_TTL_MS). */
  checkoutMinutes: CHECKOUT_MINUTES,
  /** "5–7 working days", as the booking page says it. */
  refundDays: BANK_DAYS,
  /**
   * The booking page's own line while a refund is owed ("Our team will
   * refund your payment to your original payment method within …"),
   * produced by the function that writes it there, so the policy can quote
   * it and never misquote it.
   */
  refundOwedLine: customerRefundLine({ status: 'owed', amount: 0, amountRefunded: 0 }) ?? '',
  /** The receipt's own footer line. */
  receiptLine: RECEIPT_NOT_TAX_INVOICE,
}

/**
 * "a sole proprietorship", or "a sole proprietorship of <name>" when
 * details.ts says to print the name (a "[to be confirmed: …]" marker until it
 * is filled in).
 */
export const PROPRIETORSHIP = BUSINESS.printProprietorName
  ? `a sole proprietorship of ${orTbc(BUSINESS.proprietorName, "the proprietor's full name")}`
  : 'a sole proprietorship'

/** One line naming the business behind Detlio. */
export const WHO_WE_ARE = `Detlio is a brand of **${BUSINESS.tradeName}**, ${PROPRIETORSHIP}, with its place of business at ${BUSINESS.address}.`

/**
 * The same, as plain text for the site footer (E-Commerce Rules rule 4(2)).
 */
export const OPERATED_BY = inlineToPlain(
  `Detlio is a brand of ${BUSINESS.tradeName}, ${PROPRIETORSHIP}, ${BUSINESS.address}.`
)

export const SUPPORT_HOURS = orTbc(BUSINESS.supportHours, 'support hours')

/** Phone, WhatsApp and email as links. */
export const PHONE_LINK = `[${BUSINESS.phone}](${BUSINESS.phoneHref})`
export const WHATSAPP_LINK = `[WhatsApp](${SUPPORT_WHATSAPP_HREF})`
export const EMAIL_LINK = `[${BUSINESS.email}](mailto:${BUSINESS.email})`
export const CONTACT_LINE = `call ${PHONE_LINK} or message us on ${WHATSAPP_LINK} (${SUPPORT_HOURS}), or email ${EMAIL_LINK}`

export const OFFICER_NAME = orTbc(GRIEVANCE_OFFICER.name, "Grievance Officer's name")
export const OFFICER_DESIGNATION = orTbc(
  GRIEVANCE_OFFICER.designation,
  "Grievance Officer's designation"
)

/** "within [to be confirmed: number of days] days" */
export const DISPUTE_WINDOW =
  DISPUTE_WINDOW_DAYS == null
    ? `within ${tbc('number of days to report a problem')} days`
    : `within ${DISPUTE_WINDOW_DAYS} days`

/** Links to the other pages, in their usual words. */
export const LINK = {
  terms: `[Terms of Use](${LEGAL_PATHS.terms})`,
  privacy: `[Privacy Policy](${LEGAL_PATHS.privacy})`,
  refunds: `[Cancellation & Refund Policy](${LEGAL_PATHS.refunds})`,
  delivery: `[Service Delivery Policy](${LEGAL_PATHS.delivery})`,
  contact: `[Contact & Grievances](${LEGAL_PATHS.contact})`,
}
