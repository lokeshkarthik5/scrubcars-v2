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
      '2026-10-29T10:00:00.000Z,Mathew,"Owner checked live keys, refunded",#AB12CD34,Booking payment,pay_Live1,order_Live1,live,299.00,299.00,rfnd_A rfnd_B,DTL/26-27/000003,Genoraj Car Care,2026-10-20T10:00:00.000Z,2026-10-20T09:58:00.000Z,audit-1'
    )
  })
})
