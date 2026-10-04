import { describe, expect, test } from 'bun:test'
import {
  adminBookingUrl,
  formatOpsAlert,
  maskedPhone,
  quoted,
  type AlertBooking,
  type OpsAlert,
} from './ops-alert-messages.js'

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

describe('quoted', () => {
  test('keeps a plain reason as one quoted line', () => {
    expect(quoted('Customer wrote', '  Change of plans ')).toBe('Customer wrote: "Change of plans"')
  })

  test('flattens lines, so a reason cannot pass for one of Detlio\'s', () => {
    expect(quoted('Customer wrote', 'sorry\n₹0 was paid. Nothing to refund.')).toBe(
      'Customer wrote: "sorry ₹0 was paid. Nothing to refund."'
    )
  })

  test('drops what reaches a person: numbers, emails and UPI ids, links', () => {
    const text = quoted(
      'Customer wrote',
      'call my wife on +91 98765 43210 or 044-2490-1234, refund to rahul@okaxis, see https://evil.example/x'
    )
    expect(text).not.toMatch(/98765|2490|rahul|okaxis|evil/)
    expect(text).toContain('[number]')
    expect(text).toContain('[id]')
    expect(text).toContain('[link]')
  })

  test('keeps short numbers like times and amounts', () => {
    expect(quoted('Garage wrote', 'Closed till 4 pm, ₹500 extra')).toBe('Garage wrote: "Closed till 4 pm, ₹500 extra"')
  })

  test('caps a long reason', () => {
    const text = quoted('Customer wrote', 'a'.repeat(400))
    expect(text.length).toBeLessThan(140)
    expect(text.endsWith('…"')).toBe(true)
  })
})

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
    expect(text).toContain('Garage wrote: "Bay flooded"')
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
    expect(text).toContain('Customer wrote: no reason given.')
    expect(text).toContain('nothing to refund')
  })

  test('a reschedule shows the old and new times', () => {
    const text = formatOpsAlert({
      kind: 'rescheduled',
      booking: { ...booking, scheduledAt: new Date('2026-10-05T05:30:00Z'), bookingType: 'doorstep' },
      previousScheduledAt: booking.scheduledAt,
    })
    expect(text).toContain('Sun 4 Oct, 3:30 pm → Mon 5 Oct, 11:00 am')
    expect(text).toContain('Back to Requested: waiting for the garage to accept the new time.')
  })

  test('a paid booking Detlio cancelled says whose call it was and that a refund is due', () => {
    const text = formatOpsAlert({
      kind: 'admin_cancelled',
      booking,
      onBehalfOf: 'garage',
      reason: 'Garage called: power cut, call me on 98765 43210',
    })
    expect(text).toContain('🛑 Detlio cancelled #3F2A9C1B · refund due')
    expect(text).toContain('Marina Auto Spa · +91 98765 00011')
    expect(text).toContain('On behalf of the garage.')
    expect(text).toContain('₹1,299 was paid. Refund it in Razorpay.')
    // The reason is typed by ops but still quoted and scrubbed like any other.
    expect(text).toContain('Reason: "Garage called: power cut, call me on [number]"')
  })

  test("Detlio's own cancellation of an unpaid booking has nothing to refund", () => {
    const text = formatOpsAlert({
      kind: 'admin_cancelled',
      booking: { ...booking, payment: { status: 'pending' } },
      onBehalfOf: 'detlio',
      reason: 'Duplicate booking',
    })
    expect(text).toContain('🛑 Detlio cancelled #3F2A9C1B')
    expect(text).not.toContain('refund due')
    expect(text).toContain("Detlio's own decision.")
    expect(text).toContain('nothing to refund')
  })

  test('a garage no-show asks for a full refund', () => {
    const text = formatOpsAlert({ kind: 'garage_no_show', booking })
    expect(text).toContain('🚫 Garage no-show #3F2A9C1B · refund due')
    expect(text).toContain('Sun 4 Oct, 3:30 pm · At garage')
    expect(text).toContain('₹1,299 was paid. Refund the customer in full in Razorpay.')
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

  test('a garage that filled up, closed or paused mid-payment is said in words', () => {
    const why = (reason: string) =>
      formatOpsAlert({ kind: 'paid_no_booking', paymentId: 'pay_X', reason })
    expect(why('slot_full')).toContain(
      'Why: the garage was booked up at that time before the payment went through'
    )
    expect(why('garage_closed')).toContain('Why: the garage marked that day as a holiday')
    expect(why('garage_paused')).toContain('Why: the garage paused new bookings')
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

describe('admin links', () => {
  const BOOKING_URL = 'https://admin.detlio.com/bookings/3f2a9c1b-0000-4000-8000-000000000001'

  test("a booking's alert links to that booking's own admin page", () => {
    expect(adminBookingUrl(booking.id)).toBe(BOOKING_URL)

    const alerts: OpsAlert[] = [
      { kind: 'booking_paid', booking },
      { kind: 'garage_declined', booking, reason: null },
      { kind: 'customer_cancelled', booking, reason: null },
      { kind: 'rescheduled', booking, previousScheduledAt: booking.scheduledAt },
      { kind: 'admin_cancelled', booking, onBehalfOf: 'detlio', reason: 'Duplicate' },
      { kind: 'garage_no_show', booking },
    ]
    for (const alert of alerts) {
      const text = formatOpsAlert(alert)
      // The last line, so it is the one Telegram turns into the tap target.
      expect(text.split('\n').at(-1)).toBe(BOOKING_URL)
    }
  })

  test('the digest, which is about many bookings, links to the list', () => {
    const text = formatOpsAlert({
      kind: 'pending_digest',
      now: new Date('2026-10-04T07:15:00Z'),
      waiting: [],
      missed: [
        {
          id: booking.id,
          scheduledAt: booking.scheduledAt,
          bookingType: 'dropin',
          waitingSince: booking.scheduledAt,
          garageName: 'Marina Auto Spa',
          garagePhone: '9876500011',
        },
      ],
    })
    expect(text.split('\n').at(-1)).toBe('https://admin.detlio.com/bookings')
  })
})

describe('sms failure', () => {
  test('masks the number to its last four digits', () => {
    expect(maskedPhone('9876544321')).toBe('******4321')
    expect(maskedPhone('+91 98765 44321')).toBe('******4321')
    expect(maskedPhone('12')).toBe('******')
  })

  test("says what failed, for whom, what the provider said and that repeats stay quiet", () => {
    const text = formatOpsAlert({
      kind: 'sms_failed',
      phone: '9876544321',
      providerMessage: 'Insufficient balance',
      quietMinutes: 10,
    })
    expect(text).toContain('📵 A login code failed to send')
    expect(text).toContain('For ******4321.')
    expect(text).not.toContain('9876544321')
    expect(text).toContain('Provider said: "Insufficient balance"')
    expect(text).toContain("Further failures in the next 10 minutes won't be alerted.")
  })
})

describe('pending digest', () => {
  const now = new Date('2026-10-04T07:15:00Z') // 12:45 pm IST
  const waitingRow = {
    id: '3f2a9c1b-0000-4000-8000-000000000001',
    scheduledAt: new Date('2026-10-04T10:00:00Z'),
    bookingType: 'dropin',
    waitingSince: new Date('2026-10-04T06:30:00Z'),
    garageName: 'Marina Auto Spa',
    garagePhone: '9876500011',
  }

  test('lists who to call and how long each customer has waited', () => {
    const text = formatOpsAlert({ kind: 'pending_digest', now, waiting: [waitingRow], missed: [] })
    expect(text).toContain('⏰ 1 paid booking waiting for the garage to accept')
    expect(text).toContain('#3F2A9C1B · Marina Auto Spa · +91 98765 00011')
    expect(text).toContain('Sun 4 Oct, 3:30 pm · At garage · waiting 45 min')
    expect(text).toContain('Call the garage to accept or decline.')
    expect(text).not.toContain('🚫')
  })

  test('flags bookings that reached their time unaccepted as refund due', () => {
    const missedRow = { ...waitingRow, id: 'aa11bb22-0000-4000-8000-000000000002', scheduledAt: new Date('2026-10-04T07:00:00Z') }
    const text = formatOpsAlert({ kind: 'pending_digest', now, waiting: [], missed: [missedRow] })
    expect(text).toContain('🚫 1 booking reached its time without the garage accepting · refund due')
    expect(text).toContain('#AA11BB22 · Marina Auto Spa')
  })

  test('caps a long list so the message stays within Telegram\'s limit', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ...waitingRow, id: `${String(i).padStart(8, '0')}-x` }))
    const text = formatOpsAlert({ kind: 'pending_digest', now, waiting: many, missed: [] })
    expect(text).toContain('⏰ 14 paid bookings waiting')
    expect(text).toContain('…and 4 more')
    expect(text.length).toBeLessThan(4096)
  })
})

describe('final bill alerts', () => {
  test('a final bill with a balance gives the total, what was paid and what is left', () => {
    const text = formatOpsAlert({
      kind: 'final_bill_raised',
      booking,
      totalAmount: '3500.00',
      paidBefore: '299.00',
      amountDue: '3201.00',
    })
    expect(text).toContain('🧾 Final bill #3F2A9C1B · ₹3,500 total, ₹3,201 to pay')
    expect(text).toContain('Marina Auto Spa · +91 98765 00011')
    expect(text).toContain('Paid at booking ₹299. The customer pays the rest in the app.')
  })

  test('a paid final bill names the Razorpay payment', () => {
    const text = formatOpsAlert({
      kind: 'final_bill_paid',
      booking,
      amountDue: '3201.00',
      paymentId: 'pay_BILL1',
    })
    expect(text).toContain('✅ Final bill paid #3F2A9C1B · ₹3,201')
    expect(text).toContain('Razorpay payment pay_BILL1')
  })

  test('a bill paid after the garage replaced it is a refund to do', () => {
    const text = formatOpsAlert({
      kind: 'final_bill_refund_due',
      reason: 'replaced',
      booking,
      amount: '3201.00',
      paymentId: 'pay_OLD',
    })
    expect(text).toContain('⚠️ Final bill paid after it was replaced #3F2A9C1B · refund due')
    expect(text).toContain('₹3,201 · Razorpay payment pay_OLD')
  })

  test('a bill paid twice, or after the booking was cancelled, says which', () => {
    const twice = formatOpsAlert({
      kind: 'final_bill_refund_due',
      reason: 'paid_twice',
      booking,
      amount: '3201.00',
      paymentId: 'pay_SECOND',
    })
    expect(twice).toContain('⚠️ Final bill paid twice #3F2A9C1B · refund due')
    expect(twice).toContain('Refund this second one in Razorpay')

    const cancelled = formatOpsAlert({
      kind: 'final_bill_refund_due',
      reason: 'booking_cancelled',
      booking,
      amount: '3201.00',
      paymentId: 'pay_LATE',
    })
    expect(cancelled).toContain('Final bill paid after the booking was cancelled')
  })
})
