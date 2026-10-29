/**
 * The garage cancelling a booking it accepted (0066, lib/garage-cancel.ts),
 * through the service with its repository stand-ins: only a confirmed job
 * that has not started (pickup: car not collected) of the garage's own;
 * the write is the ordinary cancel stamped as a garage cancellation; a paid
 * one is refunded through the usual queue, the slot freed and the customer
 * told; a write that lost a race says why.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { bookingsService } = await import('./bookings.service.js')
const { bookingsRepository } = await import('./bookings.repository.js')
const { vendorsRepository } = await import('../vendors/vendors.repository.js')
const { refundsService } = await import('../refunds/refunds.service.js')
const { slotAlertsService } = await import('../slot-alerts/slot-alerts.service.js')
const { analyticsService } = await import('../analytics/analytics.service.js')
const { pushService } = await import('../push/push.service.js')
const { guaranteeService } = await import('../guarantee/guarantee.service.js')

const GARAGE = 'v-6601'
const HOUR = 60 * 60 * 1000

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

let rows: Record<string, Record<string, unknown>>
let cancelCalls: Array<{ id: string; by: string; from: string; reason: string; options: unknown }>
let refunds: string[]
let freed: string[]
let pushed: Array<{ title: string; body: string }>
let raceTo: Record<string, unknown> | null

function payment(status: string) {
  return {
    id: 'p-6601',
    status,
    amount: '600.00',
    creditAmount: '0.00',
    currency: 'INR',
    paidAt: status === 'paid' ? new Date() : null,
    createdAt: new Date(),
    refundedAmount: null,
  }
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'b-6601',
    userId: 'u-6601',
    vendorId: GARAGE,
    status: 'confirmed',
    bookingType: 'dropin',
    scheduledAt: new Date(Date.now() + 48 * HOUR),
    durationMins: 60,
    amount: '600.00',
    pickedUpAt: null,
    guaranteeRedo: false,
    garageCancelledAt: null,
    paymentMethod: 'online',
    createdAt: new Date(Date.now() - 24 * HOUR),
    vendor: { id: GARAGE, businessName: 'Marina Auto Spa', phone: '9000006601' },
    user: { id: 'u-6601', name: 'Kavya Raman', phone: '9000006602' },
    items: [{ name: 'Exterior Wash' }],
    payment: payment('paid'),
    ...over,
  }
}

beforeAll(() => {
  patch(vendorsRepository, 'findVendorById', async (id: string) => (id === GARAGE ? { id: GARAGE } : undefined))
  patch(bookingsRepository, 'findBookingById', async (id: string) => rows[id])
  patch(
    bookingsRepository,
    'cancelBooking',
    async (id: string, by: string, from: string, reason: string, _proposal: unknown, options: { garageCancelled?: boolean }) => {
      cancelCalls.push({ id, by, from, reason, options })
      if (raceTo) {
        rows[id] = { ...rows[id], ...raceTo }
        return []
      }
      const current = rows[id]!
      if (current.status !== from || current.pickedUpAt) return []
      const at = new Date()
      rows[id] = {
        ...current,
        status: 'cancelled',
        cancelledBy: by,
        cancellationReason: reason,
        cancelledAt: at,
        garageCancelledAt: options?.garageCancelled ? at : null,
      }
      return [rows[id]]
    }
  )
  patch(refundsService, 'queueAutoRefund', (target: { id: string }) => void refunds.push(target.id))
  patch(slotAlertsService, 'capacityFreed', (booking: { id: string }) => void freed.push(booking.id))
  patch(analyticsService, 'bookingCancelled', () => undefined)
  patch(pushService, 'notifyCustomer', (_userId: string, message: { title: string; body: string }) => void pushed.push(message))
  patch(guaranteeService, 'redoChanged', () => undefined)
})

beforeEach(() => {
  rows = { 'b-6601': row() }
  cancelCalls = []
  refunds = []
  freed = []
  pushed = []
  raceTo = null
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
    return null
  } catch (error) {
    return error as { statusCode: number; code: string; message: string }
  }
}

describe('garageCancelBooking', () => {
  test('an accepted job: cancelled as the garage, stamped, refunded, slot freed, customer told', async () => {
    const answer = await bookingsService.garageCancelBooking(GARAGE, 'staff-1', 'b-6601', 'Our washer broke down')
    expect(cancelCalls).toEqual([
      { id: 'b-6601', by: 'vendor', from: 'confirmed', reason: 'Our washer broke down', options: { garageCancelled: true } },
    ])
    expect(answer.status).toBe('cancelled')
    expect(answer.garageCancelled).toEqual({ at: expect.any(String), late: false })
    expect(refunds).toEqual(['b-6601'])
    expect(freed).toEqual(['b-6601'])
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.title).toBe('Marina Auto Spa cancelled your booking')
    // The garage's words never reach the customer's phone.
    expect(JSON.stringify(pushed)).not.toContain('washer')
  })

  test('within 24 hours of the slot it is late (a missed booking)', async () => {
    rows['b-6601'] = row({ scheduledAt: new Date(Date.now() + 3 * HOUR) })
    const answer = await bookingsService.garageCancelBooking(GARAGE, 'staff-1', 'b-6601', 'Short of staff')
    expect(answer.garageCancelled?.late).toBe(true)
  })

  test('nothing paid: nothing queued for a refund', async () => {
    rows['b-6601'] = row({ payment: payment('pending') })
    await bookingsService.garageCancelBooking(GARAGE, 'staff-1', 'b-6601', 'Short of staff')
    expect(refunds).toEqual([])
  })

  test('pending is a Reject, a started job is refused, as is a collected car', async () => {
    rows['b-6601'] = row({ status: 'pending' })
    expect((await refusal(bookingsService.garageCancelBooking(GARAGE, 's', 'b-6601', 'xyz')))?.code).toBe(
      'INVALID_BOOKING_STATUS'
    )
    rows['b-6601'] = row({ status: 'in_progress' })
    expect((await refusal(bookingsService.garageCancelBooking(GARAGE, 's', 'b-6601', 'xyz')))?.code).toBe('JOB_STARTED')
    rows['b-6601'] = row({ bookingType: 'pickup', pickedUpAt: new Date() })
    expect((await refusal(bookingsService.garageCancelBooking(GARAGE, 's', 'b-6601', 'xyz')))?.code).toBe('CAR_WITH_GARAGE')
    expect(cancelCalls).toEqual([])
    expect(refunds).toEqual([])
  })

  test("another garage's booking is a 404", async () => {
    rows['b-6601'] = row({ vendorId: 'v-other' })
    expect((await refusal(bookingsService.garageCancelBooking(GARAGE, 's', 'b-6601', 'xyz')))?.statusCode).toBe(404)
  })

  test('started in between: the lost write says the job started, and nothing else happens', async () => {
    raceTo = { status: 'in_progress' }
    expect((await refusal(bookingsService.garageCancelBooking(GARAGE, 's', 'b-6601', 'xyz')))?.code).toBe('JOB_STARTED')
    expect(refunds).toEqual([])
    expect(pushed).toEqual([])
  })
})
