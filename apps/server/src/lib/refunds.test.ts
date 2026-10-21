import { describe, expect, test } from 'bun:test'
import {
  afterRefund,
  amountOwed,
  billOwed,
  billRefundReason,
  bookingPaymentOwed,
  bookingRefundTotals,
  bookingRefundReason,
  checkoutOwed,
  checkRefund,
  customerRefund,
  isBillRefundable,
  isBookingPaymentRefundable,
  isCheckoutRefundable,
  isRazorpayRefundId,
  owedSince,
  refundBase,
  refundBookingNote,
  refundState,
  startedRefunds,
  storedRefundNote,
  type BookingForRefund,
  type CustomerRefundRecord,
  type PaymentForRefund,
} from './refunds.js'

const cancelled = (overrides: Partial<BookingForRefund> = {}): BookingForRefund => ({
  status: 'cancelled',
  noShow: null,
  moved: false,
  ...overrides,
})

const paid = (overrides: Partial<PaymentForRefund> = {}): PaymentForRefund => ({
  status: 'paid',
  amount: '499.00',
  refundedAmount: null,
  ...overrides,
})

describe('amountOwed', () => {
  test('is what was paid less what went back, in paise', () => {
    expect(amountOwed('499.00', null)).toBe('499.00')
    expect(amountOwed('499.00', '200.00')).toBe('299.00')
    expect(amountOwed('0.30', '0.10')).toBe('0.20')
  })

  test('is never below zero', () => {
    expect(amountOwed('499.00', '499.00')).toBe('0.00')
    expect(amountOwed('499.00', '600.00')).toBe('0.00')
  })
})

describe("a booking's own payment", () => {
  test('is owed back when the booking was cancelled, whoever cancelled it', () => {
    // The customer (in time), the garage declining, and Detlio: one rule.
    expect(bookingPaymentOwed(cancelled(), paid())).toBe('499.00')
    expect(isBookingPaymentRefundable(cancelled(), paid())).toBe(true)
  })

  test('is owed back in full on a garage no-show', () => {
    expect(bookingPaymentOwed(cancelled({ noShow: 'garage' }), paid())).toBe('499.00')
  })

  test('is kept on a customer no-show: the garage held the slot', () => {
    expect(bookingPaymentOwed(cancelled({ noShow: 'customer' }), paid())).toBe('0.00')
    expect(isBookingPaymentRefundable(cancelled({ noShow: 'customer' }), paid())).toBe(false)
  })

  test('is not owed on a booking that is still on, or finished', () => {
    for (const status of ['pending', 'confirmed', 'in_progress', 'completed']) {
      expect(bookingPaymentOwed(cancelled({ status }), paid())).toBe('0.00')
    }
  })

  test('is not owed when the customer moved the booking: the payment went with it', () => {
    expect(bookingPaymentOwed(cancelled({ moved: true }), paid())).toBe('0.00')
  })

  test('is not owed when no money arrived', () => {
    expect(bookingPaymentOwed(cancelled(), paid({ status: 'pending' }))).toBe('0.00')
    expect(bookingPaymentOwed(cancelled(), paid({ status: 'failed' }))).toBe('0.00')
    expect(bookingPaymentOwed(cancelled(), null)).toBe('0.00')
  })

  test('cash collected on a job is never refunded through here', () => {
    expect(bookingPaymentOwed(cancelled(), paid({ status: 'collected' }))).toBe('0.00')
  })

  test('a part refund leaves the rest owed', () => {
    expect(bookingPaymentOwed(cancelled(), paid({ refundedAmount: '200.00' }))).toBe('299.00')
  })

  test('a refunded payment owes nothing, but was refundable', () => {
    const refunded = paid({ status: 'refunded', refundedAmount: '499.00' })
    expect(bookingPaymentOwed(cancelled(), refunded)).toBe('0.00')
    expect(isBookingPaymentRefundable(cancelled(), refunded)).toBe(true)
  })
})

describe('a failed checkout', () => {
  const failed = { status: 'failed', paymentRef: 'pay_1', amount: '499.00', refundedAmount: null }

  test('with a captured payment is owed back', () => {
    expect(checkoutOwed(failed)).toBe('499.00')
    expect(isCheckoutRefundable(failed)).toBe(true)
  })

  test('without a payment, or that became a booking, owes nothing', () => {
    expect(checkoutOwed({ ...failed, paymentRef: null })).toBe('0.00')
    expect(checkoutOwed({ ...failed, status: 'consumed' })).toBe('0.00')
    expect(checkoutOwed({ ...failed, status: 'pending', paymentRef: null })).toBe('0.00')
  })

  test('refunded so far comes off', () => {
    expect(checkoutOwed({ ...failed, refundedAmount: '499.00' })).toBe('0.00')
    expect(checkoutOwed({ ...failed, refundedAmount: '99.00' })).toBe('400.00')
  })
})

describe('money paid on a final bill', () => {
  const paidBill = { status: 'paid', gatewayPaymentId: 'pay_bill', amountDue: '1200.00', refundedAmount: null }
  const stray = { status: 'cancelled', gatewayPaymentId: 'pay_stray', amountDue: '800.00', refundedAmount: null }

  test('a paid bill on a booking that was then cancelled is owed back', () => {
    expect(billOwed(paidBill, cancelled())).toBe('1200.00')
    expect(billOwed(paidBill, cancelled({ noShow: 'garage' }))).toBe('1200.00')
  })

  test('…but not on a customer no-show', () => {
    expect(billOwed(paidBill, cancelled({ noShow: 'customer' }))).toBe('0.00')
  })

  test('a paid bill on a job that went ahead is the garage\'s', () => {
    expect(billOwed(paidBill, { status: 'completed', noShow: null })).toBe('0.00')
    expect(billOwed(paidBill, { status: 'in_progress', noShow: null })).toBe('0.00')
  })

  test('a payment on a replaced or withdrawn bill is always owed back', () => {
    expect(billOwed(stray, { status: 'in_progress', noShow: null })).toBe('800.00')
    expect(billOwed(stray, cancelled({ noShow: 'customer' }))).toBe('800.00')
  })

  test('a bill nobody paid owes nothing', () => {
    for (const status of ['due', 'not_needed', 'cancelled']) {
      expect(
        isBillRefundable({ status, gatewayPaymentId: null }, cancelled())
      ).toBe(false)
    }
  })

  test('refunded so far comes off', () => {
    expect(billOwed({ ...stray, refundedAmount: '800.00' }, cancelled())).toBe('0.00')
  })
})

describe('refundState', () => {
  test('owed while anything is left, refunded once all of it went back', () => {
    expect(refundState('499.00', null)).toBe('owed')
    expect(refundState('299.00', '200.00')).toBe('owed')
    expect(refundState('0.00', '499.00')).toBe('refunded')
    expect(refundState('0.00', null)).toBe('none')
  })
})

describe('checkRefund', () => {
  const base = { refundable: true, paid: '499.00', refunded: null }

  test('the full amount owed, or any part of it, can be recorded', () => {
    expect(checkRefund({ ...base, amount: '499.00' })).toBe('ok')
    expect(checkRefund({ ...base, amount: 100 })).toBe('ok')
    expect(checkRefund({ ...base, refunded: '400.00', amount: '99.00' })).toBe('ok')
  })

  test('never more than is still owed', () => {
    expect(checkRefund({ ...base, amount: '499.01' })).toBe('too_much')
    expect(checkRefund({ ...base, refunded: '400.00', amount: '100.00' })).toBe('too_much')
    expect(checkRefund({ ...base, amount: 0 })).toBe('too_much')
  })

  test('a second full refund is refused as already refunded', () => {
    expect(checkRefund({ ...base, refunded: '499.00', amount: '499.00' })).toBe('already_refunded')
  })

  test('money that is not to go back is refused', () => {
    expect(checkRefund({ ...base, refundable: false, amount: '499.00' })).toBe('not_due')
  })
})

describe('afterRefund', () => {
  test('a full refund is full', () => {
    expect(afterRefund('499.00', null, '499.00')).toEqual({ refundedAmount: '499.00', full: true })
  })

  test('part refunds add up, and the last one completes it', () => {
    const first = afterRefund('499.00', null, '200.00')
    expect(first).toEqual({ refundedAmount: '200.00', full: false })
    expect(afterRefund('499.00', first.refundedAmount, '299.00')).toEqual({
      refundedAmount: '499.00',
      full: true,
    })
  })

  test('adds in paise', () => {
    expect(afterRefund('0.30', '0.10', '0.20')).toEqual({ refundedAmount: '0.30', full: true })
  })
})

describe('refundBase', () => {
  test('what the dialog saw, when it still holds', () => {
    expect(refundBase(0, null)).toBe('0.00')
    expect(refundBase(200, '200.00')).toBe('200.00')
  })

  test('a retry after a lost answer finds the total moved, and is refused', () => {
    // ₹200 recorded on a ₹499 checkout; the same request again saw ₹0.
    expect(refundBase(0, '200.00')).toBeNull()
    expect(refundBase(200, '400.00')).toBeNull()
  })

  test('a caller that sends nothing gets the total just read', () => {
    expect(refundBase(undefined, null)).toBe('0.00')
    expect(refundBase(undefined, '200.00')).toBe('200.00')
  })
})

describe('isRazorpayRefundId', () => {
  test('takes a Razorpay refund id', () => {
    expect(isRazorpayRefundId('rfnd_FP8QHiV938haTz')).toBe(true)
  })

  test('refuses a payment id, a bare prefix, spaces and anything else', () => {
    expect(isRazorpayRefundId('pay_FP8QHiV938haTz')).toBe(false)
    expect(isRazorpayRefundId('rfnd_')).toBe(false)
    expect(isRazorpayRefundId('rfnd_FP8Q HiV9')).toBe(false)
    expect(isRazorpayRefundId('RFND_FP8QHiV938haTz')).toBe(false)
    expect(isRazorpayRefundId(`rfnd_${'a'.repeat(60)}`)).toBe(false)
  })
})

describe('the words', () => {
  test('why a booking payment is owed', () => {
    const base = { noShow: null, cancelledBy: null, cancelledOnBehalfOf: null } as const
    expect(bookingRefundReason({ ...base, cancelledBy: 'user' })).toBe('Cancelled by the customer')
    expect(bookingRefundReason({ ...base, cancelledBy: 'vendor' })).toBe('Declined by the garage')
    // The cron's auto-cancel (0042): the garage's side, said as what happened.
    expect(bookingRefundReason({ ...base, cancelledBy: 'vendor', responseMissedAt: new Date() })).toBe(
      'Not accepted in time'
    )
    expect(bookingRefundReason({ ...base, cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio' })).toBe(
      'Cancelled by Detlio'
    )
    expect(bookingRefundReason({ ...base, cancelledBy: 'admin', cancelledOnBehalfOf: 'garage' })).toBe(
      "Cancelled by Detlio at the garage's request"
    )
    expect(
      bookingRefundReason({ noShow: 'garage', cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio' })
    ).toBe('Garage no-show')
  })

  test('why a bill payment is owed', () => {
    expect(billRefundReason({ status: 'cancelled', gatewayPaymentId: 'pay_1' })).toMatch(/replaced or withdrawn/)
    expect(billRefundReason({ status: 'paid', gatewayPaymentId: 'pay_1' })).toMatch(/then cancelled/)
  })

  test('the stored note says how money went back outside Razorpay', () => {
    expect(storedRefundNote({ outsideRazorpayNote: ' UPI to 98xxx ', note: 'Called first' })).toBe(
      'Refunded outside Razorpay: UPI to 98xxx\nCalled first'
    )
    expect(storedRefundNote({ note: '  ' })).toBeNull()
  })

  test('the booking note records the refund, and a part refund says the rest is owed', () => {
    expect(
      refundBookingNote({
        what: 'the booking payment',
        amount: '499.00',
        full: true,
        refundRef: 'rfnd_ABC123',
      })
    ).toBe('Refunded ₹499 of the booking payment in Razorpay (rfnd_ABC123).')
    expect(
      refundBookingNote({
        what: 'the booking payment',
        amount: '200.00',
        full: false,
        refundRef: null,
        outsideRazorpayNote: 'Bank transfer',
        note: 'Customer agreed',
      })
    ).toBe(
      'Refunded ₹200 of the booking payment outside Razorpay: Bank transfer.\nPart refund; the rest is still owed.\nCustomer agreed'
    )
  })
})

describe('owedSince', () => {
  test('is the later of the payment and what made it owed', () => {
    const paidAt = new Date('2026-10-01T10:00:00Z')
    const cancelledAt = new Date('2026-10-02T10:00:00Z')
    expect(owedSince(paidAt, cancelledAt)).toEqual(cancelledAt)
    // Paid after the booking was already cancelled.
    expect(owedSince(cancelledAt, new Date('2026-10-03T00:00:00Z'))).toEqual(
      new Date('2026-10-03T00:00:00Z')
    )
    expect(owedSince(null, undefined)).toBeNull()
  })
})

describe('customerRefund', () => {
  const refundedAt = new Date('2026-10-05T06:30:00Z')

  test('owed on a cancelled paid booking', () => {
    expect(customerRefund({ ...cancelled(), payment: { ...paid(), refundedAt: null } })).toEqual({
      status: 'owed',
      amount: '499.00',
      amountRefunded: '0.00',
      refundedAt: null,
    })
  })

  test('refunded, with when', () => {
    expect(
      customerRefund({
        ...cancelled(),
        payment: { ...paid({ status: 'refunded', refundedAmount: '499.00' }), refundedAt },
      })
    ).toEqual({
      status: 'refunded',
      amount: '499.00',
      amountRefunded: '499.00',
      refundedAt: refundedAt.toISOString(),
    })
  })

  test('a part refund is still owed, and says how much went back', () => {
    expect(
      customerRefund({ ...cancelled(), payment: { ...paid({ refundedAmount: '200.00' }), refundedAt } })
    ).toMatchObject({ status: 'owed', amount: '499.00', amountRefunded: '200.00' })
  })

  test('adds a paid bill on the cancelled booking to the payment', () => {
    expect(
      customerRefund({
        ...cancelled(),
        payment: { ...paid(), refundedAt: null },
        charges: [
          { status: 'paid', gatewayPaymentId: 'pay_b', amountDue: '1000.00', refundedAmount: null, refundedAt: null },
          // Replaced before anyone paid it: nothing to give back.
          { status: 'cancelled', gatewayPaymentId: null, amountDue: '700.00', refundedAmount: null, refundedAt: null },
        ],
      })
    ).toMatchObject({ status: 'owed', amount: '1499.00', amountRefunded: '0.00' })
  })

  test('a customer no-show is never told money is coming back', () => {
    expect(
      customerRefund({
        ...cancelled({ noShow: 'customer' }),
        payment: { ...paid(), refundedAt: null },
        charges: [
          { status: 'cancelled', gatewayPaymentId: 'pay_s', amountDue: '500.00', refundedAmount: null, refundedAt: null },
        ],
      }).status
    ).toBe('none')
  })

  test('nothing on a live booking, or a moved one', () => {
    expect(customerRefund({ ...cancelled({ status: 'confirmed' }), payment: { ...paid(), refundedAt: null } }).status).toBe('none')
    expect(customerRefund({ ...cancelled({ moved: true }), payment: { ...paid(), refundedAt: null } }).status).toBe('none')
  })
})

describe('bookingRefundTotals', () => {
  test("ops still sees a stray bill payment on a customer no-show, which the customer is not told about", () => {
    const booking = {
      ...cancelled({ noShow: 'customer' as const }),
      payment: paid(),
      charges: [{ status: 'cancelled', gatewayPaymentId: 'pay_s', amountDue: '500.00', refundedAmount: null }],
    }
    expect(bookingRefundTotals(booking)).toMatchObject({ paid: '500.00', owed: '500.00', refunded: '0.00' })
    expect(customerRefund(booking).status).toBe('none')
  })

  test('a payment marked refunded before amounts were recorded counts as all of it back', () => {
    expect(
      bookingRefundTotals({ ...cancelled(), payment: paid({ status: 'refunded', refundedAmount: null }) })
    ).toMatchObject({ owed: '0.00', refunded: '499.00' })
  })
})

describe('refunds started through Razorpay', () => {
  const at = new Date('2026-10-05T06:30:00Z')
  const sent = (overrides: Partial<CustomerRefundRecord> = {}): CustomerRefundRecord => ({
    amount: '499.00',
    recordedAt: at,
    source: 'admin',
    gatewayStatus: 'pending',
    ...overrides,
  })

  test('pending refunds the app sent are on their way, from the button or the automatic mode', () => {
    expect(startedRefunds([sent()])).toEqual({ amount: '499.00', at })
    const later = new Date('2026-10-06T06:30:00Z')
    expect(startedRefunds([sent({ amount: '200.00' }), sent({ amount: '99.50', source: 'auto', recordedAt: later })])).toEqual({
      amount: '299.50',
      at: later,
    })
  })

  test('a processed or failed one, or one recorded by hand, is not', () => {
    expect(startedRefunds([sent({ gatewayStatus: 'processed' })])).toBeNull()
    expect(startedRefunds([sent({ gatewayStatus: 'failed' })])).toBeNull()
    expect(startedRefunds([sent({ source: 'recorded', gatewayStatus: null })])).toBeNull()
    expect(startedRefunds([sent({ source: 'razorpay' })])).toBeNull()
    expect(startedRefunds([])).toBeNull()
  })

  test("the customer's payload carries it, and leaves it out when there is none", () => {
    const booking = {
      ...cancelled(),
      payment: { ...paid({ status: 'refunded', refundedAmount: '499.00' }), refundedAt: at },
    }
    expect(customerRefund(booking, [sent()])).toEqual({
      status: 'refunded',
      amount: '499.00',
      amountRefunded: '499.00',
      refundedAt: at.toISOString(),
      started: { amount: '499.00', at: at.toISOString() },
    })
    expect(customerRefund(booking)).not.toHaveProperty('started')
    // Never on a customer no-show, whatever is on the rows.
    expect(customerRefund({ ...booking, noShow: 'customer' }, [sent()])).not.toHaveProperty('started')
  })

  test('the booking note says who sent it', () => {
    const base = { what: 'the booking payment', amount: '499.00', full: true, refundRef: 'rfnd_X1' }
    expect(refundBookingNote({ ...base, source: 'admin' })).toBe(
      'Sent a refund of ₹499 of the booking payment through Razorpay from the app (rfnd_X1).'
    )
    expect(refundBookingNote({ ...base, source: 'auto' })).toBe(
      'Sent a refund of ₹499 of the booking payment through Razorpay automatically (rfnd_X1).'
    )
    expect(refundBookingNote({ ...base, source: 'razorpay' })).toBe(
      'Found a refund of ₹499 of the booking payment in Razorpay (rfnd_X1), done in the Razorpay dashboard, and recorded it.'
    )
    expect(refundBookingNote(base)).toBe('Refunded ₹499 of the booking payment in Razorpay (rfnd_X1).')
  })
})

describe('extra work (0041)', () => {
  const extra = (status: string, overrides: object = {}) => ({
    kind: 'extra_work',
    status,
    gatewayPaymentId: 'pay_x',
    amountDue: '450.00',
    refundedAmount: null,
    ...overrides,
  })

  test('kept when the booking completes, refunded when it ends any other way', () => {
    expect(isBillRefundable(extra('paid'), { status: 'completed', noShow: null })).toBe(false)
    expect(isBillRefundable(extra('paid'), { status: 'in_progress', noShow: null })).toBe(false)
    expect(isBillRefundable(extra('paid'), { status: 'cancelled', noShow: null })).toBe(true)
    expect(isBillRefundable(extra('paid'), { status: 'cancelled', noShow: 'garage' })).toBe(true)
  })

  test('a customer no-show keeps the booking payment and a final bill, but not extra work never done', () => {
    expect(isBillRefundable(extra('paid'), { status: 'cancelled', noShow: 'customer' })).toBe(true)
    expect(
      isBillRefundable({ ...extra('paid'), kind: 'final_bill' }, { status: 'cancelled', noShow: 'customer' })
    ).toBe(false)

    const noShow = {
      ...cancelled({ noShow: 'customer' }),
      payment: paid(),
      charges: [extra('paid')],
    }
    expect(bookingRefundTotals(noShow)).toEqual({ paid: '450.00', owed: '450.00', refunded: '0.00', refundedAt: null })
    expect(customerRefund(noShow)).toMatchObject({ status: 'owed', amount: '450.00' })
    // Without extra work, the no-show still reads nothing to refund.
    expect(customerRefund({ ...noShow, charges: [] }).status).toBe('none')
  })

  test('a payment on a withdrawn or declined request always goes back; unpaid ones owe nothing', () => {
    expect(isBillRefundable(extra('cancelled'), { status: 'completed', noShow: null })).toBe(true)
    expect(isBillRefundable(extra('cancelled', { gatewayPaymentId: null }), { status: 'cancelled', noShow: null })).toBe(false)
    expect(isBillRefundable(extra('due', { gatewayPaymentId: null }), { status: 'cancelled', noShow: null })).toBe(false)
  })

  test('a cancelled booking owes its payment and its paid extra work, added up', () => {
    const totals = bookingRefundTotals({ ...cancelled(), payment: paid(), charges: [extra('paid'), extra('paid')] })
    expect(totals).toMatchObject({ paid: '1399.00', owed: '1399.00' })
    expect(billOwed(extra('paid', { refundedAmount: '200.00' }), { status: 'cancelled', noShow: null })).toBe('250.00')
  })

  test('named as extra work for the team', () => {
    expect(billRefundReason(extra('paid'))).toBe('Extra work paid on a booking that was not completed')
    expect(billRefundReason(extra('cancelled'))).toBe('Extra work paid after it was withdrawn or declined')
    expect(billRefundReason({ ...extra('paid'), kind: 'final_bill' })).toBe(
      'Final bill paid on a booking that was then cancelled'
    )
  })
})

describe('customerRefund with Detlio credit (0049)', () => {
  const returnedAt = new Date('2026-10-05T06:30:00Z')

  test('a booking paid wholly with credit: owed back as credit, then back', () => {
    const owed = customerRefund({
      ...cancelled(),
      payment: { ...paid({ amount: '0.00', creditAmount: '499.00' }), refundedAt: null },
    })
    expect(owed).toEqual({
      status: 'owed',
      amount: '499.00',
      amountRefunded: '0.00',
      refundedAt: null,
      credit: { amount: '499.00', returnedAt: null },
    })
    const back = customerRefund({
      ...cancelled(),
      payment: {
        ...paid({ status: 'refunded', amount: '0.00', creditAmount: '499.00', creditReturnedAt: returnedAt }),
        refundedAt: null,
      },
    })
    expect(back).toEqual({
      status: 'refunded',
      amount: '499.00',
      amountRefunded: '499.00',
      refundedAt: returnedAt.toISOString(),
      credit: { amount: '499.00', returnedAt: returnedAt.toISOString() },
    })
  })

  test('part credit: the credit is back, the card part still owed as money', () => {
    const view = customerRefund({
      ...cancelled(),
      payment: { ...paid({ amount: '199.00', creditAmount: '300.00', creditReturnedAt: returnedAt }), refundedAt: null },
    })
    expect(view).toMatchObject({ status: 'owed', amount: '499.00', amountRefunded: '300.00' })
    // Only the card part is money owed: the refund rules never see the credit.
    expect(bookingPaymentOwed(cancelled(), paid({ amount: '199.00', creditAmount: '300.00' }))).toBe('199.00')
  })

  test('a customer no-show keeps the credit part too', () => {
    expect(
      customerRefund({
        ...cancelled({ noShow: 'customer' }),
        payment: { ...paid({ amount: '0.00', creditAmount: '499.00' }), refundedAt: null },
      })
    ).toEqual({ status: 'none', amount: '0.00', amountRefunded: '0.00', refundedAt: null })
  })

  test('a moved booking owes nothing: its payment, credit and all, went with it', () => {
    expect(
      customerRefund({
        ...cancelled({ moved: true }),
        payment: { ...paid({ amount: '0.00', creditAmount: '499.00' }), refundedAt: null },
      }).status
    ).toBe('none')
  })
})
