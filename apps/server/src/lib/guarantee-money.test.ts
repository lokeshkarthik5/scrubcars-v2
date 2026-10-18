/**
 * Detlio Guarantee (0051): the money, across the libs that decide it. A free
 * redo is ₹0 and earns nobody anything; a refund instead of a redo is owed
 * back through lib/refunds.ts, never twice, and the garage's share is taken
 * back as a negative payout line when it was already paid.
 */
import { describe, expect, test } from 'bun:test'
import { chainCommission, earnsPayout, queuePositions, type QueuedChain } from './commission.js'
import { isZeroPayment } from './data-reset.js'
import { earningKind } from './earnings.js'
import { REDO_MONEY } from './guarantee.js'
import { bookingEarning, bookingBalance, statementLines, type EarningChain } from './payouts.js'
import { receiptAvailability } from './receipts.js'
import { autoRefundCause } from './refund-sending.js'
import {
  bookingPaymentOwed,
  bookingRefundReason,
  bookingRefundTotals,
  checkRefund,
  customerRefund,
  isBookingPaymentRefundable,
} from './refunds.js'

const DONE = new Date('2026-10-16T06:00:00.000Z')
const SLOT = new Date('2026-10-16T04:30:00.000Z')
const PAYING = 26

const chain = (overrides: Partial<EarningChain> = {}): EarningChain => ({
  rootId: 'r0001',
  vendorId: 'marina',
  status: 'completed',
  noShow: null,
  paymentMethod: 'online',
  paymentStatus: 'paid',
  paymentRefunded: '0.00',
  amount: '500.00',
  subtotalAmount: '500.00',
  discountFundedBy: null,
  items: [{ category: 'car_wash', amount: '500.00', pricingType: 'flat', sortOrder: 0 }],
  billsPaid: null,
  lastBillPaidAt: null,
  refunds: [],
  scheduledAt: SLOT,
  completedAt: DONE,
  cancelledAt: null,
  noShowMarkedAt: null,
  markedTest: false,
  ...overrides,
})

describe('the free redo: ₹0, no commission, no payout, no receipt', () => {
  test('earns the garage nothing, even completed', () => {
    expect(earningKind({ status: 'completed', guaranteeRedo: true, payment: { status: 'paid' } })).toBeNull()
  })

  test('uses up none of the free 25 and so shifts nobody into commission', () => {
    const queue: QueuedChain[] = [
      { rootId: 'a', vendorId: 'g', status: 'completed', acceptedBy: null, paymentStatus: 'paid', bookedAt: new Date(1), markedTest: false },
      { rootId: 'redo', vendorId: 'g', status: 'completed', acceptedBy: null, paymentStatus: 'paid', bookedAt: new Date(2), markedTest: false, guaranteeRedo: true },
      { rootId: 'b', vendorId: 'g', status: 'completed', acceptedBy: null, paymentStatus: 'paid', bookedAt: new Date(3), markedTest: false },
    ]
    const positions = queuePositions(queue)
    expect(positions.get('a')).toBe(1)
    expect(positions.has('redo')).toBe(false)
    expect(positions.get('b')).toBe(2)
  })

  test('its money is nothing, so commission on it is nothing whatever its place', () => {
    const redo = {
      status: 'completed',
      noShow: null,
      paymentStatus: REDO_MONEY.payment.status,
      paymentRefunded: null,
      amount: REDO_MONEY.amount,
      subtotalAmount: REDO_MONEY.subtotalAmount,
      discountFundedBy: null,
      items: [{ category: 'car_wash' as const, amount: '0.00', sortOrder: 0 }],
      billsPaid: null,
    }
    expect(chainCommission(redo, 100)).toBe(0)
    const earning = bookingEarning(chain({ amount: '0.00', subtotalAmount: '0.00', items: redo.items }), PAYING)
    expect(earning.duePaise).toBe(0)
    expect(earning.commissionPaise).toBe(0)
  })

  test('no receipt number: no money changed hands', () => {
    expect(receiptAvailability({ status: 'completed', moved: false, payment: { status: 'paid' }, guaranteeRedo: true })).toBe(
      'free_redo'
    )
    expect(receiptAvailability({ status: 'completed', moved: false, payment: { status: 'paid' } })).toBe('available')
  })

  test('nothing to refund if it is cancelled: ₹0 owed', () => {
    const cancelled = { status: 'cancelled', noShow: null, moved: false }
    expect(bookingPaymentOwed(cancelled, { status: 'paid', amount: '0.00' })).toBe('0.00')
  })

  test('the test-data reset sees no money on it', () => {
    expect(isZeroPayment({ amount: '0.00', creditAmount: '0.00', gatewayTxnId: null })).toBe(true)
    expect(isZeroPayment({ amount: '0.00', creditAmount: '500.00', gatewayTxnId: null })).toBe(false)
    expect(isZeroPayment({ amount: '500.00', creditAmount: '0.00', gatewayTxnId: null })).toBe(false)
    expect(isZeroPayment({ amount: '0.00', creditAmount: '0.00', gatewayTxnId: 'pay_x' })).toBe(false)
  })
})

describe('a refund instead of a redo', () => {
  const completed = { status: 'completed', noShow: null, moved: false, guaranteeRefund: true }

  test("the completed job's payment is owed back, and only with Detlio's mark", () => {
    expect(isBookingPaymentRefundable(completed, { status: 'paid' })).toBe(true)
    expect(isBookingPaymentRefundable({ ...completed, guaranteeRefund: false }, { status: 'paid' })).toBe(false)
    expect(bookingPaymentOwed(completed, { status: 'paid', amount: '600.00' })).toBe('600.00')
    // The mark never makes an unfinished or unpaid booking refundable.
    expect(isBookingPaymentRefundable({ ...completed, status: 'confirmed' }, { status: 'paid' })).toBe(false)
    expect(isBookingPaymentRefundable(completed, { status: 'pending' })).toBe(false)
  })

  test('never twice, never more than paid', () => {
    expect(checkRefund({ refundable: true, paid: '600.00', refunded: '600.00', amount: '1' })).toBe('already_refunded')
    expect(checkRefund({ refundable: true, paid: '600.00', refunded: '0', amount: '600.01' })).toBe('too_much')
    expect(bookingPaymentOwed(completed, { status: 'paid', amount: '600.00', refundedAmount: '600.00' })).toBe('0.00')
    expect(bookingPaymentOwed(completed, { status: 'refunded', amount: '600.00', refundedAmount: '600.00' })).toBe('0.00')
  })

  test('the customer is told what is owed, the credit part as credit', () => {
    const refund = customerRefund({
      ...completed,
      payment: { status: 'paid', amount: '400.00', creditAmount: '200.00' },
    })
    expect(refund.status).toBe('owed')
    expect(refund.amount).toBe('600.00')
    expect(refund.credit).toEqual({ amount: '200.00', returnedAt: null })
    expect(bookingRefundTotals({ ...completed, payment: { status: 'paid', amount: '400.00' } }).owed).toBe('400.00')
  })

  test('the Refunds page says why; the automatic mode takes it as Detlio’s own decision', () => {
    expect(
      bookingRefundReason({ noShow: null, cancelledBy: null, cancelledOnBehalfOf: null, guaranteeRefundAt: DONE })
    ).toBe('Detlio Guarantee: refund instead of a redo')
    expect(autoRefundCause({ ...completed, cancelledBy: null })).toBe('guarantee_refund')
    expect(autoRefundCause({ ...completed, guaranteeRefund: false, cancelledBy: null })).toBeNull()
  })

  test('the garage earns nothing on the job, before or after the refund is sent', () => {
    expect(earningKind({ status: 'completed', guaranteeRefundAt: DONE, payment: { status: 'paid' } })).toBeNull()
    expect(earnsPayout({ status: 'completed', noShow: null, paymentStatus: 'paid', paymentRefunded: null, guaranteeRefund: true })).toBe(false)
    const earning = bookingEarning(chain({ guaranteeRefund: true }), PAYING)
    expect(earning.kind).toBeNull()
    expect(earning.duePaise).toBe(0)
  })

  test("a payout already made on it comes back as a negative line, taken off the next payout", () => {
    const paidOut = [{ payoutId: 'p1', amountPaise: 46_000, reference: 'UTR1', paidAt: DONE }]
    const before = bookingBalance(bookingEarning(chain(), PAYING), paidOut)
    expect(before).toEqual({ settledPaise: 46_000, balancePaise: 0, status: 'paid' })

    const refunded = chain({ guaranteeRefund: true })
    const after = bookingBalance(bookingEarning(refunded, PAYING), paidOut)
    expect(after).toEqual({ settledPaise: 46_000, balancePaise: -46_000, status: 'owed_back' })

    // On the statement: one line, owed back in full.
    const lines = statementLines([refunded], new Map([[refunded.rootId, PAYING]]), new Map([[refunded.rootId, paidOut]]))
    expect(lines).toHaveLength(1)
    expect(lines[0]!.balance.balancePaise).toBe(-46_000)
  })

  test('not paid out yet: nothing to pay and nothing owed back', () => {
    const lines = statementLines([chain({ guaranteeRefund: true })], new Map(), new Map())
    expect(lines).toHaveLength(0)
  })
})
