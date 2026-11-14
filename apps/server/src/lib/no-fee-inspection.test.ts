/**
 * An inspection with no fee (0073) downstream: a booking whose payment is
 * 'paid' with ₹0 (no Razorpay order, no credit, no code), priced whole by the
 * garage's final bill. Each money rule it meets, held to what it must do.
 */
import { describe, expect, test } from 'bun:test'
import { AppError } from './errors.js'
import { bookingCommission, chainCommission, earnsPayout, mainItem, type CommissionBooking } from './commission.js'
import { assertSomethingToDiscount, computeVendorPayout } from './discounts.js'
import { earningKind } from './earnings.js'
import { creditAtBooking, finalBillAmountDue, finalBillRefusal, finalBillStatus, finalBillTotal } from './final-bill.js'
import { customerNotAcceptedInTime } from './push-messages.js'
import { buildReceipt, paymentMethodLabel, type ReceiptBooking } from './receipts.js'
import { bookingPaymentOwed, isBookingPaymentRefundable } from './refunds.js'

const PAID = { status: 'paid', amount: '0.00', refundedAmount: null, creditAmount: '0.00' }

describe('the final bill starts from ₹0', () => {
  const booking = {
    amount: '0.00',
    subtotalAmount: '0.00',
    payment: { status: 'paid' },
    items: [{ amount: '0.00', isAddon: false }],
  }

  test('nothing was paid at booking, so nothing is credited', () => {
    expect(creditAtBooking(booking)).toBe('0.00')
  })

  test('the whole bill is due, paid in the app', () => {
    const total = finalBillTotal([{ amount: '1200.00' }, { amount: '350.00' }])
    const due = finalBillAmountDue(total, creditAtBooking(booking))
    expect(due).toBe('1550.00')
    expect(finalBillStatus(due)).toBe('due')
  })

  test('a paid add-on still credits nothing toward it', () => {
    const withAddOn = {
      amount: '99.00',
      subtotalAmount: '99.00',
      payment: { status: 'paid' },
      items: [
        { amount: '0.00', isAddon: false },
        { amount: '99.00', isAddon: true },
      ],
    }
    expect(creditAtBooking(withAddOn)).toBe('0.00')
  })

  test('it can be raised once the job starts, as on any inspection job', () => {
    const now = Date.now()
    expect(
      finalBillRefusal({ status: 'in_progress', pricingTypes: ['on_inspection'], completedAt: null, scheduledAt: new Date(now), now })
    ).toBeNull()
  })
})

describe('commission and payout', () => {
  const booking = (overrides: Partial<CommissionBooking> = {}): CommissionBooking => ({
    status: 'completed',
    noShow: null,
    paymentStatus: 'paid',
    paymentRefunded: '0.00',
    amount: '0.00',
    subtotalAmount: '0.00',
    discountFundedBy: null,
    items: [{ category: 'scratch_removal', amount: '0.00', pricingType: 'on_inspection', sortOrder: 0 }],
    billsPaid: null,
    ...overrides,
  })

  test('the booking itself pays the garage nothing and owes no commission', () => {
    expect(computeVendorPayout(booking())).toBe('0.00')
    expect(bookingCommission(booking())).toBe(0)
  })

  test('the paid bill is charged at the inspection service rate (5% on scratch removal)', () => {
    expect(mainItem(booking().items)?.pricingType).toBe('on_inspection')
    expect(bookingCommission(booking({ billsPaid: '2000.00' }))).toBe(100)
    expect(chainCommission(booking({ billsPaid: '2000.00' }), 30)).toBe(100)
  })

  test('a completed job earns its payout (the bill), as any job', () => {
    expect(earnsPayout(booking())).toBe(true)
    expect(earningKind({ status: 'completed', payment: PAID })).toBe('job')
  })
})

describe('cancellation and refunds', () => {
  test('nothing to refund: ₹0 is owed back whoever cancels', () => {
    for (const noShow of [null, 'garage'] as const) {
      const cancelled = { status: 'cancelled', noShow, moved: false }
      expect(isBookingPaymentRefundable(cancelled, PAID)).toBe(true)
      expect(bookingPaymentOwed(cancelled, PAID)).toBe('0.00')
    }
  })

  test('the not-accepted push promises no refund and no free wash', () => {
    const body = customerNotAcceptedInTime(
      { id: 'b1', scheduledAt: new Date('2026-11-20T05:30:00Z'), bookingType: 'dropin', vendor: { businessName: 'Adyar Car Spa' } },
      { nothingPaid: true, freeWash: false }
    ).body
    expect(body).toBe('Nothing was charged. Book another garage in Detlio.')
  })

  test('a free wash still hears its free wash is back', () => {
    const body = customerNotAcceptedInTime(
      { id: 'b1', scheduledAt: new Date('2026-11-20T05:30:00Z'), bookingType: 'dropin' },
      { nothingPaid: true, freeWash: true }
    ).body
    expect(body).toContain('your free wash is back')
  })
})

describe('promo codes', () => {
  test('refused on ₹0 services: nothing to take off, and a use would be spent', () => {
    let refusal: unknown
    try {
      assertSomethingToDiscount('0.00')
    } catch (error) {
      refusal = error
    }
    expect(refusal).toBeInstanceOf(AppError)
    expect((refusal as AppError).code).toBe('DISCOUNT_NOTHING_TO_PAY')
    expect(() => assertSomethingToDiscount('99.00')).not.toThrow()
  })
})

describe('the receipt', () => {
  test('says how it was paid: nothing at booking', () => {
    expect(paymentMethodLabel('online', 0, 0, false, true)).toBe('Price on inspection: nothing paid at booking')
    // A part of it paid (an add-on) is paid online as usual.
    expect(paymentMethodLabel('online', 9900, 0, false, false)).toBe('Online (Razorpay)')
  })

  test('shows ₹0 paid at booking and the final bill paid in the app', () => {
    const booking: ReceiptBooking = {
      id: '3f2a9c1b-0000-4000-8000-000000007301',
      status: 'completed',
      bookingType: 'dropin',
      scheduledAt: new Date('2026-11-20T05:30:00Z'),
      amount: '0.00',
      subtotalAmount: '0.00',
      discountAmount: '0.00',
      discountCode: null,
      paymentMethod: 'online',
      items: [
        { name: 'Dent repair', amount: '0.00', service: { pricingType: 'on_inspection' } },
        // A flat-priced line is never marked, whatever its amount.
        { name: 'Foam wash', amount: '0.00', service: { pricingType: 'flat' } },
      ],
      payment: {
        status: 'paid',
        amount: '0.00',
        gatewayTxnId: null,
        paidAt: new Date('2026-11-17T05:30:00Z'),
        createdAt: new Date('2026-11-17T05:30:00Z'),
        refundedAmount: null,
        refundRef: null,
        refundedAt: null,
      },
      charges: [
        {
          id: 'b111d0e1-0000-4000-8000-000000007301',
          kind: 'final_bill',
          status: 'paid',
          totalAmount: '1550.00',
          paidBefore: '0.00',
          amountDue: '1550.00',
          lines: [{ description: 'Dent repair', amount: '1550.00' }],
          gatewayPaymentId: 'pay_B1i2L3l4P5a6I7',
          paidAt: new Date('2026-11-20T09:30:00Z'),
          refundedAmount: null,
          refundRef: null,
          refundedAt: null,
        },
      ],
    }
    const receipt = buildReceipt(booking, [], 'DTL/26-27/000123')
    expect(receipt.bookingPayment.amount).toBe('0.00')
    expect(receipt.bookingPayment.method).toBe('Price on inspection: nothing paid at booking')
    expect(receipt.bookingPayment.paymentId).toBeNull()
    expect(receipt.finalBill?.balancePaid).toBe('1550.00')
    expect(receipt.totalPaid).toBe('1550.00')
    // The inspection line says "Price on inspection" on the client, never ₹0.
    expect(receipt.items).toEqual([
      { name: 'Dent repair', amount: '0.00', priceOnInspection: true },
      { name: 'Foam wash', amount: '0.00' },
    ])
  })
})
