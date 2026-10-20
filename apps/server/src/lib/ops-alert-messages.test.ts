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

describe('the booking type', () => {
  test('every alert names it, pickup & drop included', () => {
    expect(formatOpsAlert({ kind: 'booking_paid', booking })).toContain('· At garage')
    expect(formatOpsAlert({ kind: 'booking_paid', booking: { ...booking, bookingType: 'doorstep' } })).toContain(
      '· Doorstep'
    )
    expect(formatOpsAlert({ kind: 'booking_paid', booking: { ...booking, bookingType: 'pickup' } })).toContain(
      '· Pickup & drop'
    )
  })
})

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
    // There is no booking page to link to; the Refunds page is where it is marked done.
    expect(text).toContain('mark it refunded on the Refunds page')
    expect(text).toContain('https://admin.detlio.com/refunds')
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

describe('receipt number failure', () => {
  test('names the booking, says the money is safe, quotes the database and links to the booking', () => {
    const text = formatOpsAlert({
      kind: 'receipt_number_failed',
      bookingId: booking.id,
      errorMessage:
        'duplicate key value violates unique constraint "receipt_numbers_financial_year_seq_key"',
      quietMinutes: 10,
    })
    expect(text).toContain('🧾 Receipt number not issued #3F2A9C1B')
    expect(text).toContain('The payment is recorded.')
    expect(text).toContain(
      `Database said: "duplicate key value violates unique constraint 'receipt_numbers_financial_year_seq_key'"`
    )
    expect(text).toContain("Further failures in the next 10 minutes won't be alerted.")
    expect(text.split('\n').at(-1)).toBe(adminBookingUrl(booking.id))
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

  test('lists pickup & drop jobs whose car was not collected, and how late', () => {
    const late = {
      ...waitingRow,
      id: 'bb22cc33-0000-4000-8000-000000000003',
      bookingType: 'pickup',
      // 11:30 am IST, so 1 h 15 min before `now`.
      scheduledAt: new Date('2026-10-04T06:00:00Z'),
    }
    const text = formatOpsAlert({ kind: 'pending_digest', now, waiting: [], missed: [], latePickups: [late] })
    expect(text).toContain('🚗 1 pickup & drop job past its time with the car not picked up')
    expect(text).toContain('#BB22CC33 · Marina Auto Spa · +91 98765 00011')
    expect(text).toContain('Sun 4 Oct, 11:30 am · 1 h 15 min late')
    expect(text).toContain('confirm Picked up from the booking')
    expect(text.split('\n').at(-1)).toBe('https://admin.detlio.com/bookings')
  })

  test('caps a long list so the message stays within Telegram\'s limit', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ...waitingRow, id: `${String(i).padStart(8, '0')}-x` }))
    const text = formatOpsAlert({ kind: 'pending_digest', now, waiting: many, missed: [] })
    expect(text).toContain('⏰ 14 paid bookings waiting')
    expect(text).toContain('…and 4 more')
    expect(text.length).toBeLessThan(4096)
  })

  test('the morning roll-up says what Detlio owes garages, and links to Payouts', () => {
    const payouts = {
      garages: 3,
      total: '4210.50',
      oldestUnpaidAt: new Date('2026-10-03T12:30:00Z'),
      overdue: true,
    }
    const text = formatOpsAlert({ kind: 'pending_digest', now, waiting: [waitingRow], missed: [], payouts })
    expect(text).toContain('💰 Payouts due: 3 garages, ₹4,210.5 total, oldest Sat 3 Oct, 6:00 pm · past 24 hours')
    expect(text).toContain('https://admin.detlio.com/payouts')
    // Alone, with no booking waiting: only the payouts line and its link.
    const alone = formatOpsAlert({ kind: 'pending_digest', now, waiting: [], missed: [], payouts })
    expect(alone.split('\n')).toEqual([
      '💰 Payouts due: 3 garages, ₹4,210.5 total, oldest Sat 3 Oct, 6:00 pm · past 24 hours',
      'https://admin.detlio.com/payouts',
    ])
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

describe('refund recorded', () => {
  const recorded = {
    kind: 'refund_recorded',
    what: 'booking',
    bookingId: booking.id,
    garageName: 'Marina Auto Spa',
    amount: '1299.00',
    paid: '1299.00',
    refundedTotal: '1299.00',
    refundRef: 'rfnd_ABC123',
    paymentId: 'pay_SEED',
    by: 'Anand',
  } satisfies OpsAlert

  test('a full refund names the refund, the payment and who recorded it', () => {
    const text = formatOpsAlert(recorded)
    expect(text).toContain('💸 Refund recorded #3F2A9C1B · ₹1,299')
    expect(text).toContain('Booking payment · Marina Auto Spa')
    expect(text).toContain('Razorpay refund rfnd_ABC123 for pay_SEED')
    expect(text).toContain('Refunded in full.')
    expect(text).toContain('Recorded by Anand.')
    expect(text).toContain(adminBookingUrl(booking.id))
  })

  test('a part refund says what is still owed', () => {
    const text = formatOpsAlert({ ...recorded, amount: '300.00', refundedTotal: '300.00' })
    expect(text).toContain('Part refund: ₹300 of ₹1,299 back so far. The rest is still owed.')
  })

  test('a refund outside Razorpay says so, and a checkout links to the refunds page', () => {
    const text = formatOpsAlert({
      ...recorded,
      what: 'checkout',
      bookingId: null,
      refundRef: null,
    })
    expect(text).toContain('💸 Refund recorded · ₹1,299')
    expect(text).toContain('Payment with no booking · Marina Auto Spa')
    expect(text).toContain('Refunded outside Razorpay (payment pay_SEED).')
    expect(text).toContain('https://admin.detlio.com/refunds')
  })
})

describe('test data cleared', () => {
  test('one line says who and how many, then the receipts', () => {
    const text = formatOpsAlert({
      kind: 'test_data_cleared',
      by: 'Mathew',
      bookings: 143,
      checkouts: 160,
      receipts: ['Numbering restarts at DTL/26-27/000001'],
      auditId: '00000000-0000-4000-8000-000000000001',
    })
    expect(text.split('\n')[0]).toBe('🧹 Test data cleared by Mathew: 143 bookings')
    expect(text).toContain('160 checkouts with it, refunds and photos included.')
    expect(text).toContain('Numbering restarts at DTL/26-27/000001')
    expect(text.split('\n').at(-1)).toBe('Audit record 00000000-0000-4000-8000-000000000001.')
  })

  test('one booking, no checkouts', () => {
    const text = formatOpsAlert({
      kind: 'test_data_cleared',
      by: 'admin',
      bookings: 1,
      checkouts: 0,
      receipts: [],
      auditId: 'a',
    })
    expect(text).toBe('🧹 Test data cleared by admin: 1 booking\nAudit record a.')
  })
})

describe('garage_deleted', () => {
  test('one line says who, which garage and how many bookings', () => {
    const text = formatOpsAlert({
      kind: 'garage_deleted',
      by: 'Mathew',
      garage: 'Detlio (test garage)',
      bookings: 12,
      keptBookings: 0,
      outcome: 'hard_delete',
      auditId: 'a',
    })
    expect(text).toBe('🗑️ Garage deleted by Mathew: Detlio (test garage), 12 bookings\nAudit record a.')
  })

  test('says what was kept for the accounts, and when it must be pressed again', () => {
    const kept = formatOpsAlert({
      kind: 'garage_deleted',
      by: 'admin',
      garage: 'Sparkle Wash',
      bookings: 1,
      keptBookings: 2,
      outcome: 'tombstone',
      auditId: 'b',
    })
    expect(kept.split('\n')[0]).toBe('🗑️ Garage deleted by admin: Sparkle Wash, 1 booking')
    expect(kept).toContain('2 bookings with real money kept for the accounts')
    const partial = formatOpsAlert({
      kind: 'garage_deleted',
      by: 'admin',
      garage: 'Sparkle Wash',
      bookings: 300,
      keptBookings: 0,
      outcome: 'partial',
      auditId: 'c',
    })
    expect(partial).toContain('Delete forever must be pressed again')
  })
})

describe('complaint_received', () => {
  const complaint = {
    kind: 'complaint_received' as const,
    complaintId: 'c0a10001-0000-4000-8000-000000000001',
    number: 'C-000123',
    category: 'Payment or refund',
    bookingId: '3f2a9c1b-0000-4000-8000-000000000001',
    garageName: 'Marina Auto Spa',
    customerName: 'Priya Raman',
    message: 'Paid twice for one wash. Call me on 98765 43210 please.',
    // 04:30 UTC is 10:00 am in Chennai.
    acknowledgeBy: new Date('2026-10-18T04:30:00Z'),
    logged: null,
  }

  test('the number, the category, what it is about, the clock and the link', () => {
    const text = formatOpsAlert(complaint)
    expect(text.split('\n')).toEqual([
      '📣 New complaint C-000123 · Payment or refund',
      'Garage: Marina Auto Spa · booking #3F2A9C1B',
      'Customer: Priya',
      'Customer wrote: "Paid twice for one wash. Call me on [number] please."',
      'Acknowledge by Sun 18 Oct, 10:00 am.',
      'https://admin.detlio.com/complaints/c0a10001-0000-4000-8000-000000000001',
    ])
  })

  test('one from the Contact page says it is not about a booking', () => {
    const text = formatOpsAlert({ ...complaint, bookingId: null, garageName: null })
    expect(text.split('\n')[1]).toBe('Not about a booking.')
  })

  test('one the team logged says how it came and who logged it', () => {
    const text = formatOpsAlert({ ...complaint, logged: { source: 'By phone', by: 'Ravi' } })
    expect(text.split('\n')).toEqual([
      '📣 New complaint C-000123 · Payment or refund',
      'Garage: Marina Auto Spa · booking #3F2A9C1B',
      'Customer: Priya',
      'By phone, logged by Ravi.',
      'What they said: "Paid twice for one wash. Call me on [number] please."',
      'Acknowledge by Sun 18 Oct, 10:00 am.',
      'https://admin.detlio.com/complaints/c0a10001-0000-4000-8000-000000000001',
    ])
  })
})

describe('refunds through Razorpay', () => {
  const sent = {
    kind: 'refund_sent',
    what: 'booking',
    bookingId: booking.id,
    garageName: 'Marina Auto Spa',
    amount: '1299.00',
    paid: '1299.00',
    refundedTotal: '1299.00',
    refundRef: 'rfnd_ABC123',
    paymentId: 'pay_SEED',
    auto: false,
    by: 'Anand',
  } satisfies OpsAlert

  test('one alert per refund sent, saying who sent it', () => {
    const text = formatOpsAlert(sent)
    expect(text).toContain('💸 Refund ₹1,299 started for booking #3F2A9C1B · admin')
    expect(text).toContain('Razorpay refund rfnd_ABC123 for pay_SEED')
    expect(text).toContain('Sent by Anand.')
    expect(text).toContain(adminBookingUrl(booking.id))
    const auto = formatOpsAlert({ ...sent, auto: true, by: 'Detlio (automatic)' })
    expect(auto).toContain('· auto')
    expect(auto).toContain('Sent automatically.')
  })

  test('one alert per failure, saying the money is owed again', () => {
    const text = formatOpsAlert({
      kind: 'refund_failed',
      what: 'checkout',
      bookingId: null,
      amount: '499.00',
      refundRef: null,
      paymentId: 'pay_SEED',
      reason: 'The balance is too low.',
      auto: true,
      gaveUp: true,
    })
    expect(text).toContain('⚠️ Refund ₹499 failed for a payment with no booking · auto')
    expect(text).toContain('Razorpay payment pay_SEED')
    expect(text).toContain('Why: The balance is too low.')
    expect(text).toContain('Automatic refunds have stopped trying this one')
    expect(text).toContain('https://admin.detlio.com/refunds')
  })

  test('the daily cap promises tomorrow only to eligible automatic refunds', () => {
    const text = formatOpsAlert({ kind: 'auto_refund_cap_reached', cap: '20000.00', sentToday: '19800.00' })
    expect(text).toContain('Automatic refunds paused for today')
    expect(text).toContain('₹19,800 refunded automatically today; the daily cap is ₹20,000.')
    expect(text).toContain('Eligible automatic refunds resume tomorrow.')
    expect(text).toContain('needs a manual review')
    expect(text).not.toContain('goes automatically tomorrow')
  })

  test('a refund on Razorpay that does not fit says reconcile first, never that money is owed again', () => {
    const text = formatOpsAlert({
      kind: 'refund_gateway_mismatch',
      what: 'booking',
      bookingId: booking.id,
      amount: '600.00',
      refundRef: 'rfnd_FOUND0001',
      paymentId: 'pay_SEED',
    })
    expect(text).toContain("🛑 Razorpay refund doesn't match booking #3F2A9C1B")
    expect(text).toContain('Razorpay holds refund rfnd_FOUND0001 of ₹600 on pay_SEED')
    expect(text).toContain('Do not refund this again: reconcile the payment in Razorpay first')
    expect(text).not.toContain('owed again')
    expect(text).toContain(adminBookingUrl(booking.id))
  })

  test('a failed automatic-refund sweep, throttled', () => {
    const text = formatOpsAlert({ kind: 'auto_refund_sweep_failed', quietMinutes: 60 })
    expect(text).toContain("Automatic refunds' check failed")
    expect(text).toContain("Further failures in the next 60 minutes won't be alerted.")
    expect(text).toContain('https://admin.detlio.com/refunds')
  })
})

describe('suggested times (0041)', () => {
  test('made: the times on offer and when they run out', () => {
    const text = formatOpsAlert({
      kind: 'time_proposal_made',
      booking,
      options: [new Date('2026-10-04T11:00:00Z'), new Date('2026-10-04T12:30:00Z')],
      expiresAt: new Date('2026-10-04T09:30:00Z'),
    })
    expect(text).toContain('🕑 Garage suggested other times #3F2A9C1B')
    expect(text).toContain('Booked for Sun 4 Oct, 3:30 pm · At garage')
    expect(text).toContain('Offered: Sun 4 Oct, 4:30 pm · Sun 4 Oct, 6:00 pm')
    expect(text).toContain('by Sun 4 Oct, 3:00 pm, or it is cancelled with a full refund')
  })

  test('chosen: moved and accepted', () => {
    const text = formatOpsAlert({
      kind: 'time_proposal_outcome',
      outcome: 'chosen',
      booking: { ...booking, scheduledAt: new Date('2026-10-04T12:30:00Z') },
      previousScheduledAt: booking.scheduledAt,
    })
    expect(text).toContain('✅ Customer picked a suggested time #3F2A9C1B')
    expect(text).toContain('Sun 4 Oct, 3:30 pm → Sun 4 Oct, 6:00 pm')
  })

  test('declined or run out: the garage’s decline, with the refund to do', () => {
    const declined = formatOpsAlert({
      kind: 'time_proposal_outcome',
      outcome: 'declined',
      booking,
      previousScheduledAt: booking.scheduledAt,
    })
    expect(declined).toContain('❌ None of the suggested times worked #3F2A9C1B · refund due')
    expect(declined).toContain("₹1,299 was paid: refund it in full")
    const expired = formatOpsAlert({
      kind: 'time_proposal_outcome',
      outcome: 'expired',
      booking: { ...booking, payment: { status: 'pending' } },
      previousScheduledAt: booking.scheduledAt,
    })
    expect(expired).toContain('⌛ Suggested times ran out unanswered #3F2A9C1B')
    expect(expired).not.toContain('refund due')
    expect(expired).toContain('nothing to refund')
  })
})

describe('extra work (0041)', () => {
  test('paid and declined, the work quoted', () => {
    const paid = formatOpsAlert({
      kind: 'extra_work_paid',
      booking,
      description: 'Replace wiper blades',
      amount: '450.00',
      paymentId: 'pay_XW1',
    })
    expect(paid).toContain('🔧 Extra work approved and paid #3F2A9C1B · ₹450')
    expect(paid).toContain('Work: "Replace wiper blades"')
    expect(paid).toContain('Razorpay payment pay_XW1')
    const declined = formatOpsAlert({
      kind: 'extra_work_declined',
      booking,
      description: 'Replace wiper blades',
      amount: '450.00',
    })
    expect(declined).toContain('🙅 Customer declined extra work #3F2A9C1B · ₹450')
  })

  test('a payment on a withdrawn request is a refund to do, named as extra work', () => {
    const text = formatOpsAlert({
      kind: 'final_bill_refund_due',
      reason: 'replaced',
      what: 'extra_work',
      booking,
      amount: '450.00',
      paymentId: 'pay_LATE',
    })
    expect(text).toContain('⚠️ Extra work paid after it was withdrawn or declined #3F2A9C1B · refund due')
    expect(text).toContain('₹450 · Razorpay payment pay_LATE')
  })
})
