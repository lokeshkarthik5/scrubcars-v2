import { describe, expect, test } from 'bun:test'
import { formatOpsAlert, type AlertBooking } from './ops-alert-messages.js'

const booking: AlertBooking = {
  id: '3f2a9c1b-0000-4000-8000-000000000001',
  // 10:00 UTC is 3:30 pm in Chennai.
  scheduledAt: new Date('2026-10-04T10:00:00Z'),
  bookingType: 'dropin',
  amount: '1299.00',
  vendor: { businessName: 'Marina Auto Spa', phone: '9876500011' },
  user: { name: 'Priya Raman' },
  items: [{ name: 'Foam wash' }, { name: 'Interior clean' }],
  payment: { status: 'paid' },
}

describe('formatOpsAlert', () => {
  test('a new paid booking names the garage, the job, the time and the money', () => {
    const text = formatOpsAlert({ kind: 'booking_paid', booking })
    expect(text).toContain('🆕 New paid booking #3F2A9C1B')
    expect(text).toContain('Marina Auto Spa · +91 98765 00011')
    expect(text).toContain('Foam wash + Interior clean')
    expect(text).toContain('Sun 4 Oct, 3:30 pm · At garage')
    expect(text).toContain('₹1,299 · Customer: Priya')
    expect(text).toContain('Waiting for the garage to accept.')
  })

  test('the customer appears by first name only', () => {
    const text = formatOpsAlert({ kind: 'booking_paid', booking })
    expect(text).not.toContain('Raman')
  })

  test('a paid booking the garage declined is flagged for a refund', () => {
    const text = formatOpsAlert({ kind: 'garage_declined', booking, reason: '  Bay flooded ' })
    expect(text).toContain('❌ Garage declined #3F2A9C1B · refund due')
    expect(text).toContain('Reason: Bay flooded')
    expect(text).toContain('₹1,299 was paid. Refund it in Razorpay')
  })

  test('an unpaid cancellation says there is nothing to refund', () => {
    const text = formatOpsAlert({
      kind: 'customer_cancelled',
      booking: { ...booking, payment: { status: 'pending' } },
      reason: null,
    })
    expect(text).toContain('↩️ Customer cancelled #3F2A9C1B')
    expect(text).not.toContain('refund due')
    expect(text).toContain('No reason given.')
    expect(text).toContain('nothing to refund')
  })

  test('a reschedule shows the old and new times', () => {
    const text = formatOpsAlert({
      kind: 'rescheduled',
      booking: { ...booking, scheduledAt: new Date('2026-10-05T05:30:00Z'), bookingType: 'doorstep' },
      previousScheduledAt: booking.scheduledAt,
    })
    expect(text).toContain('Sun 4 Oct, 3:30 pm → Mon 5 Oct, 11:00 am')
    expect(text).toContain('Check the garage can do the new time.')
  })

  test('a payment with no booking gives the payment id and the reason in words', () => {
    const text = formatOpsAlert({
      kind: 'paid_no_booking',
      paymentId: 'pay_ABC123',
      reason: 'vehicle_double_booked',
      amount: '799.00',
      garageName: 'Marina Auto Spa',
      scheduledAt: booking.scheduledAt,
    })
    expect(text).toContain('⚠️ Payment taken, no booking · refund due')
    expect(text).toContain('₹799 · Razorpay payment pay_ABC123')
    expect(text).toContain('Garage: Marina Auto Spa')
    expect(text).toContain('Why: that car already had a booking at that time')
  })

  test('missing facts read as unknown rather than breaking the message', () => {
    const text = formatOpsAlert({
      kind: 'booking_paid',
      booking: { ...booking, vendor: null, user: null, items: [], service: null },
    })
    expect(text).toContain('Garage: unknown')
    expect(text).toContain('Services unknown')
    expect(text).toContain('Customer: unnamed')

    const failed = formatOpsAlert({ kind: 'paid_no_booking', paymentId: 'pay_X', reason: 'something_new' })
    expect(failed).toContain('Amount unknown · Razorpay payment pay_X')
    expect(failed).toContain('Why: something_new')
    expect(failed).not.toContain('undefined')
  })
})
