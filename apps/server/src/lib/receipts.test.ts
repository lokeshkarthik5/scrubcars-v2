import { describe, expect, test } from 'bun:test'
import {
  REFUND_METHODS,
  RECEIPT_ISSUER,
  RECEIPT_SERIAL_MAX,
  buildReceipt,
  financialYearOf,
  formatReceiptSerial,
  istDateLabel,
  istDateTimeLabel,
  istSlotLabel,
  maskPhone,
  receiptAvailability,
  receiptIssuedAt,
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
// The number stored for the booking's chain (receipt_numbers): buildReceipt
// prints the one it is given.
const NUMBER = 'DTL/26-27/000123'

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

/** The receipt for a booking under the chain's stored number. */
const receiptOf = (b: ReceiptBooking, records: ReceiptRefundRecord[]) =>
  buildReceipt(b, records, NUMBER)

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

describe('financialYearOf', () => {
  test('1 April to 31 March, written yy-yy', () => {
    expect(financialYearOf(PAID_AT)).toBe('26-27')
    expect(financialYearOf(new Date('2026-04-01T06:30:00Z'))).toBe('26-27')
    expect(financialYearOf(new Date('2027-02-15T06:30:00Z'))).toBe('26-27')
    expect(financialYearOf(new Date('2026-03-15T06:30:00Z'))).toBe('25-26')
  })

  test('the year turns at midnight IST, not UTC', () => {
    // 31 Mar 2027 23:59:59 IST is 18:29:59 UTC: still 2026-27.
    expect(financialYearOf(new Date('2027-03-31T18:29:59Z'))).toBe('26-27')
    // 1 Apr 2027 00:00 IST is 31 Mar 18:30 UTC: already 2027-28.
    expect(financialYearOf(new Date('2027-03-31T18:30:00Z'))).toBe('27-28')
  })

  test('across a century turn, both halves keep two digits', () => {
    expect(financialYearOf(new Date('2099-06-01T06:30:00Z'))).toBe('99-00')
    expect(financialYearOf(new Date('2100-03-31T18:29:59Z'))).toBe('99-00')
    expect(financialYearOf(new Date('2100-03-31T18:30:00Z'))).toBe('00-01')
    expect(financialYearOf(new Date('2009-12-31T06:30:00Z'))).toBe('09-10')
  })
})

describe('formatReceiptSerial', () => {
  test('DTL, the financial year and a six-digit serial', () => {
    expect(formatReceiptSerial('26-27', 1)).toBe('DTL/26-27/000001')
    expect(formatReceiptSerial('26-27', 123)).toBe('DTL/26-27/000123')
    expect(formatReceiptSerial('99-00', RECEIPT_SERIAL_MAX)).toBe('DTL/99-00/999999')
  })

  test('is never more than sixteen characters', () => {
    for (const seq of [1, 9, 10, 99_999, 100_000, RECEIPT_SERIAL_MAX]) {
      expect(formatReceiptSerial('26-27', seq).length).toBeLessThanOrEqual(16)
    }
    expect(formatReceiptSerial('26-27', 42)).toMatch(/^DTL\/\d{2}-\d{2}\/\d{6}$/)
  })

  test('refuses a serial it cannot write in six digits, rather than a 17th character', () => {
    expect(() => formatReceiptSerial('26-27', RECEIPT_SERIAL_MAX + 1)).toThrow()
    expect(() => formatReceiptSerial('26-27', 0)).toThrow()
    expect(() => formatReceiptSerial('26-27', -1)).toThrow()
    expect(() => formatReceiptSerial('26-27', 1.5)).toThrow()
  })

  test('refuses anything that is not a financial year', () => {
    expect(() => formatReceiptSerial('2026-27', 1)).toThrow()
    expect(() => formatReceiptSerial('', 1)).toThrow()
  })
})

describe('receiptIssuedAt', () => {
  test('is when the payment went through, else when its row was made', () => {
    const createdAt = new Date('2026-10-03T03:30:00Z')
    expect(receiptIssuedAt({ paidAt: PAID_AT, createdAt })).toBe(PAID_AT)
    expect(receiptIssuedAt({ paidAt: null, createdAt })).toBe(createdAt)
  })
})

describe('buildReceipt: the number', () => {
  test('prints the number it is given', () => {
    expect(receiptOf(booking(), []).receiptNumber).toBe(NUMBER)
    expect(buildReceipt(booking(), [], 'DTL/27-28/000001').receiptNumber).toBe('DTL/27-28/000001')
  })

  test('a moved booking is printed under its chain\'s number, and says where it began', () => {
    // A reschedule copies the payment (same pay_ id, same paid_at) to the new
    // booking, which points at the first one of its chain; the caller passes
    // the number stored for that first booking.
    const moved = receiptOf(
      booking({ id: 'a7b8c9d0-0000-4000-8000-000000000002', originalBookingId: BOOKING_ID }),
      []
    )
    expect(moved.receiptNumber).toBe(NUMBER)
    expect(moved.issuedAt).toBe(PAID_AT.toISOString())
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
  const receipt = receiptOf(booking(), [])

  test('names the platform, the customer (masked) and the garage', () => {
    expect(receipt.issuer.name).toBe('Detlio')
    expect(receipt.issuer.tradeName).toBe('ScrubCars')
    expect(receipt.issuer.address).toBe(RECEIPT_ISSUER.address)
    expect(receipt.issuer.supportEmail).toBe(RECEIPT_ISSUER.supportEmail)
    expect(receipt.issuer.supportPhone).toBe(RECEIPT_ISSUER.supportPhone)
    expect(receipt.customer).toEqual({ name: 'Kavya Raman', phone: '+91 ******4321' })
    expect(receipt.garage).toEqual({ name: 'Adyar Car Spa', address: '12, LB Road, Adyar, Chennai' })
  })

  test("adds the garage's city only when its address does not already name it", () => {
    const vendor = { businessName: 'Adyar Car Spa', address: '12, LB Road, Adyar, Chennai 600020', city: 'Chennai' }
    expect(receiptOf(booking({ vendor }), []).garage.address).toBe('12, LB Road, Adyar, Chennai 600020')
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
      credit: null,
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
    expect(receiptOf(booking({ payment }), []).bookingPayment.paymentId).toBeNull()
  })

  test('a booking from before booking_items is one line: its service at the subtotal', () => {
    const receipt = receiptOf(booking({ items: [] }), [])
    expect(receipt.items).toEqual([{ name: 'Express Wash', amount: '499.00' }])
  })

  test('an old cash booking says cash and has no payment id', () => {
    const payment = { ...booking().payment!, status: 'collected', gatewayTxnId: null }
    const receipt = receiptOf(booking({ paymentMethod: 'cash', payment }), [])
    expect(receipt.bookingPayment).toMatchObject({ method: 'Cash', paymentId: null })
  })

  test('refuses a booking with no payment at all', () => {
    expect(() => receiptOf(booking({ payment: null }), [])).toThrow()
  })
})

describe('buildReceipt: a discount', () => {
  const receipt = receiptOf(
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
    const receipt = receiptOf(booking({ ...inspection, charges: [bill()] }), [])
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
    const receipt = receiptOf(
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
    const receipt = receiptOf(
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
      const receipt = receiptOf(booking({ ...inspection, charges }), [])
      expect(receipt.finalBill).toBeNull()
      expect(receipt.totalPaid).toBe('299.00')
    }
  })

  test('a payment on a replaced bill, and its refund, stay off this receipt', () => {
    const stray = bill({ id: 'b111d0e1-0000-4000-8000-000000000009', status: 'cancelled' })
    const receipt = receiptOf(booking({ ...inspection, charges: [stray, bill()] }), [
      record({ kind: 'bill', targetId: stray.id, amount: '2201.00' }),
    ])
    expect(receipt.refunds).toEqual([])
    expect(receipt).toMatchObject({ totalPaid: '2500.00', totalRefunded: '0.00', netPaid: '2500.00' })
  })

  test("a refund of the bill's balance is a line of its own", () => {
    const receipt = receiptOf(
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
    const receipt = receiptOf(booking({ ...cancelled, payment }), [record({ amount: '200.00' })])
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
    const receipt = receiptOf(booking({ ...cancelled, payment }), [record()])
    expect(receipt.booking.statusLabel).toBe('Cancelled')
    expect(receipt.refunds).toHaveLength(1)
    expect(receipt).toMatchObject({ totalPaid: '499.00', totalRefunded: '499.00', netPaid: '0.00' })
  })

  test('two part refunds are two lines, oldest first', () => {
    const payment = { ...booking().payment!, status: 'refunded', refundedAmount: '499.00' }
    const receipt = receiptOf(booking({ ...cancelled, payment }), [
      record({ amount: '299.00', refundRef: 'rfnd_Second0000002', recordedAt: new Date('2026-10-05T06:00:00Z') }),
      record({ amount: '200.00', refundRef: 'rfnd_First00000001', recordedAt: new Date('2026-10-04T06:00:00Z') }),
    ])
    expect(receipt.refunds.map((refund) => refund.reference)).toEqual([
      'rfnd_First00000001',
      'rfnd_Second0000002',
    ])
    expect(receipt.netPaid).toBe('0.00')
  })

  test('a refund still pending at Razorpay is not on the receipt until it is processed', () => {
    // ₹200 went back earlier; ₹299 more was sent from the app and is on its
    // way. The payment row's total counts both.
    const payment = { ...booking().payment!, status: 'refunded', refundedAmount: '499.00' }
    const first = record({ amount: '200.00', refundRef: 'rfnd_First00000001', gatewayStatus: 'processed' })
    const second = record({
      amount: '299.00',
      refundRef: 'rfnd_Second0000002',
      recordedAt: new Date('2026-10-05T06:00:00Z'),
      gatewayStatus: 'pending',
    })
    const pending = receiptOf(booking({ ...cancelled, payment }), [first, second])
    expect(pending.refunds.map((refund) => refund.reference)).toEqual(['rfnd_First00000001'])
    expect(pending).toMatchObject({ totalPaid: '499.00', totalRefunded: '200.00', netPaid: '299.00' })

    const processed = receiptOf(booking({ ...cancelled, payment }), [first, { ...second, gatewayStatus: 'processed' }])
    expect(processed.refunds).toHaveLength(2)
    expect(processed).toMatchObject({ totalRefunded: '499.00', netPaid: '0.00' })
  })

  test('a refund made outside Razorpay shows no reference, and never the team’s note', () => {
    const payment = { ...booking().payment!, refundedAmount: '499.00', status: 'refunded' }
    const receipt = receiptOf(booking({ ...cancelled, payment }), [record({ refundRef: null })])
    expect(receipt.refunds[0].reference).toBeNull()
    expect(JSON.stringify(receipt)).not.toContain('note')
  })

  test('a refund made outside Razorpay does not claim it went to the original payment method', () => {
    const payment = { ...booking().payment!, refundedAmount: '499.00', status: 'refunded' }
    const receipt = receiptOf(booking({ ...cancelled, payment }), [record({ refundRef: null })])
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
    const receipt = receiptOf(booking({ ...cancelled, payment }), [])
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
    const receipt = receiptOf(booking({ ...cancelled, payment }), [])
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
    const receipt = receiptOf(booking({ ...cancelled, payment }), [record({ amount: '200.00' })])
    expect(receipt.refunds.map((refund) => refund.amount).sort()).toEqual(['200.00', '299.00'])
    expect(receipt.totalRefunded).toBe('499.00')
    // The record's line has its Razorpay id; the remainder's route is unknown.
    const remainder = receipt.refunds.find((refund) => refund.amount === '299.00')
    expect(remainder).toMatchObject({ method: REFUND_METHODS.unknown, reference: null })
  })

  test("another booking's refunds are not this one's", () => {
    const receipt = receiptOf(booking(), [record({ targetId: 'someone-else' })])
    expect(receipt.refunds).toEqual([])
  })
})

describe('buildReceipt: no-shows', () => {
  test('a customer no-show has a receipt for the money it kept', () => {
    const receipt = receiptOf(booking({ status: 'cancelled', noShow: 'customer' }), [])
    expect(receipt.booking.statusLabel).toBe('No-show')
    expect(receipt.refunds).toEqual([])
    expect(receipt).toMatchObject({ totalPaid: '499.00', netPaid: '499.00' })
  })

  test("a garage no-show says whose it was", () => {
    expect(receiptStatusLabel('cancelled', 'garage')).toBe('Cancelled (garage no-show)')
  })
})

describe('extra work on the receipt (0041)', () => {
  const extra = (overrides: Partial<ReceiptBill> = {}): ReceiptBill => ({
    id: 'e0000000-0000-4000-8000-000000000001',
    kind: 'extra_work',
    status: 'paid',
    totalAmount: '450.00',
    paidBefore: '0.00',
    amountDue: '450.00',
    lines: [{ description: 'Replace wiper blades', amount: '450.00' }],
    gatewayPaymentId: 'pay_E1x2T3r4A5w6K7',
    paidAt: new Date('2026-10-03T05:00:00Z'),
    refundedAmount: null,
    refundRef: null,
    refundedAt: null,
    ...overrides,
  })

  test('paid extra work is a line each, oldest first, in the total paid', () => {
    const receipt = receiptOf(
      booking({
        charges: [
          extra({ id: 'e2', lines: [{ description: 'Headlight polish', amount: '300.00' }], amountDue: '300.00', paidAt: new Date('2026-10-03T06:00:00Z') }),
          extra(),
          // Withdrawn, declined or unpaid: no money, no line.
          extra({ id: 'e3', status: 'cancelled' }),
          extra({ id: 'e4', status: 'due', gatewayPaymentId: null, paidAt: null }),
        ],
      }),
      []
    )
    expect(receipt.extraWork).toEqual([
      {
        description: 'Replace wiper blades',
        amount: '450.00',
        paymentId: 'pay_E1x2T3r4A5w6K7',
        paidAt: '2026-10-03T05:00:00.000Z',
        paidAtLabel: istDateTimeLabel(new Date('2026-10-03T05:00:00Z')),
      },
      expect.objectContaining({ description: 'Headlight polish', amount: '300.00' }),
    ])
    expect(receipt.finalBill).toBeNull()
    expect(receipt.totalPaid).toBe('1249.00')
    expect(receipt.netPaid).toBe('1249.00')
  })

  test('with a final bill, both count, and a refund of extra work is its own line', () => {
    const receipt = receiptOf(
      booking({
        status: 'cancelled',
        charges: [bill(), extra({ refundedAmount: '450.00', refundRef: 'rfnd_E9x8T7r6A5w4K3', refundedAt: new Date('2026-10-04T06:00:00Z') })],
      }),
      [record({ kind: 'bill', targetId: 'e0000000-0000-4000-8000-000000000001', amount: '450.00', refundRef: 'rfnd_E9x8T7r6A5w4K3' })]
    )
    expect(receipt.totalPaid).toBe('3150.00') // 499 + 2201 + 450
    expect(receipt.refunds).toEqual([
      expect.objectContaining({ against: 'extra_work', amount: '450.00', reference: 'rfnd_E9x8T7r6A5w4K3' }),
    ])
    expect(receipt.netPaid).toBe('2700.00')
  })

  test('a booking with none has an empty list', () => {
    expect(receiptOf(booking(), []).extraWork).toEqual([])
  })
})

describe('Detlio credit on the receipt (0049)', () => {
  const creditOnly = booking({
    payment: {
      status: 'paid',
      amount: '0.00',
      creditAmount: '499.00',
      creditReturnedAt: null,
      gatewayTxnId: null,
      paidAt: PAID_AT,
      createdAt: new Date('2026-10-03T03:30:00Z'),
      refundedAmount: null,
      refundRef: null,
      refundedAt: null,
    },
  })

  test('a booking paid wholly with credit: paid in full, by Detlio credit, with no payment id', () => {
    const receipt = receiptOf(creditOnly, [])
    expect(receipt.bookingPayment).toMatchObject({
      amount: '499.00',
      method: 'Detlio credit',
      credit: { amount: '499.00', razorpayAmount: '0.00' },
      paymentId: null,
    })
    expect(receipt).toMatchObject({ totalPaid: '499.00', totalRefunded: '0.00', netPaid: '499.00' })
  })

  test('part credit, part Razorpay: both shown, adding up to the booking', () => {
    const receipt = receiptOf(
      booking({ payment: { ...creditOnly.payment!, amount: '199.00', creditAmount: '300.00', gatewayTxnId: 'pay_N1a2B3c4D5e6F7' } }),
      []
    )
    expect(receipt.bookingPayment).toMatchObject({
      amount: '499.00',
      method: 'Online (Razorpay) and Detlio credit',
      credit: { amount: '300.00', razorpayAmount: '199.00' },
    })
    expect(receipt.totalPaid).toBe('499.00')
  })

  test('cancelled: the credit part is a refund line "Returned as Detlio credit", the card part as usual', () => {
    const returnedAt = new Date('2026-10-04T05:00:00Z')
    const receipt = receiptOf(
      booking({
        status: 'cancelled',
        payment: {
          ...creditOnly.payment!,
          status: 'refunded',
          amount: '199.00',
          creditAmount: '300.00',
          creditReturnedAt: returnedAt,
          gatewayTxnId: 'pay_N1a2B3c4D5e6F7',
          refundedAmount: '199.00',
          refundRef: 'rfnd_Q1w2E3r4T5y6U7',
          refundedAt: new Date('2026-10-04T06:00:00Z'),
        },
      }),
      [record({ amount: '199.00' })]
    )
    expect(receipt.refunds).toEqual([
      expect.objectContaining({ amount: '300.00', method: REFUND_METHODS.credit, reference: null }),
      expect.objectContaining({ amount: '199.00', method: REFUND_METHODS.razorpay, reference: 'rfnd_Q1w2E3r4T5y6U7' }),
    ])
    expect(receipt).toMatchObject({ totalPaid: '499.00', totalRefunded: '499.00', netPaid: '0.00' })
  })
})
