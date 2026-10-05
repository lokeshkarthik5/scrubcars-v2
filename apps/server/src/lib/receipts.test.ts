import { describe, expect, test } from 'bun:test'
import {
  REFUND_METHODS,
  RECEIPT_ISSUER,
  buildReceipt,
  istDateLabel,
  istDateTimeLabel,
  istSlotLabel,
  maskPhone,
  receiptAvailability,
  receiptNumber,
  receiptStatusLabel,
  type ReceiptBill,
  type ReceiptBooking,
  type ReceiptRefundRecord,
} from './receipts.js'

const BOOKING_ID = '3f2a9c1b-0000-4000-8000-000000000001'
// 3 Oct 2026, 09:05 IST — the morning the customer paid.
const PAID_AT = new Date('2026-10-03T03:35:00Z')
// Sat 3 Oct 2026, 10:00 IST.
const SLOT = new Date('2026-10-03T04:30:00Z')

const booking = (overrides: Partial<ReceiptBooking> = {}): ReceiptBooking => ({
  id: BOOKING_ID,
  status: 'completed',
  bookingType: 'dropin',
  scheduledAt: SLOT,
  amount: '499.00',
  subtotalAmount: '499.00',
  discountAmount: '0.00',
  discountCode: null,
  paymentMethod: 'online',
  noShow: null,
  user: { name: 'Kavya Raman', phone: '9876504321' },
  vendor: { businessName: 'Adyar Car Spa', address: '12, LB Road, Adyar', city: 'Chennai' },
  items: [{ name: 'Express Wash', amount: '499.00' }],
  service: { name: 'Express Wash' },
  payment: {
    status: 'paid',
    amount: '499.00',
    gatewayTxnId: 'pay_N1a2B3c4D5e6F7',
    paidAt: PAID_AT,
    createdAt: new Date('2026-10-03T03:30:00Z'),
    refundedAmount: null,
    refundRef: null,
    refundedAt: null,
  },
  charges: [],
  ...overrides,
})

const record = (overrides: Partial<ReceiptRefundRecord> = {}): ReceiptRefundRecord => ({
  kind: 'booking',
  targetId: BOOKING_ID,
  amount: '499.00',
  refundRef: 'rfnd_Q1w2E3r4T5y6U7',
  recordedAt: new Date('2026-10-04T06:00:00Z'),
  ...overrides,
})

const bill = (overrides: Partial<ReceiptBill> = {}): ReceiptBill => ({
  id: 'b111d0e1-0000-4000-8000-000000000001',
  kind: 'final_bill',
  status: 'paid',
  totalAmount: '2500.00',
  paidBefore: '299.00',
  amountDue: '2201.00',
  lines: [
    { description: 'Dent inspection', amount: '299.00' },
    { description: 'Rear bumper respray', amount: '2201.00' },
  ],
  gatewayPaymentId: 'pay_B1i2L3l4P5a6I7',
  paidAt: new Date('2026-10-03T09:30:00Z'),
  refundedAmount: null,
  refundRef: null,
  refundedAt: null,
  ...overrides,
})

describe('receiptNumber', () => {
  test('is DTL, the IST date of the first payment and the booking reference', () => {
    expect(receiptNumber(BOOKING_ID, PAID_AT)).toBe('DTL-261003-3F2A9C1B')
  })

  test('uses the IST date, not the UTC one, either side of midnight', () => {
    // 2 Oct 23:59 IST is still the 2nd; 3 Oct 00:00 IST is the 3rd, while UTC
    // still says the 2nd for both.
    expect(receiptNumber(BOOKING_ID, new Date('2026-10-02T18:29:59Z'))).toBe('DTL-261002-3F2A9C1B')
    expect(receiptNumber(BOOKING_ID, new Date('2026-10-02T18:30:00Z'))).toBe('DTL-261003-3F2A9C1B')
  })

  test('is the same every time for the same booking', () => {
    expect(buildReceipt(booking(), []).receiptNumber).toBe(buildReceipt(booking(), []).receiptNumber)
  })

  test('a moved booking keeps the number its payment had before the move', () => {
    // A reschedule copies the payment (same pay_ id, same paid_at) to the new
    // booking, which points at the first one of its chain.
    const moved = buildReceipt(
      booking({ id: 'a7b8c9d0-0000-4000-8000-000000000002', originalBookingId: BOOKING_ID }),
      []
    )
    expect(moved.receiptNumber).toBe(buildReceipt(booking(), []).receiptNumber)
    expect(moved.receiptNumber).toBe('DTL-261003-3F2A9C1B')
    // The booking row is still the booking in hand, with where it began.
    expect(moved.booking).toMatchObject({ reference: 'A7B8C9D0', originalReference: '3F2A9C1B' })
  })
})

describe('IST labels', () => {
  test('dates and times read as the customer saw them in India', () => {
    expect(istDateLabel(PAID_AT)).toBe('3 Oct 2026')
    expect(istDateTimeLabel(PAID_AT)).toBe('3 Oct 2026, 9:05 AM IST')
    expect(istSlotLabel(SLOT)).toBe('Sat, 3 Oct 2026, 10:00 AM IST')
  })

  test('noon and midnight are 12, not 0', () => {
    expect(istDateTimeLabel(new Date('2026-10-03T06:30:00Z'))).toBe('3 Oct 2026, 12:00 PM IST')
    expect(istDateTimeLabel(new Date('2026-10-02T18:35:00Z'))).toBe('3 Oct 2026, 12:05 AM IST')
  })
})

describe('maskPhone', () => {
  test('shows only the last four digits', () => {
    expect(maskPhone('9876504321')).toBe('+91 ******4321')
  })

  test('reads a number however it was stored', () => {
    expect(maskPhone('+91 98765 04321')).toBe('+91 ******4321')
  })

  test('never shows a number too short to mask', () => {
    expect(maskPhone('123')).toBe('+91 **********')
  })
})

describe('receiptAvailability', () => {
  test('a payment that went through has a receipt, refunded since or not', () => {
    for (const status of ['paid', 'collected', 'refunded']) {
      expect(receiptAvailability({ status: 'completed', moved: false, payment: { status } })).toBe('available')
    }
  })

  test('cancelled bookings and no-shows still have one: the customer paid', () => {
    expect(receiptAvailability({ status: 'cancelled', moved: false, payment: { status: 'paid' } })).toBe('available')
  })

  test('nothing paid, nothing to show', () => {
    for (const status of ['pending', 'failed']) {
      expect(receiptAvailability({ status: 'pending', moved: false, payment: { status } })).toBe('unpaid')
    }
    expect(receiptAvailability({ status: 'pending', moved: false, payment: null })).toBe('unpaid')
  })

  test('a moved booking has none: its payment went with the move', () => {
    expect(receiptAvailability({ status: 'cancelled', moved: true, payment: { status: 'paid' } })).toBe('moved')
    expect(receiptAvailability({ status: 'rescheduled', moved: false, payment: { status: 'paid' } })).toBe('moved')
  })
})

describe('buildReceipt: a plain paid booking', () => {
  const receipt = buildReceipt(booking(), [])

  test('names the platform, the customer (masked) and the garage', () => {
    expect(receipt.issuer.name).toBe('Detlio')
    expect(receipt.issuer.supportPhone).toBe(RECEIPT_ISSUER.supportPhone)
    expect(receipt.customer).toEqual({ name: 'Kavya Raman', phone: '+91 ******4321' })
    expect(receipt.garage).toEqual({ name: 'Adyar Car Spa', address: '12, LB Road, Adyar, Chennai' })
  })

  test("adds the garage's city only when its address does not already name it", () => {
    const vendor = { businessName: 'Adyar Car Spa', address: '12, LB Road, Adyar, Chennai 600020', city: 'Chennai' }
    expect(buildReceipt(booking({ vendor }), []).garage.address).toBe('12, LB Road, Adyar, Chennai 600020')
  })

  test('is dated by the first payment', () => {
    expect(receipt.issuedAt).toBe(PAID_AT.toISOString())
    expect(receipt.issuedOn).toBe('3 Oct 2026')
  })

  test('describes the booking', () => {
    expect(receipt.booking).toEqual({
      id: BOOKING_ID,
      reference: '3F2A9C1B',
      originalReference: null,
      bookingType: 'dropin',
      status: 'completed',
      statusLabel: 'Completed',
      scheduledAt: SLOT.toISOString(),
      scheduledAtLabel: 'Sat, 3 Oct 2026, 10:00 AM IST',
    })
  })

  test('lists the services as sold and what was paid at booking', () => {
    expect(receipt.items).toEqual([{ name: 'Express Wash', amount: '499.00' }])
    expect(receipt.subtotal).toBe('499.00')
    expect(receipt.discount).toBeNull()
    expect(receipt.bookingPayment).toEqual({
      amount: '499.00',
      method: 'Online (Razorpay)',
      paymentId: 'pay_N1a2B3c4D5e6F7',
      paidAt: PAID_AT.toISOString(),
      paidAtLabel: '3 Oct 2026, 9:05 AM IST',
    })
    expect(receipt.finalBill).toBeNull()
    expect(receipt.refunds).toEqual([])
    expect(receipt).toMatchObject({ totalPaid: '499.00', totalRefunded: '0.00', netPaid: '499.00' })
  })

  test('never shows a Razorpay order id as the payment id', () => {
    const payment = { ...booking().payment!, gatewayTxnId: 'order_N1a2B3c4D5e6F7' }
    expect(buildReceipt(booking({ payment }), []).bookingPayment.paymentId).toBeNull()
  })

  test('a booking from before booking_items is one line: its service at the subtotal', () => {
    const receipt = buildReceipt(booking({ items: [] }), [])
    expect(receipt.items).toEqual([{ name: 'Express Wash', amount: '499.00' }])
  })

  test('an old cash booking says cash and has no payment id', () => {
    const payment = { ...booking().payment!, status: 'collected', gatewayTxnId: null }
    const receipt = buildReceipt(booking({ paymentMethod: 'cash', payment }), [])
    expect(receipt.bookingPayment).toMatchObject({ method: 'Cash', paymentId: null })
  })

  test('refuses a booking with no payment at all', () => {
    expect(() => buildReceipt(booking({ payment: null }), [])).toThrow()
  })
})

describe('buildReceipt: a discount', () => {
  const receipt = buildReceipt(
    booking({
      amount: '2298.00',
      subtotalAmount: '2498.00',
      discountAmount: '200.00',
      discountCode: 'SAVE20',
      items: [
        { name: 'Express Wash', amount: '499.00' },
        { name: 'Full Body Detail', amount: '1999.00' },
      ],
      payment: { ...booking().payment!, amount: '2298.00' },
    }),
    []
  )

  test('shows the subtotal, the code and what came off', () => {
    expect(receipt.items).toHaveLength(2)
    expect(receipt.subtotal).toBe('2498.00')
    expect(receipt.discount).toEqual({ code: 'SAVE20', amount: '200.00' })
  })

  test('the total paid is the discounted figure the customer was charged', () => {
    expect(receipt.bookingPayment.amount).toBe('2298.00')
    expect(receipt).toMatchObject({ totalPaid: '2298.00', netPaid: '2298.00' })
  })
})

describe('buildReceipt: a final bill', () => {
  const inspection = {
    items: [{ name: 'Dent Inspection', amount: '299.00' }],
    amount: '299.00',
    subtotalAmount: '299.00',
    payment: { ...booking().payment!, amount: '299.00' },
  }

  test('a paid bill is its own section: lines, total, what the booking covered, the balance', () => {
    const receipt = buildReceipt(booking({ ...inspection, charges: [bill()] }), [])
    expect(receipt.finalBill).toEqual({
      lines: [
        { description: 'Dent inspection', amount: '299.00' },
        { description: 'Rear bumper respray', amount: '2201.00' },
      ],
      total: '2500.00',
      creditedFromBooking: '299.00',
      discount: null,
      balancePaid: '2201.00',
      paymentId: 'pay_B1i2L3l4P5a6I7',
      paidAt: '2026-10-03T09:30:00.000Z',
      paidAtLabel: '3 Oct 2026, 3:00 PM IST',
    })
    // The booking and the balance: the bill's total, nothing counted twice.
    expect(receipt).toMatchObject({ totalPaid: '2500.00', netPaid: '2500.00' })
  })

  test('with a promo code at checkout, the saving stays off the total', () => {
    const receipt = buildReceipt(
      booking({
        ...inspection,
        amount: '249.00',
        discountAmount: '50.00',
        discountCode: 'FIFTY',
        payment: { ...booking().payment!, amount: '249.00' },
        charges: [bill()],
      }),
      []
    )
    expect(receipt.totalPaid).toBe('2450.00')
  })

  test('with a promo code, the credit is split: what was paid at booking, then the discount', () => {
    const receipt = buildReceipt(
      booking({
        ...inspection,
        amount: '249.00',
        discountAmount: '50.00',
        discountCode: 'FIFTY',
        payment: { ...booking().payment!, amount: '249.00' },
        charges: [bill()],
      }),
      []
    )
    // Never a "paid" figure larger than what the customer paid: the bill's
    // credit of ₹299 is the ₹249 paid plus the ₹50 discount kept.
    expect(receipt.finalBill).toMatchObject({
      total: '2500.00',
      creditedFromBooking: '249.00',
      discount: { code: 'FIFTY', amount: '50.00' },
      balancePaid: '2201.00',
    })
    expect(receipt.finalBill!.creditedFromBooking).toBe(receipt.bookingPayment.amount)
  })

  test('a bill not yet paid, not needed, or replaced took no money and is not shown', () => {
    for (const status of ['due', 'not_needed', 'cancelled']) {
      const charges = [bill({ status, paidAt: null, gatewayPaymentId: null })]
      const receipt = buildReceipt(booking({ ...inspection, charges }), [])
      expect(receipt.finalBill).toBeNull()
      expect(receipt.totalPaid).toBe('299.00')
    }
  })

  test('a payment on a replaced bill, and its refund, stay off this receipt', () => {
    const stray = bill({ id: 'b111d0e1-0000-4000-8000-000000000009', status: 'cancelled' })
    const receipt = buildReceipt(booking({ ...inspection, charges: [stray, bill()] }), [
      record({ kind: 'bill', targetId: stray.id, amount: '2201.00' }),
    ])
    expect(receipt.refunds).toEqual([])
    expect(receipt).toMatchObject({ totalPaid: '2500.00', totalRefunded: '0.00', netPaid: '2500.00' })
  })

  test("a refund of the bill's balance is a line of its own", () => {
    const receipt = buildReceipt(
      booking({ ...inspection, status: 'cancelled', charges: [bill({ refundedAmount: '2201.00' })] }),
      [record({ kind: 'bill', targetId: bill().id, amount: '2201.00' })]
    )
    expect(receipt.refunds).toEqual([
      expect.objectContaining({ against: 'final_bill', amount: '2201.00' }),
    ])
    expect(receipt).toMatchObject({ totalPaid: '2500.00', totalRefunded: '2201.00', netPaid: '299.00' })
  })
})

describe('buildReceipt: refunds', () => {
  const cancelled = { status: 'cancelled' }

  test('a part refund is a negative line, and the rest stays paid', () => {
    const payment = { ...booking().payment!, refundedAmount: '200.00', refundRef: 'rfnd_Q1w2E3r4T5y6U7' }
    const receipt = buildReceipt(booking({ ...cancelled, payment }), [record({ amount: '200.00' })])
    expect(receipt.refunds).toEqual([
      {
        against: 'booking',
        amount: '200.00',
        refundedAt: '2026-10-04T06:00:00.000Z',
        refundedAtLabel: '4 Oct 2026',
        method: REFUND_METHODS.razorpay,
        reference: 'rfnd_Q1w2E3r4T5y6U7',
      },
    ])
    expect(receipt).toMatchObject({ totalPaid: '499.00', totalRefunded: '200.00', netPaid: '299.00' })
  })

  test('a full refund brings the net to nothing', () => {
    const payment = {
      ...booking().payment!,
      status: 'refunded',
      refundedAmount: '499.00',
      refundRef: 'rfnd_Q1w2E3r4T5y6U7',
      refundedAt: new Date('2026-10-04T06:00:00Z'),
    }
    const receipt = buildReceipt(booking({ ...cancelled, payment }), [record()])
    expect(receipt.booking.statusLabel).toBe('Cancelled')
    expect(receipt.refunds).toHaveLength(1)
    expect(receipt).toMatchObject({ totalPaid: '499.00', totalRefunded: '499.00', netPaid: '0.00' })
  })

  test('two part refunds are two lines, oldest first', () => {
    const payment = { ...booking().payment!, status: 'refunded', refundedAmount: '499.00' }
    const receipt = buildReceipt(booking({ ...cancelled, payment }), [
      record({ amount: '299.00', refundRef: 'rfnd_Second0000002', recordedAt: new Date('2026-10-05T06:00:00Z') }),
      record({ amount: '200.00', refundRef: 'rfnd_First00000001', recordedAt: new Date('2026-10-04T06:00:00Z') }),
    ])
    expect(receipt.refunds.map((refund) => refund.reference)).toEqual([
      'rfnd_First00000001',
      'rfnd_Second0000002',
    ])
    expect(receipt.netPaid).toBe('0.00')
  })

  test('a refund made outside Razorpay shows no reference, and never the team’s note', () => {
    const payment = { ...booking().payment!, refundedAmount: '499.00', status: 'refunded' }
    const receipt = buildReceipt(booking({ ...cancelled, payment }), [record({ refundRef: null })])
    expect(receipt.refunds[0].reference).toBeNull()
    expect(JSON.stringify(receipt)).not.toContain('note')
  })

  test('a refund made outside Razorpay does not claim it went to the original payment method', () => {
    const payment = { ...booking().payment!, refundedAmount: '499.00', status: 'refunded' }
    const receipt = buildReceipt(booking({ ...cancelled, payment }), [record({ refundRef: null })])
    expect(receipt.refunds).toEqual([
      expect.objectContaining({ amount: '499.00', method: 'Refunded directly by Detlio', reference: null }),
    ])
  })

  test('a refund marked by hand before refunds were recorded, with no id, names no route', () => {
    const payment = {
      ...booking().payment!,
      status: 'refunded',
      refundedAmount: null,
      refundRef: null,
      refundedAt: new Date('2026-09-20T06:00:00Z'),
    }
    const receipt = buildReceipt(booking({ ...cancelled, payment }), [])
    expect(receipt.refunds).toEqual([
      expect.objectContaining({ amount: '499.00', method: 'Refunded', reference: null }),
    ])
  })

  test('a payment marked refunded before refunds were recorded is still a full refund line', () => {
    const payment = {
      ...booking().payment!,
      status: 'refunded',
      refundedAmount: null,
      refundRef: 'rfnd_Legacy0000001',
      refundedAt: new Date('2026-09-20T06:00:00Z'),
    }
    const receipt = buildReceipt(booking({ ...cancelled, payment }), [])
    expect(receipt.refunds).toEqual([
      expect.objectContaining({
        amount: '499.00',
        refundedAtLabel: '20 Sep 2026',
        // Its own Razorpay id: it went back through Razorpay.
        method: REFUND_METHODS.razorpay,
        reference: 'rfnd_Legacy0000001',
      }),
    ])
    expect(receipt.netPaid).toBe('0.00')
  })

  test('a refund on the row that the records do not cover is added, not lost', () => {
    const payment = { ...booking().payment!, status: 'refunded', refundedAmount: '499.00' }
    const receipt = buildReceipt(booking({ ...cancelled, payment }), [record({ amount: '200.00' })])
    expect(receipt.refunds.map((refund) => refund.amount).sort()).toEqual(['200.00', '299.00'])
    expect(receipt.totalRefunded).toBe('499.00')
    // The record's line has its Razorpay id; the remainder's route is unknown.
    const remainder = receipt.refunds.find((refund) => refund.amount === '299.00')
    expect(remainder).toMatchObject({ method: REFUND_METHODS.unknown, reference: null })
  })

  test("another booking's refunds are not this one's", () => {
    const receipt = buildReceipt(booking(), [record({ targetId: 'someone-else' })])
    expect(receipt.refunds).toEqual([])
  })
})

describe('buildReceipt: no-shows', () => {
  test('a customer no-show has a receipt for the money it kept', () => {
    const receipt = buildReceipt(booking({ status: 'cancelled', noShow: 'customer' }), [])
    expect(receipt.booking.statusLabel).toBe('No-show')
    expect(receipt.refunds).toEqual([])
    expect(receipt).toMatchObject({ totalPaid: '499.00', netPaid: '499.00' })
  })

  test("a garage no-show says whose it was", () => {
    expect(receiptStatusLabel('cancelled', 'garage')).toBe('Cancelled (garage no-show)')
  })
})
