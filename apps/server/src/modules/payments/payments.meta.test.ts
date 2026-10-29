/**
 * The Meta Purchase wiring in paymentsService.verifyPayment, over stand-in
 * repositories and a recording metaCapi.reportPurchase: a consented verify
 * that wrote or confirmed a paid booking reports that booking, with the
 * request's address and user agent and the browser's cookies; one without
 * consent, or whose payment is not paid, reports nothing. The loader it
 * hands over reads the Razorpay amount and leaves out test money and
 * cancelled bookings. No network.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { createHmac } from 'node:crypto'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { metaCapi } = await import('../../lib/meta-capi.js')
const { bookingIntentsService } =
  await import('../booking-intents/booking-intents.service.js')
const { paymentsRepository } = await import('./payments.repository.js')
const { paymentsService } = await import('./payments.service.js')
const { verifyPaymentSchema } = await import('./payments.validation.js')

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const USER = 'e2e00000-0000-4000-8000-000000009201'
const BOOKING = 'e2e00000-0000-4000-8000-000000009202'
const INTENT = 'e2e00000-0000-4000-8000-000000009203'
const SECRET = 'meta-wiring-test-secret'
const PAID_AT = new Date('2026-10-27T05:30:00.000Z')
const UA = 'Mozilla/5.0 (Linux; Android 15) Chrome/141.0'
const request = { clientIp: '203.0.113.9', userAgent: UA }
const marketing = {
  consent: true,
  fbp: 'fb.1.1761543000000.42',
  fbc: 'fb.1.1761543000000.IwAR9',
  eventSourceUrl: 'https://detlio.com/checkout',
}

let paymentStatus = 'paid'
let facts: Record<string, unknown> | null = null
const reports: Array<{
  bookingId: string
  context: Record<string, unknown>
  loadFacts: () => Promise<unknown>
}> = []

function paymentRow() {
  return {
    id: 'p-1',
    bookingId: BOOKING,
    gateway: 'razorpay',
    gatewayTxnId: 'order_LIVE',
    amount: '749.00',
    currency: 'INR',
    status: paymentStatus,
    paidAt: PAID_AT,
    createdAt: PAID_AT,
    booking: { id: BOOKING, status: 'pending' },
  }
}

const savedSecret = env.razorpayKeySecret
const savedKeyId = env.razorpayKeyId
const envValues = env as unknown as Record<string, unknown>

beforeAll(() => {
  envValues.razorpayKeyId = 'rzp_live_test'
  envValues.razorpayKeySecret = SECRET
  patch(paymentsRepository, 'findBookingById', async () => ({
    id: BOOKING,
    userId: USER,
    paymentMethod: 'online',
    status: 'pending',
  }))
  patch(paymentsRepository, 'findPaymentByBookingId', async () => paymentRow())
  patch(paymentsRepository, 'findPurchaseFacts', async () => facts)
  patch(bookingIntentsService, 'confirmIntent', async () => ({
    bookingId: BOOKING,
    created: true,
  }))
  patch(
    metaCapi,
    'reportPurchase',
    (
      bookingId: string,
      context: Record<string, unknown>,
      loadFacts: () => Promise<unknown>
    ) => {
      reports.push({ bookingId, context, loadFacts })
    }
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  envValues.razorpayKeySecret = savedSecret
  envValues.razorpayKeyId = savedKeyId
})

beforeEach(() => {
  reports.length = 0
  paymentStatus = 'paid'
  facts = {
    bookingStatus: 'pending',
    amount: '749.00',
    paymentStatus: 'paid',
    gatewayMode: 'live',
    paidAt: PAID_AT,
    serviceCount: 2,
  }
})

/** The body as the route would hand it over, after the schema. */
function input(body: Record<string, unknown>) {
  const parsed = verifyPaymentSchema.parse(body)
  return parsed
}

function intentBody(extra: Record<string, unknown> = {}) {
  const orderId = 'order_LIVE'
  const paymentId = 'pay_LIVE'
  return {
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: createHmac('sha256', SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex'),
    intentId: INTENT,
    ...extra,
  }
}

describe('verifyPayment → Meta Purchase', () => {
  test('a consented verify that wrote the booking reports that booking', async () => {
    const result = await paymentsService.verifyPayment(
      USER,
      input(intentBody({ marketing })),
      request
    )
    expect(result.bookingId).toBe(BOOKING)
    expect(reports).toHaveLength(1)
    expect(reports[0].bookingId).toBe(BOOKING)
    expect(reports[0].context).toEqual({
      clientIp: '203.0.113.9',
      userAgent: UA,
      fbp: marketing.fbp,
      fbc: marketing.fbc,
      eventSourceUrl: marketing.eventSourceUrl,
    })
  })

  test('a consented verify of an already-paid booking (legacy flow) reports it too', async () => {
    const body = {
      razorpayOrderId: 'order_LIVE',
      razorpayPaymentId: 'pay_LIVE',
      razorpaySignature: 'x',
      bookingId: BOOKING,
      marketing,
    }
    await paymentsService.verifyPayment(USER, input(body), request)
    expect(reports.map((r) => r.bookingId)).toEqual([BOOKING])
  })

  test('no consent: nothing is reported', async () => {
    await paymentsService.verifyPayment(USER, input(intentBody()), request)
    expect(reports).toHaveLength(0)
  })

  test('a payment that is not paid (refunded) is not reported', async () => {
    paymentStatus = 'refunded'
    await paymentsService.verifyPayment(
      USER,
      input(intentBody({ marketing })),
      request
    )
    expect(reports).toHaveLength(0)
  })

  test('a verify that fails reports nothing', async () => {
    const body = intentBody({ marketing, razorpaySignature: 'forged' })
    await expect(
      paymentsService.verifyPayment(USER, input(body), request)
    ).rejects.toThrow()
    expect(reports).toHaveLength(0)
  })

  test('the loader: Razorpay rupees as a number, the service count, the paid time', async () => {
    await paymentsService.verifyPayment(
      USER,
      input(intentBody({ marketing })),
      request
    )
    expect(await reports[0].loadFacts()).toEqual({
      bookingId: BOOKING,
      valueRupees: 749,
      serviceCount: 2,
      paidAt: PAID_AT,
    })
  })

  test('the loader leaves out test money, unpaid payments and cancelled bookings', async () => {
    await paymentsService.verifyPayment(
      USER,
      input(intentBody({ marketing })),
      request
    )
    const load = reports[0].loadFacts
    for (const change of [
      { gatewayMode: 'test' },
      { gatewayMode: 'fake' },
      { paymentStatus: 'refunded' },
      { bookingStatus: 'cancelled' },
    ]) {
      facts = { ...facts, ...change }
      expect(await load()).toBeNull()
      facts = {
        ...facts,
        gatewayMode: 'live',
        paymentStatus: 'paid',
        bookingStatus: 'pending',
      }
    }
    facts = null
    expect(await load()).toBeNull()
  })
})
