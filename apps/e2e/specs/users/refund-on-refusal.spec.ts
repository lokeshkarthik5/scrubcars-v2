/**
 * Money that lands for a time the garage can no longer take.
 *
 * Checkout refuses a full, closed or paused garage before any payment order
 * exists (scheduling.spec.ts). This file is about the gap after that: minutes
 * of payment sheet in which another customer can take the last bay, or the
 * owner can pause. The booking write checks again under a lock, and a refusal
 * there must end as "your payment will be refunded" — never as a second car
 * in a one-bay garage, and never as a silent success.
 *
 * Unlike scheduling.spec.ts this file does write bookings, so it works only on
 * its own fixtures (LAST_BAY, and CAPACITY's unpaid BOOKINGS.payLaterFull) and
 * puts them back before it starts, which keeps a CI retry on a clean slate.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

const tomorrow = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  })

/** An IST wall-clock time tomorrow. LAST_BAY is open 06:00–22:00. */
const tomorrowAt = (hhmm: string) => new Date(`${tomorrow()}T${hhmm}:00+05:30`)

// The fake gateway accepts any order id this server minted (order_e2e_…) with
// any signature, so "the customer paid" is one call.
const pay = (
  customer: APIRequestContext,
  target: { intentId: string } | { bookingId: string },
  orderId: string
) =>
  customer.post(`${API}/api/v1/payments/verify`, {
    data: {
      ...target,
      razorpayOrderId: orderId,
      razorpayPaymentId: `pay_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      razorpaySignature: 'e2e',
    },
  })

const openCheckout = async (
  customer: APIRequestContext,
  vehicleId: string,
  scheduledAt: Date
) => {
  const response = await customer.post(`${API}/api/v1/booking-intents`, {
    data: {
      vendorId: VENDORS.lastBay.id,
      serviceIds: [SERVICES.lastBayWash.id],
      vehicleId,
      bookingType: 'dropin',
      paymentMethod: 'online',
      scheduledAt: scheduledAt.toISOString(),
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).data as { intentId: string; orderId: string }
}

// Fresh logins: a bare request context cannot refresh a saved token, and all
// three numbers belong to this file alone.
let first: APIRequestContext
let second: APIRequestContext
let latePayer: APIRequestContext

test.beforeAll(async () => {
  // Whatever an earlier attempt wrote goes back to how the seed left it.
  await sql`
    update bookings set status = 'cancelled', cancelled_by = 'user', cancelled_at = now()
     where vendor_id = ${VENDORS.lastBay.id} and status <> 'cancelled'
  `
  await sql`
    update vendors set bookings_paused_at = null, bookings_paused_reason = null
     where id = ${VENDORS.lastBay.id}
  `
  await sql`delete from booking_notes where booking_id = ${BOOKINGS.payLaterFull}`
  await sql`
    update bookings
       set status = 'pending', cancelled_by = null, cancelled_on_behalf_of = null,
           cancellation_reason = null, cancelled_at = null
     where id = ${BOOKINGS.payLaterFull}
  `
  await sql`
    update payments set status = 'pending', gateway_txn_id = null, paid_at = null
     where booking_id = ${BOOKINGS.payLaterFull}
  `

  first = await loginViaApi(CUSTOMERS.raceFirst.phone)
  second = await loginViaApi(CUSTOMERS.raceSecond.phone)
  latePayer = await loginViaApi(CUSTOMERS.payLaterFull.phone)
})

test.afterAll(async () => {
  await sql`
    update vendors set bookings_paused_at = null, bookings_paused_reason = null
     where id = ${VENDORS.lastBay.id}
  `
  await Promise.all([first?.dispose(), second?.dispose(), latePayer?.dispose()])
})

test.describe('a payment for a time the garage can no longer take @p0', () => {
  test('two customers pay for the last bay: one is booked, the other refunded', async () => {
    const at = tomorrowAt('14:00')

    // Both open a checkout while the bay is free, so both get past the
    // pre-payment check — exactly the window this is about.
    const a = await openCheckout(first, CUSTOMERS.raceFirst.vehicleId, at)
    const b = await openCheckout(second, CUSTOMERS.raceSecond.vehicleId, at)

    const paidFirst = await pay(first, { intentId: a.intentId }, a.orderId)
    expect(paidFirst.status()).toBe(200)
    expect((await paidFirst.json()).data.bookingId).toEqual(expect.any(String))

    const paidSecond = await pay(second, { intentId: b.intentId }, b.orderId)
    expect(paidSecond.status()).toBe(409)
    expect(await paidSecond.json()).toEqual({
      success: false,
      message: expect.stringContaining('Your payment will be refunded.'),
      code: 'BOOKING_CONFIRM_FAILED_REFUND_DUE',
    })

    // What the app reads when it polls afterwards.
    const status = await second.get(`${API}/api/v1/booking-intents/${b.intentId}`)
    expect((await status.json()).data).toEqual({
      status: 'failed',
      bookingId: null,
      failureReason: 'slot_full',
      message: expect.stringContaining('Your payment will be refunded.'),
    })

    // One car in the one bay.
    const [row] = await sql<{ n: string }[]>`
      select count(*)::text as n from bookings
       where vendor_id = ${VENDORS.lastBay.id} and scheduled_at = ${at.toISOString()}::timestamptz
         and status in ('pending', 'confirmed', 'in_progress')
    `
    expect(Number(row.n)).toBe(1)
  })

  test('a garage that pauses while the customer pays turns the payment into a refund', async () => {
    const intent = await openCheckout(second, CUSTOMERS.raceSecond.vehicleId, tomorrowAt('16:00'))

    await sql`
      update vendors set bookings_paused_at = now() where id = ${VENDORS.lastBay.id}
    `

    const paid = await pay(second, { intentId: intent.intentId }, intent.orderId)
    expect(paid.status()).toBe(409)

    const status = await second.get(`${API}/api/v1/booking-intents/${intent.intentId}`)
    expect((await status.json()).data).toMatchObject({
      status: 'failed',
      failureReason: 'garage_paused',
    })
  })

  test('an unpaid booking whose time has filled cannot be paid for', async () => {
    // Before any money: no order is opened for it.
    const order = await latePayer.post(`${API}/api/v1/payments/orders`, {
      data: { bookingId: BOOKINGS.payLaterFull },
    })
    expect(order.status()).toBe(409)
    expect(await order.json()).toEqual({
      success: false,
      message:
        "This time has been booked up at the garage, so this booking can't be paid for. You can cancel it.",
      code: 'SLOT_FULL',
    })

    // And if a payment lands anyway (an order opened before the bay filled),
    // the booking is cancelled for a refund rather than squeezed in.
    const paid = await pay(latePayer, { bookingId: BOOKINGS.payLaterFull }, 'order_e2e_late_payer')
    expect(paid.status()).toBe(409)
    expect(await paid.json()).toEqual({
      success: false,
      message: expect.stringContaining('Your payment will be refunded.'),
      code: 'BOOKING_CONFIRM_FAILED_REFUND_DUE',
    })

    const [row] = await sql<{ status: string; payment: string }[]>`
      select b.status, p.status as payment
        from bookings b join payments p on p.booking_id = b.id
       where b.id = ${BOOKINGS.payLaterFull}
    `
    // Paid, because the money was taken; cancelled, because the garage can't
    // do it. Ops refunds it from the alert.
    expect(row).toEqual({ status: 'cancelled', payment: 'paid' })
  })
})
