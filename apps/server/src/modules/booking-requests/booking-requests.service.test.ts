/**
 * The garage's request inbox (customer reach, 0062), with only the database
 * stood in for (the repository's methods replaced on its object, put back
 * after):
 *
 * - `earn` is money: the owner seat sees it, an operator never does, in the
 *   list and in the answer to its own yes.
 * - The garage's received-bookings count behind `earn` is read once per
 *   inbox, not once per card.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { pushService } = await import('../push/push.service.js')
const { vendorsRepository } = await import('../vendors/vendors.repository.js')
const { bookingRequestsRepository } = await import('./booking-requests.repository.js')
const { bookingRequestsService } = await import('./booking-requests.service.js')

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const GARAGE = 'e2e00000-0000-4000-8000-000000004480'
// Wed 28 Oct 2026, 10:00 IST; the window is the next morning.
const NOW = new Date('2026-10-28T10:00:00+05:30')
const START = new Date('2026-10-29T10:00:00+05:30')

const row = (id: string) => ({
  id,
  userId: 'customer',
  vendorId: GARAGE,
  rootRequestId: null,
  forwardedFromId: null,
  chainNo: 1,
  status: 'pending' as const,
  bookingType: 'doorstep' as const,
  vehicleId: 'car',
  vehicleType: 'sedan' as const,
  addressId: 'home',
  lat: 13.0,
  lng: 80.2,
  zoneSlug: 'adyar',
  distanceKm: '9.0',
  coverKm: '5.0',
  outsideKm: '4.0',
  items: [{ serviceId: 'wash', name: 'Foam wash', category: 'car_wash', amount: '600.00', durationMins: 60 }],
  subtotalAmount: '600.00',
  durationMins: 60,
  windowDate: '2026-10-29',
  windowPart: 'morning' as const,
  windowStart: new Date('2026-10-29T09:00:00+05:30'),
  windowEnd: new Date('2026-10-29T12:00:00+05:30'),
  respondBy: new Date(NOW.getTime() + 2 * 60 * 60 * 1000),
  reply: null,
  repliedAt: null,
  repliedBy: null,
  travelFee: null,
  acceptedStartAt: null,
  confirmBy: null,
  bookingId: null,
  opsAlertedAt: null,
  customerToldAt: null,
  closedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
})

let receivedReads = 0

beforeAll(() => {
  patch(bookingRequestsRepository, 'listForGarage', async () => [row('r1'), row('r2'), row('r3')])
  patch(bookingRequestsRepository, 'listZones', async () => [{ slug: 'adyar', name: 'Adyar' }])
  patch(bookingRequestsRepository, 'countWaitingForGarage', async () => 3)
  patch(bookingRequestsRepository, 'countReceivedChains', async () => {
    receivedReads++
    return 40 // past the free 25: commission applies
  })
  patch(bookingRequestsRepository, 'findById', async (id: string) => row(id))
  patch(bookingRequestsRepository, 'garageDay', async () => ({
    hours: { openTime: '09:00:00', closeTime: '19:00:00', isClosed: false },
    holiday: false,
  }))
  patch(bookingRequestsRepository, 'capacityHolders', async () => [])
  patch(bookingRequestsRepository, 'accept', async (input: { id: string; travelFee: string; startAt: Date; confirmBy: Date }) => ({
    ...row(input.id),
    status: 'accepted',
    reply: 'accepted',
    travelFee: input.travelFee,
    acceptedStartAt: input.startAt,
    confirmBy: input.confirmBy,
  }))
  patch(bookingRequestsRepository, 'garageName', async () => 'Shine Doorstep')
  patch(vendorsRepository, 'findVendorById', async () => ({
    id: GARAGE,
    bookingsPausedAt: null,
    slotIntervalMins: 30,
    bays: 2,
    jobsPerDay: null,
  }))
  patch(pushService, 'notifyCustomer', () => {})
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

beforeEach(() => {
  receivedReads = 0
})

describe('the garage’s request inbox', () => {
  test('the owner sees what each request earns, read once for the whole inbox', async () => {
    const inbox = await bookingRequestsService.listForGarage(GARAGE, true, 'open', NOW)
    expect(inbox.items).toHaveLength(3)
    expect(inbox.items.every((item) => typeof item.earn === 'number' && item.earn > 0 && item.earn < 600)).toBe(true)
    expect(receivedReads).toBe(1)
  })

  test('an operator never sees earn, and nothing is read for it', async () => {
    const inbox = await bookingRequestsService.listForGarage(GARAGE, false, 'open', NOW)
    expect(inbox.items.map((item) => item.earn)).toEqual([null, null, null])
    expect(receivedReads).toBe(0)
  })

  test('an operator’s yes answers without earn; the owner’s with it', async () => {
    const byOperator = await bookingRequestsService.accept(GARAGE, 'operator', 'r1', { startAt: START.toISOString(), travelFee: 100 }, false, NOW)
    expect(byOperator.earn).toBeNull()
    expect(byOperator.travelFee).toBe(100)
    const byOwner = await bookingRequestsService.accept(GARAGE, 'owner', 'r1', { startAt: START.toISOString(), travelFee: 0 }, true, NOW)
    expect(typeof byOwner.earn).toBe('number')
  })
})
