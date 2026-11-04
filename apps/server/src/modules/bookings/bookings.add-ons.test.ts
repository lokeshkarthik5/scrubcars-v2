/**
 * Add-ons alone (0068), through the real pricing path every booking and
 * checkout comes through (resolveBookingDraft). Only the database is stood in
 * for, and put back afterwards.
 */
import { afterEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { resolveBookingDraft, toBookingResponse } =
  await import('./bookings.service.js')
const { bookingsRepository } = await import('./bookings.repository.js')
const { ADD_ONS_ALONE_CODE } = await import('../../lib/add-ons.js')
const { AppError } = await import('../../lib/errors.js')

const id = (n: number) =>
  `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GARAGE = id(5801)
const FOAM = id(5802)
const HELMET = id(5803)

const row = (
  rowId: string,
  isAddon: boolean,
  durationMins: number | null,
  price: string
) => ({
  id: rowId,
  vendorId: GARAGE,
  name: isAddon ? 'Helmet wash' : 'Foam wash',
  category: isAddon ? 'others' : 'car_wash',
  pricingType: 'flat',
  price,
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
  durationMins,
  isActive: true,
  isAddon,
})

const restores: Array<() => void> = []
function patch(target: object, key: string, value: unknown) {
  const holder = target as Record<string, unknown>
  const original = holder[key]
  holder[key] = value
  restores.push(() => {
    holder[key] = original
  })
}
afterEach(() => {
  while (restores.length) restores.pop()!()
})

function standIn(rows: ReturnType<typeof row>[]) {
  patch(bookingsRepository, 'findPublicVendorById', async () => ({
    id: GARAGE,
    dropinEnabled: true,
    doorstepEnabled: false,
    bookingsPausedAt: null,
  }))
  patch(bookingsRepository, 'findServicesForVendor', async () => rows)
  // Stops the path here, once the lines are read: enough to see what they became.
  patch(bookingsRepository, 'findVehicleForUser', async () => {
    throw new Error('past the lines')
  })
}

const input = (serviceIds: string[]) => ({
  vendorId: GARAGE,
  serviceIds,
  vehicleId: id(5804),
  bookingType: 'dropin' as const,
  scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  paymentMethod: 'online' as const,
})

describe('a booking or checkout of add-ons alone', () => {
  test('is refused before anything is priced', async () => {
    standIn([row(HELMET, true, 10, '99.00')])
    const refusal = await resolveBookingDraft('user', input([HELMET])).catch(
      (error: unknown) => error
    )
    expect(refusal).toBeInstanceOf(AppError)
    expect((refusal as InstanceType<typeof AppError>).code).toBe(
      ADD_ONS_ALONE_CODE
    )
  })

  test('with a service, goes on', async () => {
    standIn([row(HELMET, true, 10, '99.00'), row(FOAM, false, 45, '599.00')])
    await expect(
      resolveBookingDraft('user', input([HELMET, FOAM]))
    ).rejects.toThrow('past the lines')
  })
})

describe('the line limits, on the real path', () => {
  const rows = (count: number, isAddon: boolean, from: number) =>
    Array.from({ length: count }, (_, i) => row(id(from + i), isAddon, 10, '99.00'))

  test('eleven services are refused, by name', async () => {
    const eleven = rows(11, false, 5900)
    standIn(eleven)
    const refusal = await resolveBookingDraft('user', input(eleven.map((r) => r.id))).catch((error: unknown) => error)
    expect((refusal as InstanceType<typeof AppError>).code).toBe('TOO_MANY_SERVICES')
  })

  test('five services and six add-ons go on', async () => {
    const lines = [...rows(5, false, 5900), ...rows(6, true, 5920)]
    standIn(lines)
    await expect(resolveBookingDraft('user', input(lines.map((r) => r.id)))).rejects.toThrow('past the lines')
  })
})

describe('the booking line payload', () => {
  test('carries isAddon, which a client that ignores it still shows as a plain line', () => {
    const response = toBookingResponse({
      id: 'b1',
      status: 'confirmed',
      bookingType: 'dropin',
      scheduledAt: new Date(),
      amount: '698.00',
      durationMins: 55,
      createdAt: new Date(),
      items: [
        {
          id: 'i1',
          serviceId: FOAM,
          name: 'Foam wash',
          amount: '599.00',
          durationMins: 45,
          sortOrder: 0,
          isAddon: false,
        },
        {
          id: 'i2',
          serviceId: HELMET,
          name: 'Helmet wash',
          amount: '99.00',
          durationMins: 10,
          sortOrder: 1,
          isAddon: true,
        },
      ],
    } as never)
    expect(response.items.map((item) => [item.name, item.isAddon])).toEqual([
      ['Foam wash', false],
      ['Helmet wash', true],
    ])
    expect(response.durationMins).toBe(55)
  })
})
