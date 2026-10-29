/**
 * Withdrawing (0066), through each service with its repository stood in:
 * a complaint (the customer's own, raised in the app, nobody has answered),
 * a garage's yes to a visit request (its own, accepted, nobody paying for it
 * right now) and a free-wash area list (the customer's own sign-up).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { complaintsService } = await import('./complaints.service.js')
const { complaintsRepository } = await import('./complaints.repository.js')
const { COMPLAINT_WITHDRAWN_BY } = await import('../../lib/complaints.js')
const { bookingRequestsService } = await import('../booking-requests/booking-requests.service.js')
const { bookingRequestsRepository } = await import('../booking-requests/booking-requests.repository.js')
const { areaSignupsService } = await import('../area-signups/area-signups.service.js')
const { areaSignupsRepository } = await import('../area-signups/area-signups.repository.js')
const { pushService } = await import('../push/push.service.js')

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

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

// ─── Complaints ──────────────────────────────────────────────────────────────

const ME = 'u-6701'
const NOW = new Date('2026-10-29T10:00:00Z')

function complaintRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    number: 123,
    userId: ME,
    status: 'open',
    category: 'service_quality',
    message: 'The car was still dusty.',
    bookingId: null,
    bookingRef: null,
    garageName: null,
    source: 'app',
    receivedAt: NOW,
    createdAt: NOW,
    acknowledgedAt: null as Date | null,
    resolvedAt: null as Date | null,
    closedAt: null as Date | null,
    resolutionNote: null as string | null,
    withdrawnAt: null as Date | null,
    ...over,
  }
}

let complaints: Record<string, ReturnType<typeof complaintRow>>

describe('withdrawing a complaint', () => {
  beforeAll(() => {
    patch(complaintsRepository, 'withdrawOwn', async (id: string, userId: string, at: Date) => {
      const row = complaints[id]
      if (!row || row.userId !== userId || row.status !== 'open' || row.source !== 'app') return null
      complaints[id] = { ...row, status: 'closed', acknowledgedAt: at, closedAt: at, withdrawnAt: at }
      return complaints[id]
    })
    patch(complaintsRepository, 'findOwn', async (id: string, userId: string) => {
      const row = complaints[id]
      return row && row.userId === userId ? { id, status: row.status, source: row.source } : null
    })
  })
  beforeEach(() => {
    complaints = { 'c-1': complaintRow() }
  })

  test('open and unanswered: closed as withdrawn, and Withdraw no longer applies', async () => {
    const view = await complaintsService.withdraw(ME, 'c-1', NOW)
    expect(view.status).toBe('closed')
    expect(view.withdrawnAt).toBe(NOW.toISOString())
    expect(view.canWithdraw).toBe(false)
    expect(COMPLAINT_WITHDRAWN_BY).toBe('Customer (withdrawn)')
  })

  test("someone else's is a 404, an answered one a 409, a team-logged one a 409 that says so", async () => {
    expect((await refusal(complaintsService.withdraw('u-other', 'c-1', NOW)))?.statusCode).toBe(404)
    complaints['c-1'] = complaintRow({ status: 'acknowledged', acknowledgedAt: NOW })
    const answered = await refusal(complaintsService.withdraw(ME, 'c-1', NOW))
    expect(answered?.code).toBe('COMPLAINT_NOT_WITHDRAWABLE')
    expect(answered?.message).toContain('already answered')
    complaints['c-1'] = complaintRow({ source: 'phone' })
    expect((await refusal(complaintsService.withdraw(ME, 'c-1', NOW)))?.message).toContain('logged this complaint')
  })
})

// ─── A garage's yes to a visit request ───────────────────────────────────────

const GARAGE = 'v-6701'

function requestRow(over: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    userId: ME,
    vendorId: GARAGE,
    rootRequestId: null,
    chainNo: 1,
    status: 'accepted',
    reply: 'accepted',
    bookingType: 'doorstep',
    vehicleType: 'sedan',
    items: [{ serviceId: 's-1', name: 'Exterior Wash', amount: '499.00', category: 'car_wash' }],
    subtotalAmount: '499.00',
    durationMins: 60,
    windowDate: '2026-10-30',
    windowPart: 'morning',
    windowStart: new Date('2026-10-30T03:30:00Z'),
    windowEnd: new Date('2026-10-30T06:30:00Z'),
    zoneSlug: null,
    distanceKm: '12.0',
    coverKm: '10.0',
    outsideKm: '2.0',
    respondBy: new Date('2026-10-29T12:00:00Z'),
    travelFee: '100.00',
    acceptedStartAt: new Date('2026-10-30T04:00:00Z'),
    confirmBy: new Date('2026-10-29T12:00:00Z'),
    withdrawnAt: null as Date | null,
    createdAt: NOW,
    ...over,
  }
}

let requests: Record<string, ReturnType<typeof requestRow>>
let checkoutOpen: boolean
let told: string[]

describe("the garage withdraws its yes before the customer pays", () => {
  beforeAll(() => {
    patch(bookingRequestsRepository, 'findById', async (id: string) => requests[id] ?? null)
    patch(bookingRequestsRepository, 'withdrawAccepted', async (input: { id: string; vendorId: string; now: Date }) => {
      const row = requests[input.id]
      if (!row || row.vendorId !== input.vendorId || row.status !== 'accepted' || checkoutOpen) return null
      requests[input.id] = { ...row, status: 'cancelled', withdrawnAt: input.now }
      return requests[input.id]
    })
    patch(bookingRequestsRepository, 'hasOpenCheckout', async () => checkoutOpen)
    patch(bookingRequestsRepository, 'garageName', async () => 'Marina Auto Spa')
    patch(bookingRequestsRepository, 'markCustomerTold', async () => undefined)
    patch(bookingRequestsRepository, 'countReceivedChains', async () => 3)
    patch(bookingRequestsRepository, 'listZones', async () => [])
    patch(pushService, 'notifyCustomer', (userId: string) => void told.push(userId))
  })
  beforeEach(() => {
    requests = { 'r-1': requestRow() }
    checkoutOpen = false
    told = []
  })

  test('accepted and nobody paying: withdrawn, and the customer is told', async () => {
    const view = await bookingRequestsService.withdraw(GARAGE, 'r-1', true, NOW)
    expect(view).toMatchObject({ status: 'cancelled', withdrawn: true, canWithdraw: false })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(told).toEqual([ME])
  })

  test('the customer is paying right now: 409, and nothing changes', async () => {
    checkoutOpen = true
    expect((await refusal(bookingRequestsService.withdraw(GARAGE, 'r-1', true, NOW)))?.code).toBe('REQUEST_CHECKOUT_OPEN')
    expect(requests['r-1']!.status).toBe('accepted')
  })

  test("not accepted any more, or another garage's: refused", async () => {
    requests['r-1'] = requestRow({ status: 'converted' })
    expect((await refusal(bookingRequestsService.withdraw(GARAGE, 'r-1', true, NOW)))?.code).toBe('REQUEST_STATE_CHANGED')
    requests['r-1'] = requestRow({ vendorId: 'v-other' })
    expect((await refusal(bookingRequestsService.withdraw(GARAGE, 'r-1', true, NOW)))?.statusCode).toBe(404)
  })
})

// ─── A free-wash area list ───────────────────────────────────────────────────

let signups: Array<{ userId: string; zoneId: string }>

describe('leaving a free-wash area list', () => {
  beforeAll(() => {
    patch(areaSignupsRepository, 'findZoneBySlug', async (slug: string) => (slug === 'perambur' ? { id: 'z-1', slug } : null))
    patch(areaSignupsRepository, 'deleteSignup', async (userId: string, zoneId: string) => {
      const before = signups.length
      signups = signups.filter((s) => !(s.userId === userId && s.zoneId === zoneId))
      return signups.length < before
    })
  })
  beforeEach(() => {
    signups = [
      { userId: ME, zoneId: 'z-1' },
      { userId: 'u-other', zoneId: 'z-1' },
    ]
  })

  test('the sign-up goes, and only theirs', async () => {
    expect(await areaSignupsService.leave(ME, 'perambur')).toEqual({ left: true })
    expect(signups).toEqual([{ userId: 'u-other', zoneId: 'z-1' }])
  })

  test('not on it, or no such area: 404', async () => {
    await areaSignupsService.leave(ME, 'perambur')
    expect((await refusal(areaSignupsService.leave(ME, 'perambur')))?.code).toBe('SIGNUP_NOT_FOUND')
    expect((await refusal(areaSignupsService.leave(ME, 'nowhere')))?.code).toBe('AREA_NOT_FOUND')
  })
})
