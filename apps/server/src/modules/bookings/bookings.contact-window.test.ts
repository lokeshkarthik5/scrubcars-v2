/**
 * Contact windows on the wire (lib/contact-window.ts): the customer's booking
 * leaves out the garage's phone and WhatsApp outside the window, the garage's
 * booking leaves out the customer's phone, and both carry `contactWindow` so
 * the apps can explain. Admin's booking rows are untouched. The clock is
 * bun's system time; repositories are stand-ins.
 */
import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { bookingsService, toBookingResponse, toVendorBookingResponse } = await import('./bookings.service.js')
const { bookingsRepository } = await import('./bookings.repository.js')
const { membersRepository } = await import('../members/members.repository.js')
const { adminService } = await import('../admin/admin.service.js')
const { adminRepository } = await import('../admin/admin.repository.js')

const IST = (iso: string) => new Date(`${iso}+05:30`)
const SLOT = IST('2026-10-20T10:00:00')

const CUSTOMER_PHONE = '9000003401'
const GARAGE_PHONE = '9000003402'
const GARAGE_WHATSAPP = '9000003403'

type Row = Parameters<typeof toBookingResponse>[0]

function booking(over: Partial<Row> = {}): Row {
  return {
    id: 'b-3400',
    status: 'confirmed',
    bookingType: 'doorstep',
    scheduledAt: SLOT,
    durationMins: 60,
    amount: '500.00',
    paymentMethod: 'online',
    lat: 13.04,
    lng: 80.23,
    address: '7, Lake View Road, Adyar',
    vendorId: 'v-3400',
    createdAt: IST('2026-10-17T09:00:00'),
    user: { id: 'u-3400', name: 'Kavya Raman', phone: CUSTOMER_PHONE },
    vendor: {
      id: 'v-3400',
      businessName: 'Window Wash',
      phone: GARAGE_PHONE,
      city: 'Chennai',
      address: '12, Main Road, Velachery',
      lat: 12.98,
      lng: 80.22,
      whatsapp: GARAGE_WHATSAPP,
      mapsUrl: 'https://maps.app.goo.gl/abc',
    },
    items: [],
    payment: null,
    ...over,
  } as Row
}

afterEach(() => setSystemTime())

describe('the customer’s booking payload', () => {
  test('outside the window: no garage phone or WhatsApp, the address and maps link stay', () => {
    setSystemTime(IST('2026-10-19T10:00:00'))
    const out = toBookingResponse(booking())
    expect(out.vendor).toMatchObject({
      phone: null,
      whatsapp: null,
      address: '12, Main Road, Velachery',
      mapsUrl: 'https://maps.app.goo.gl/abc',
      lat: 12.98,
    })
    expect(out.contactWindow).toEqual({
      opensAt: IST('2026-10-20T08:00:00').toISOString(),
      closesAt: IST('2026-10-20T12:00:00').toISOString(),
      open: false,
    })
    expect(JSON.stringify(out.vendor)).not.toContain(GARAGE_PHONE)
    expect(JSON.stringify(out.vendor)).not.toContain(GARAGE_WHATSAPP)
  })

  test('inside the window: the garage’s phone and WhatsApp', () => {
    setSystemTime(IST('2026-10-20T08:30:00'))
    const out = toBookingResponse(booking())
    expect(out.vendor).toMatchObject({ phone: GARAGE_PHONE, whatsapp: GARAGE_WHATSAPP })
    expect(out.contactWindow.open).toBe(true)
  })

  test('the hour after completion, then hidden', () => {
    const done = booking({ status: 'completed', completedAt: IST('2026-10-20T11:00:00') })
    setSystemTime(IST('2026-10-20T11:30:00'))
    expect(toBookingResponse(done).vendor?.phone).toBe(GARAGE_PHONE)
    setSystemTime(IST('2026-10-20T12:30:00'))
    expect(toBookingResponse(done).vendor?.phone).toBeNull()
  })

  test('a cancelled booking never carries them, even at its slot', () => {
    setSystemTime(IST('2026-10-20T09:00:00'))
    const out = toBookingResponse(booking({ status: 'cancelled', cancelledAt: IST('2026-10-20T08:45:00') }))
    expect(out.vendor).toMatchObject({ phone: null, whatsapp: null })
  })
})

describe('the garage’s booking payload', () => {
  test('outside the window: the customer’s name, no phone; the doorstep address stays', () => {
    setSystemTime(IST('2026-10-19T10:00:00'))
    const out = toVendorBookingResponse(booking())
    expect(out.user).toEqual({ id: 'u-3400', name: 'Kavya Raman', phone: null })
    expect(out.address).toBe('7, Lake View Road, Adyar')
    expect(out.contactWindow).toMatchObject({ open: false })
    expect(JSON.stringify(out)).not.toContain(CUSTOMER_PHONE)
  })

  test('inside the window: the customer’s phone', () => {
    setSystemTime(IST('2026-10-20T09:00:00'))
    expect(toVendorBookingResponse(booking()).user?.phone).toBe(CUSTOMER_PHONE)
  })

  test('a pickup car with the garage: the phone shows whatever the clock says', () => {
    setSystemTime(IST('2026-10-21T20:00:00'))
    const collected = booking({ bookingType: 'pickup', pickedUpAt: IST('2026-10-20T10:05:00') })
    expect(toVendorBookingResponse(collected).user?.phone).toBe(CUSTOMER_PHONE)
  })

  test('the garage’s own number is not windowed from the garage', () => {
    setSystemTime(IST('2026-10-19T10:00:00'))
    expect(toVendorBookingResponse(booking()).vendor).toMatchObject({
      phone: GARAGE_PHONE,
      whatsapp: GARAGE_WHATSAPP,
    })
  })
})

describe('GET /bookings/:id picks the shape by viewer', () => {
  const saved: Array<[Record<string, unknown>, string, unknown]> = []
  const patch = (target: object, key: string, value: unknown) => {
    const object = target as Record<string, unknown>
    saved.push([object, key, object[key]])
    object[key] = value
  }

  beforeAll(() => {
    patch(bookingsRepository, 'findBookingById', async () => ({ ...booking(), userId: 'u-3400' }))
    patch(bookingsRepository, 'findMovedBookingIds', async () => new Set())
    patch(bookingsRepository, 'listRefundRecordsForBooking', async () => [])
    patch(membersRepository, 'findActiveVendorSeat', async (_vendorId: string, userId: string) =>
      userId === 'staff-3400' ? { role: 'vendor_operator' } : null
    )
    patch(membersRepository, 'findActivePlatformRow', async () => null)
  })
  afterAll(() => {
    for (const [object, key, value] of saved.reverse()) object[key] = value
  })

  test('two days out, neither side gets the other’s number', async () => {
    setSystemTime(IST('2026-10-18T10:00:00'))
    const mine = (await bookingsService.getBookingDetail('u-3400', 'b-3400')) as ReturnType<typeof toBookingResponse>
    expect(mine.vendor).toMatchObject({ phone: null, whatsapp: null })
    const theirs = (await bookingsService.getBookingDetail('staff-3400', 'b-3400')) as ReturnType<
      typeof toVendorBookingResponse
    >
    expect(theirs.user?.phone).toBeNull()
    expect(theirs.user?.name).toBe('Kavya Raman')
  })

  test('an hour before, both do', async () => {
    setSystemTime(IST('2026-10-20T09:00:00'))
    const mine = (await bookingsService.getBookingDetail('u-3400', 'b-3400')) as ReturnType<typeof toBookingResponse>
    expect(mine.vendor?.phone).toBe(GARAGE_PHONE)
    const theirs = (await bookingsService.getBookingDetail('staff-3400', 'b-3400')) as ReturnType<
      typeof toVendorBookingResponse
    >
    expect(theirs.user?.phone).toBe(CUSTOMER_PHONE)
  })
})

describe('admin is not windowed', () => {
  const saved: Array<[Record<string, unknown>, string, unknown]> = []
  const patch = (target: object, key: string, value: unknown) => {
    const object = target as Record<string, unknown>
    saved.push([object, key, object[key]])
    object[key] = value
  }
  const row = {
    ...booking(),
    userId: 'u-3400',
    items: [],
    charges: [],
    payment: null,
    vehicle: null,
    service: null,
    markedTestAt: null,
    markedTestBy: null,
  }

  beforeAll(() => {
    patch(adminRepository, 'searchBookingIds', async () => ['b-3400'])
    patch(adminRepository, 'findBookingsByIds', async () => [row])
    patch(adminRepository, 'countNotesByBooking', async () => new Map())
    patch(adminRepository, 'findMovedBookingIds', async () => new Set())
  })
  afterAll(() => {
    for (const [object, key, value] of saved.reverse()) object[key] = value
  })

  test('two days out, admin’s booking list still has both numbers', async () => {
    const now = IST('2026-10-18T10:00:00').getTime()
    setSystemTime(new Date(now))
    const [listed] = (await adminService.listBookings(
      { page: 1, limit: 20 } as Parameters<typeof adminService.listBookings>[0],
      now
    )) as Array<{ garage: { phone: string } | null; customer: { phone: string } | null }>
    expect(listed?.garage?.phone).toBe(GARAGE_PHONE)
    expect(listed?.customer?.phone).toBe(CUSTOMER_PHONE)
  })
})
