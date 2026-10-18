// Discount math and the condition checks that need nothing but the row itself.
// Shared by the customer preview endpoint and the booking write path, the same
// way lib/pricing.ts is shared by the vendor, admin and booking service layers.
//
// The two checks that need the database — per-user and total usage limits —
// live in modules/discounts/discounts.service.ts, which composes them with
// everything here into the single `resolveDiscount()` entry point. Nothing
// else may compute a discount.
//
// Money is numeric(10,2) rupee strings at rest and integer paise in here, so
// no float ever crosses a boundary.

import { AppError } from './errors.js'

export type DiscountType = 'percentage' | 'fixed'
export type DiscountFundedBy = 'platform' | 'vendor'

// Razorpay rejects an order of zero (`toPaise()` in lib/razorpay.ts throws on
// <= 0), so every resolved booking must keep at least this much payable. The
// engine clamps to it rather than erroring: a ₹500-off code on a ₹300 wash
// charges ₹1 instead of failing at checkout.
export const MIN_PAYABLE_PAISE = 100

// The columns the math and the row-local checks actually read. Deliberately
// narrower than the full table so callers can pass a partial select.
export interface DiscountRule {
  id: string
  code: string
  discountType: DiscountType
  percentOff: string | null
  amountOff: string | null
  maxDiscountAmount: string | null
  minOrderAmount: string | null
  vendorId: string | null
  fundedBy: DiscountFundedBy
  startsAt: Date | null
  endsAt: Date | null
  isActive: boolean
}

export interface DiscountComputation {
  /** Rupees taken off, as a numeric(10,2) string. */
  discountAmount: string
  /** What the customer pays, as a numeric(10,2) string. Always >= ₹1. */
  finalAmount: string
}

export function rupeesToPaise(amount: string | number): number {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount

  if (!Number.isFinite(value)) {
    throw new AppError(500, 'Invalid amount', 'INVALID_AMOUNT')
  }

  return Math.round(value * 100)
}

export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2)
}

export function formatRupees(amount: string | number): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

/**
 * What `discount` takes off `subtotal`, and what is left to charge.
 *
 * The result is clamped into [0, subtotal - ₹1]: a percentage can never round
 * past the whole price, and an oversized flat code is trimmed rather than
 * refused. Percentages are evaluated in integer basis points so a rate like
 * 33.33% cannot drift.
 */
export function computeDiscount(
  discount: Pick<
    DiscountRule,
    'discountType' | 'percentOff' | 'amountOff' | 'maxDiscountAmount'
  >,
  subtotal: string,
  /**
   * The part of the subtotal the code applies to, when it is limited to one
   * service type (a printed coupon's voucher, 0056): a percentage is taken
   * of it and nothing more than it comes off. Omitted, the whole subtotal.
   */
  eligibleSubtotal?: string
): DiscountComputation {
  const subtotalPaise = rupeesToPaise(subtotal)
  const basePaise = eligibleSubtotal === undefined ? subtotalPaise : Math.min(rupeesToPaise(eligibleSubtotal), subtotalPaise)

  let raw: number

  if (discount.discountType === 'percentage') {
    const bps = Math.round(Number.parseFloat(discount.percentOff ?? '0') * 100)
    raw = Math.floor((basePaise * bps) / 10_000)

    if (discount.maxDiscountAmount) {
      raw = Math.min(raw, rupeesToPaise(discount.maxDiscountAmount))
    }
  } else {
    raw = rupeesToPaise(discount.amountOff ?? '0')
  }

  const maxAllowed = Math.max(0, Math.min(basePaise, subtotalPaise - MIN_PAYABLE_PAISE))
  const discountPaise = Math.min(Math.max(raw, 0), maxAllowed)

  return {
    discountAmount: paiseToRupees(discountPaise),
    finalAmount: paiseToRupees(subtotalPaise - discountPaise),
  }
}

/**
 * Every condition that can be judged from the discount row alone, in the order
 * the customer should hear about them. Throws the first failure.
 *
 * Unlike the Medici engine this reports *why* a code failed. There are no
 * private or sandbox-gated codes here, so nothing leaks — and "add ₹200 more"
 * is the difference between a customer completing the booking and abandoning
 * it. Revisit if a hidden code type is ever introduced.
 */
export function assertRuleApplies(
  discount: DiscountRule,
  context: { vendorId: string; subtotal: string; now?: Date }
): void {
  const now = context.now ?? new Date()

  if (!discount.isActive) {
    throw new AppError(
      400,
      'This code is no longer active.',
      'DISCOUNT_INACTIVE'
    )
  }

  if (discount.startsAt && now < discount.startsAt) {
    throw new AppError(
      400,
      "This code isn't active yet.",
      'DISCOUNT_NOT_STARTED'
    )
  }

  if (discount.endsAt && now > discount.endsAt) {
    throw new AppError(400, 'This code has expired.', 'DISCOUNT_EXPIRED')
  }

  if (discount.vendorId && discount.vendorId !== context.vendorId) {
    throw new AppError(
      400,
      "This code isn't valid at this garage.",
      'DISCOUNT_NOT_FOR_VENDOR'
    )
  }

  if (discount.minOrderAmount) {
    const minPaise = rupeesToPaise(discount.minOrderAmount)
    const subtotalPaise = rupeesToPaise(context.subtotal)

    if (subtotalPaise < minPaise) {
      throw new AppError(
        400,
        `This code needs a booking of ${formatRupees(discount.minOrderAmount)} or more.`,
        'DISCOUNT_MIN_ORDER'
      )
    }
  }
}

/**
 * What the garage is owed for a booking.
 *
 * A platform-funded discount is Detlio's marketing spend, so the garage is
 * still paid the full pre-discount price; a vendor-funded one comes out of the
 * garage's own take. Computed here so the branch exists in exactly one place —
 * the web Earnings screen reads the result, not the rule.
 */
export function computeVendorPayout(booking: {
  amount: string
  subtotalAmount: string
  discountFundedBy: DiscountFundedBy | null
}): string {
  return booking.discountFundedBy === 'platform'
    ? booking.subtotalAmount
    : booking.amount
}
