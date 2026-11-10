import { describe, expect, test } from 'bun:test'
import { deletedTestPaymentsCsv } from './refunds'

describe("the team tests' ledger CSV (0065)", () => {
  test('one line per payment, ids and amounts as the API sends them', () => {
    const csv = deletedTestPaymentsCsv([
      {
        id: 'row-1',
        deletedAt: '2026-10-29T10:00:00.000Z',
        deletedBy: 'Mathew',
        reason: 'Owner checked live keys, refunded',
        bookingReference: 'AB12CD34',
        rootBookingId: 'ab12cd34-0000-4000-8000-000000000000',
        kind: 'booking',
        razorpayPaymentId: 'pay_Live1',
        razorpayOrderId: 'order_Live1',
        gatewayMode: 'live',
        amount: '299.00',
        refundedAmount: '299.00',
        refundIds: ['rfnd_A', 'rfnd_B'],
        receiptNumber: 'DTL/26-27/000003',
        garageName: 'Genoraj Car Care',
        paidAt: '2026-10-20T10:00:00.000Z',
        bookedAt: '2026-10-20T09:58:00.000Z',
        auditId: 'audit-1',
      },
    ])
    const [header, line] = csv.trim().split('\r\n')
    expect(header).toStartWith(
      'Deleted at,Deleted by,Reason,Booking,What,Razorpay payment'
    )
    expect(line).toBe(
      '2026-10-29T10:00:00.000Z,Mathew,"Owner checked live keys, refunded",#AB12CD34,Booking payment,pay_Live1,order_Live1,live,299.00,299.00,rfnd_A rfnd_B,DTL/26-27/000003,Genoraj Car Care,2026-10-20T10:00:00.000Z,2026-10-20T09:58:00.000Z,audit-1,Refunded,,'
    )
  })

  test("the owner's delete (0071): money not refunded and a payout line say where they stand", () => {
    const base = {
      id: 'row-2',
      deletedAt: '2026-11-10T10:00:00.000Z',
      deletedBy: 'Mathew',
      reason: 'End-to-end test with accepting',
      bookingReference: 'DE1E6901',
      rootBookingId: 'de1e6901-0000-4000-8000-000000000000',
      razorpayOrderId: null,
      gatewayMode: null,
      refundIds: [],
      receiptNumber: null,
      garageName: 'Speed Wash',
      paidAt: null,
      bookedAt: '2026-11-09T09:00:00.000Z',
      auditId: 'audit-2',
    }
    const csv = deletedTestPaymentsCsv([
      {
        ...base,
        kind: 'booking',
        razorpayPaymentId: 'pay_Live2',
        amount: '450.00',
        refundedAmount: '0.00',
        state: 'not_refunded',
        note: null,
        creditReturned: '200.00',
      },
      {
        ...base,
        kind: 'payout',
        razorpayPaymentId: null,
        amount: '380.00',
        refundedAmount: '0.00',
        state: 'paid_out',
        note: 'Paid out to Speed Wash on 3 Nov 2026 (UTR123)',
        creditReturned: '0.00',
      },
    ])
    const [, unrefunded, payout] = csv.trim().split('\r\n')
    expect(unrefunded).toEndWith(',audit-2,Not refunded,,200.00')
    expect(payout).toContain(',Garage payout line,')
    expect(payout).toEndWith(
      ',audit-2,Paid out to the garage,Paid out to Speed Wash on 3 Nov 2026 (UTR123),'
    )
  })
})
