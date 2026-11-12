import { formatINR } from './format'
import { t } from './i18n/translate'
import type { FinalBill, PricingType } from './types'

/**
 * A booking of an inspection with no fee (0073), in words: what its price
 * slot says while nothing was paid at booking and the garage's final bill is
 * still to come, sent or paid. Never "₹0": only the booking was free, not the
 * job. One place for the words, so the customer's web and app, the garage's
 * portal and app, and the receipt all say the same thing.
 *
 * The no-fee words for a service (before it is booked) are pricing.ts's.
 */

/** "Price on inspection": a no-fee inspection line, on the receipt and the booking page. */
export const INSPECTION_LINE_PRICE = 'Price on inspection'

/** What the booking-level words read of a booking. */
export interface NoFeeInspectionBookingFields {
  items: ReadonlyArray<{ pricingType?: PricingType; isAddon?: boolean; amount: number }>
  /** The pre-discount price: ₹0 only when the inspection had no fee and nothing else was priced. */
  subtotalPrice: number
  guaranteeRedo?: boolean
}

/**
 * Booked with nothing to pay because its inspection had no fee: an
 * inspection line and a ₹0 subtotal (a paid add-on makes it a paid
 * booking). A free redo (0051) is ₹0 for its own reason.
 */
export function isNoFeeInspectionBooking(booking: NoFeeInspectionBookingFields): boolean {
  if (booking.guaranteeRedo) return false
  return (
    Math.round(booking.subtotalPrice * 100) === 0 &&
    booking.items.some((item) => item.pricingType === 'on_inspection' && !item.isAddon)
  )
}

/** A booked line whose ₹0 is not its price: an inspection with no fee. */
export function isNoFeeInspectionLine(item: { pricingType?: PricingType; amount: number }): boolean {
  return item.pricingType === 'on_inspection' && !(item.amount > 0)
}

/**
 * A booked line's price: what it was sold at, or "Price on inspection" for
 * a no-fee inspection line.
 */
export function bookedLinePrice(
  item: { pricingType?: PricingType; amount: number },
  format: (amount: number) => string = formatINR
): string {
  return isNoFeeInspectionLine(item) ? t(INSPECTION_LINE_PRICE) : format(item.amount)
}

/** The garage's final bill as these words read it: sent (its total) and whether it is paid. */
export interface SentBill {
  total: number
  paid: boolean
}

/** The bill that stands, once sent; null before it is (or when it was withdrawn). */
export function sentBillOf(bill: Pick<FinalBill, 'status' | 'total'> | null | undefined): SentBill | null {
  if (!bill || bill.status === 'cancelled') return null
  return { total: bill.total, paid: bill.status === 'paid' || bill.status === 'not_needed' }
}

/** A no-fee inspection booking's price slot: the words, or the bill's total once sent. */
export interface NoFeeInspectionPrice {
  text: string
  /** The bill's total once sent; null while the slot is words. */
  amount: number | null
  /** The bill is paid. */
  paid: boolean
}

/**
 * The customer's words: "Price after inspection" until the garage sends its
 * bill, then the bill's total (paid or not).
 */
export function customerInspectionPrice(
  bill: SentBill | null,
  format: (amount: number) => string = formatINR
): NoFeeInspectionPrice {
  if (!bill) return { text: t('Price after inspection'), amount: null, paid: false }
  return { text: format(bill.total), amount: bill.total, paid: bill.paid }
}

/**
 * The garage's words: "Price on inspection · bill not sent" until it sends
 * its bill, then the bill's total.
 */
export function garageInspectionPrice(
  bill: SentBill | null,
  format: (amount: number) => string = formatINR
): NoFeeInspectionPrice {
  if (!bill) return { text: t('Price on inspection · bill not sent'), amount: null, paid: false }
  return { text: format(bill.total), amount: bill.total, paid: bill.paid }
}

/**
 * The customer's price slot for a booking: null for any booking but a
 * no-fee inspection one, which keeps its own figures.
 */
export function customerBookingInspectionPrice(
  booking: NoFeeInspectionBookingFields & { finalBill?: Pick<FinalBill, 'status' | 'total'> | null },
  format: (amount: number) => string = formatINR
): NoFeeInspectionPrice | null {
  if (!isNoFeeInspectionBooking(booking)) return null
  return customerInspectionPrice(sentBillOf(booking.finalBill), format)
}

/** The garage's price slot for a booking, as customerBookingInspectionPrice. */
export function garageBookingInspectionPrice(
  booking: NoFeeInspectionBookingFields & { finalBill?: Pick<FinalBill, 'status' | 'total'> | null },
  format: (amount: number) => string = formatINR
): NoFeeInspectionPrice | null {
  if (!isNoFeeInspectionBooking(booking)) return null
  return garageInspectionPrice(sentBillOf(booking.finalBill), format)
}

/**
 * The customer booking page's payment row for a no-fee inspection booking:
 * "Pay after inspection" with "Price after inspection" until the bill comes,
 * "Final bill" with its total while it is due, and "Paid" with its total
 * once paid. Null for any other booking.
 */
export function inspectionPaymentRow(
  booking: NoFeeInspectionBookingFields & { finalBill?: Pick<FinalBill, 'status' | 'total'> | null },
  format: (amount: number) => string = formatINR
): { label: string; value: string; numeric: boolean } | null {
  const price = customerBookingInspectionPrice(booking, format)
  if (!price) return null
  if (price.amount === null) return { label: t('Pay after inspection'), value: price.text, numeric: false }
  return { label: price.paid ? t('Paid') : t('Final bill'), value: price.text, numeric: true }
}

/**
 * The line under checkout's button: "By paying you agree…", or "By booking
 * you agree…" when nothing is paid (a no-fee inspection, a free wash,
 * Detlio credit). `parts` are the two placeholders' names, which differ
 * between the web ({part}, {part2}) and the app ({terms}, {policy}); the
 * words are the same.
 */
export function checkoutAgreement(toPay: number | null, parts: 'web' | 'app'): string {
  const nothingPaid = toPay === 0
  if (parts === 'web') {
    return nothingPaid
      ? t('By booking you agree to the {part} and the {part2}.')
      : t('By paying you agree to the {part} and the {part2}.')
  }
  return nothingPaid
    ? t('By booking you agree to the {terms} and the {policy}.')
    : t('By paying you agree to the {terms} and the {policy}.')
}

/**
 * Whether the customer's lists may say "Paid" of a booking: its payment
 * landed, and for a no-fee inspection booking (whose ₹0 payment paid for
 * nothing) only once the final bill is paid too.
 */
export function customerSeesPaid(
  booking: NoFeeInspectionBookingFields & {
    paymentStatus: string
    finalBill?: Pick<FinalBill, 'status' | 'total'> | null
  }
): boolean {
  if (booking.paymentStatus !== 'paid') return false
  const inspection = customerBookingInspectionPrice(booking)
  return inspection ? inspection.paid : true
}
