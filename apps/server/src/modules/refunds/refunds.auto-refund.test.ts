/**
 * The automatic mode (AUTO_REFUNDS) never refunds a deleted account's money
 * (owner, 10 Nov 2026, asked whether a paid booking ended by deleting the
 * customer's account from admin should go back by itself: "Not
 * automatically"). That delete cancels the booking as Detlio's decision,
 * which on any other booking is a clear-cut case it sends; here the refund
 * stays owed on the Refunds page for a person.
 *
 * Only the database and Razorpay are stood in for (the refunds repository's
 * reads and `fetch`, put back afterwards): nothing reaches Razorpay unless
 * the automatic mode decides to send, so a call to `fetch` is the tell.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { refundsRepository } = await import('./refunds.repository.js')
const { refundsService } = await import('./refunds.service.js')

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const BOOKING = 'e2e00000-0000-4000-8000-000000007360'
const now = new Date()

/** A paid booking cancelled an hour ago as Detlio's decision: what the admin account delete leaves. */
function cancelledByDetlio(customerDeletedAt: Date | null) {
  return {
    bookingId: BOOKING,
    status: 'paid',
    amount: '450.00',
    gatewayTxnId: 'pay_AccountDeleted1',
    paidAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    refundedAmount: null,
    refundRef: null,
    refundedAt: null,
    refundedBy: null,
    refundNote: null,
    bookingStatus: 'cancelled',
    noShow: null,
    noShowMarkedAt: null,
    cancelledBy: 'admin',
    cancelledOnBehalfOf: 'detlio',
    cancelledAt: new Date(now.getTime() - 60 * 60 * 1000),
    responseMissedAt: null,
    guaranteeRefundAt: null,
    moved: false,
    customerName: customerDeletedAt ? 'Deleted account' : 'Leaving Lavanya',
    customerPhone: customerDeletedAt
      ? 'deleted-0123456789abcdef'
      : '9000007304',
    customerDeletedAt,
    garageName: 'Owner Delete Car Spa',
  }
}

let row: ReturnType<typeof cancelledByDetlio>
let razorpayCalls: string[]

beforeAll(() => {
  patch(env, 'autoRefunds', true)
  patch(env, 'e2eFakePayments', false)
  patch(env, 'razorpayKeyId', 'rzp_live_unit')
  patch(env, 'razorpayKeySecret', 'unit-secret')
  patch(refundsRepository, 'findBookingPayment', async () => row)
  patch(
    refundsRepository,
    'withRefundLock',
    async (
      _key: string,
      _options: unknown,
      work: (tx: unknown) => unknown
    ) => ({
      kind: 'done',
      value: await work({}),
    })
  )
  patch(refundsRepository, 'hasOpenComplaint', async () => false)
  patch(refundsRepository, 'countFailedAttempts', async () => 0)
  patch(refundsRepository, 'listMaybeOwed', async () => ({
    bookingPayments: [row],
    checkouts: [],
    bills: [],
  }))
  // Razorpay "doesn't answer": a send that reaches it stops there.
  patch(globalThis, 'fetch', async (url: string | URL) => {
    razorpayCalls.push(String(url))
    throw new Error('no network in unit tests')
  })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

beforeEach(() => {
  razorpayCalls = []
})

describe('AUTO_REFUNDS and a deleted account (owner, 10 Nov 2026: not automatically)', () => {
  test('a booking cancelled by deleting the account is held for a person, and Razorpay is never asked', async () => {
    row = cancelledByDetlio(now)
    expect(
      await refundsService.autoRefund({ kind: 'booking', id: BOOKING })
    ).toBe('not_clear_cut')
    expect(razorpayCalls).toEqual([])
  })

  test("the same cancellation on a live account is the automatic mode's to send: it goes to Razorpay", async () => {
    row = cancelledByDetlio(null)
    expect(
      await refundsService.autoRefund({ kind: 'booking', id: BOOKING })
    ).toBe('unavailable')
    expect(razorpayCalls).toEqual([
      'https://api.razorpay.com/v1/payments/pay_AccountDeleted1/refunds?count=100',
    ])
  })

  test("the cron's sweep never tries it", async () => {
    // A live account's would be one of its candidates.
    row = cancelledByDetlio(null)
    expect(
      await refundsService.sweepAutoRefunds({ dryRun: true })
    ).toMatchObject({ candidates: 1 })
    row = cancelledByDetlio(now)
    expect(
      await refundsService.sweepAutoRefunds({ dryRun: false })
    ).toMatchObject({
      enabled: true,
      candidates: 0,
      tried: 0,
    })
    expect(razorpayCalls).toEqual([])
  })
})
