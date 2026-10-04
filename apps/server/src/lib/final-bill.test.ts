import { describe, expect, test } from 'bun:test'
import {
  FINAL_BILL_WINDOW_DAYS,
  chargeSettlement,
  finalBillAmountDue,
  finalBillRefusal,
  finalBillStatus,
  finalBillTotal,
  liveFinalBill,
  paidChargesTotal,
  creditAtBooking,
  type ChargeForSettlement,
} from './final-bill.js'
import { computeVendorPayout } from './discounts.js'
import { sumAmounts } from './pricing.js'

const NOW = new Date('2026-10-05T10:00:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000)

describe('finalBillTotal', () => {
  test('adds the lines in paise, so a total is never a paisa off', () => {
    expect(finalBillTotal([{ amount: 0.1 }, { amount: 0.2 }])).toBe('0.30')
    expect(finalBillTotal([{ amount: '1499.50' }, { amount: '300.25' }])).toBe('1799.75')
  })
})

describe('finalBillAmountDue', () => {
  test('is what is left after the inspection fee', () => {
    expect(finalBillAmountDue('2500.00', '299.00')).toBe('2201.00')
  })

  test('is nothing when the work came to no more than was paid — no partial refund', () => {
    expect(finalBillAmountDue('299.00', '299.00')).toBe('0.00')
    expect(finalBillAmountDue('150.00', '299.00')).toBe('0.00')
  })

  test('works in paise', () => {
    expect(finalBillAmountDue('1000.10', '999.90')).toBe('0.20')
  })
})

describe('finalBillStatus', () => {
  test('a balance is due; none is not needed', () => {
    expect(finalBillStatus('0.01')).toBe('due')
    expect(finalBillStatus('0.00')).toBe('not_needed')
  })
})

describe('creditAtBooking', () => {
  const paid = { status: 'paid' }

  test('credits the booking once its payment has landed', () => {
    expect(creditAtBooking({ amount: '299.00', subtotalAmount: '299.00', payment: paid })).toBe('299.00')
    expect(
      creditAtBooking({ amount: '450', subtotalAmount: null, payment: { status: 'collected' } })
    ).toBe('450.00')
  })

  test('credits the pre-discount price, so the promo code stays the customer\'s', () => {
    // ₹299 inspection, ₹100 off: the customer paid ₹199 and was promised ₹100 off.
    expect(creditAtBooking({ amount: '199.00', subtotalAmount: '299.00', payment: paid })).toBe('299.00')
  })

  test('counts nothing that did not arrive', () => {
    const booking = { amount: '299.00', subtotalAmount: '299.00' }
    expect(creditAtBooking({ ...booking, payment: { status: 'pending' } })).toBe('0.00')
    expect(creditAtBooking({ ...booking, payment: { status: 'failed' } })).toBe('0.00')
    expect(creditAtBooking({ ...booking, payment: null })).toBe('0.00')
  })

  describe('with a discount, the garage is paid its bill and the customer keeps the saving', () => {
    // A ₹2,500 bill on a ₹299 inspection booked with ₹100 off.
    const booking = { amount: '199.00', subtotalAmount: '299.00', payment: paid }
    const total = '2500.00'
    const due = finalBillAmountDue(total, creditAtBooking(booking))

    test('the balance is the bill less the booking\'s price', () => {
      expect(due).toBe('2201.00')
    })

    test('the customer pays the bill less the discount', () => {
      expect(sumAmounts([booking.amount, due])).toBe('2400.00')
    })

    test('Detlio funds it: the garage gets exactly its bill', () => {
      const payout = computeVendorPayout({ ...booking, discountFundedBy: 'platform' })
      expect(sumAmounts([payout, due])).toBe(total)
    })

    test('the garage funds it: the garage gets its bill less its own discount', () => {
      const payout = computeVendorPayout({ ...booking, discountFundedBy: 'vendor' })
      expect(sumAmounts([payout, due])).toBe('2400.00')
    })
  })
})

describe('finalBillRefusal', () => {
  const base = {
    status: 'in_progress',
    pricingTypes: ['flat', 'on_inspection'],
    completedAt: null,
    scheduledAt: hoursAgo(2),
    now: NOW,
  }

  test('an inspection job that has started can be billed', () => {
    expect(finalBillRefusal(base)).toBeNull()
  })

  test('only a booking with an inspection-priced service', () => {
    expect(finalBillRefusal({ ...base, pricingTypes: ['flat', 'per_vehicle'] })).toBe('not_inspection')
    expect(finalBillRefusal({ ...base, pricingTypes: [] })).toBe('not_inspection')
  })

  test('not before the garage has started the job', () => {
    expect(finalBillRefusal({ ...base, status: 'pending' })).toBe('not_started')
    expect(finalBillRefusal({ ...base, status: 'confirmed' })).toBe('not_started')
  })

  test('never on a cancelled or moved booking', () => {
    expect(finalBillRefusal({ ...base, status: 'cancelled' })).toBe('booking_closed')
    expect(finalBillRefusal({ ...base, status: 'rescheduled' })).toBe('booking_closed')
  })

  test(`a completed job for ${FINAL_BILL_WINDOW_DAYS} days after completion`, () => {
    const completed = { ...base, status: 'completed' }
    expect(finalBillRefusal({ ...completed, completedAt: new Date(NOW - 3 * DAY + 60_000) })).toBeNull()
    expect(finalBillRefusal({ ...completed, completedAt: new Date(NOW - 3 * DAY - 60_000) })).toBe(
      'window_closed'
    )
  })

  test('a job completed before completion times were kept counts from its slot', () => {
    expect(
      finalBillRefusal({ ...base, status: 'completed', completedAt: null, scheduledAt: new Date(NOW - 4 * DAY) })
    ).toBe('window_closed')
  })
})

describe('chargeSettlement', () => {
  const due: ChargeForSettlement = {
    status: 'due',
    amountDue: '2201.00',
    gatewayOrderId: 'order_1',
    gatewayPaymentId: null,
  }
  const pay = { orderId: 'order_1', paymentId: 'pay_1' }

  test('a due bill paid through its own order is settled', () => {
    expect(chargeSettlement(due, pay)).toBe('settle')
    expect(chargeSettlement(due, { ...pay, amountPaise: 220100 })).toBe('settle')
  })

  test('the same payment arriving again (verify, then webhook) is already paid', () => {
    const paid = { ...due, status: 'paid' as const, gatewayPaymentId: 'pay_1' }
    expect(chargeSettlement(paid, pay)).toBe('already_paid')
    expect(chargeSettlement(paid, { ...pay, amountPaise: 220100 })).toBe('already_paid')
  })

  test('a different payment on a paid bill is money taken twice', () => {
    const paid = { ...due, status: 'paid' as const, gatewayPaymentId: 'pay_1' }
    expect(chargeSettlement(paid, { orderId: 'order_1', paymentId: 'pay_2' })).toBe('paid_twice')
  })

  test('a payment for another order is refused', () => {
    expect(chargeSettlement(due, { orderId: 'order_9', paymentId: 'pay_1' })).toBe('order_mismatch')
    expect(chargeSettlement({ ...due, gatewayOrderId: null }, pay)).toBe('order_mismatch')
    expect(chargeSettlement(due, { orderId: undefined, paymentId: 'pay_1' })).toBe('order_mismatch')
  })

  test('the webhook refuses an amount that is not the amount due', () => {
    expect(chargeSettlement(due, { ...pay, amountPaise: 220000 })).toBe('amount_mismatch')
  })

  test('a bill the garage replaced while the customer paid is a refund', () => {
    expect(chargeSettlement({ ...due, status: 'cancelled' }, pay)).toBe('replaced')
    // Recorded once; the second arrival gets the same answer.
    expect(
      chargeSettlement({ ...due, status: 'cancelled', gatewayPaymentId: 'pay_1' }, pay)
    ).toBe('replaced')
  })

  test('a bill with nothing to pay is never settled', () => {
    expect(chargeSettlement({ ...due, status: 'not_needed', amountDue: '0.00' }, { ...pay })).toBe(
      'not_due'
    )
  })
})

describe('liveFinalBill', () => {
  test('is the bill that was not replaced', () => {
    const bills = [
      { id: 'new', kind: 'final_bill' as const, status: 'due' as const },
      { id: 'old', kind: 'final_bill' as const, status: 'cancelled' as const },
    ]
    expect(liveFinalBill(bills)?.id).toBe('new')
    expect(liveFinalBill([bills[1]])).toBeNull()
    expect(liveFinalBill(undefined)).toBeNull()
  })
})

describe('paidChargesTotal', () => {
  test('adds only the bills that were paid', () => {
    expect(
      paidChargesTotal([
        { status: 'paid', amountDue: '1000.10' },
        { status: 'due', amountDue: '500.00' },
        { status: 'cancelled', amountDue: '200.00' },
        { status: 'paid', amountDue: '0.20' },
      ])
    ).toBe('1000.30')
    expect(paidChargesTotal(null)).toBe('0.00')
  })
})
