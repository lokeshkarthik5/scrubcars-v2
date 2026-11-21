/**
 * Garage Book stages 2 and 3 (0074) through the real routes and the real
 * auth and tenant middleware, as garage-book.routes.test.ts does for Stage
 * 1. Only the database and the bucket are stood in for (the seat lookups
 * and the book's repositories, put back afterwards).
 *
 * What it holds the module to:
 *   - GARAGE_BOOK off: every new route is a 404, the public pages too.
 *   - Staff (vendor_operator) get a 403 from every money route, and no
 *     money in the team list or the stock list.
 *   - A job's bill is made once: asking again gives the same number.
 *   - A Detlio customer's bill has no WhatsApp link and no phone.
 *   - A finished walk-in uses its stock once; a received order adds stock
 *     and one expense, however often it is tapped.
 *   - Decision 5: a phone that booked this garage on Detlio is sent to
 *     Detlio from the booking link, and nothing is written.
 *   - A payment QR that isn't a UPI QR is refused.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { payQrStorage } = await import('../../lib/garage-pay-qr-storage.js')
const { membersRepository } = await import('../members/members.repository.js')
const { reviewsRepository } = await import('../reviews/reviews.repository.js')
const { vendorsRepository } = await import('../vendors/vendors.repository.js')
const { garageBookRepository } = await import('./garage-book.repository.js')
const { teamRepository } = await import('./garage-book-team.repository.js')
const { expensesRepository } = await import('./garage-book-expenses.repository.js')
const { expensesService } = await import('./garage-book-expenses.service.js')
const { billsRepository } = await import('./garage-book-bills.repository.js')
const { linkRepository } = await import('./garage-book-link.repository.js')
const { stockRepository } = await import('./garage-book-stock.repository.js')
const { momentsService } = await import('./garage-book-moments.service.js')
const { stockService } = await import('./garage-book-stock.service.js')
const { garageBookRoutes, publicGarageBookRoutes } = await import('./garage-book.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000007310'
const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000007301',
  operator: 'e2e00000-0000-4000-8000-000000007302',
}
const SEATS = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' as const },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' as const },
]
const MEMBER = 'e2e00000-0000-4000-8000-000000007320'
const WALK_IN = 'e2e00000-0000-4000-8000-000000007330'
const BOOKING = 'e2e00000-0000-4000-8000-000000007340'
const CUSTOMER = 'e2e00000-0000-4000-8000-000000007350'
const SERVICE = 'e2e00000-0000-4000-8000-000000007360'
const ITEM = 'e2e00000-0000-4000-8000-000000007370'
const ORDER = 'e2e00000-0000-4000-8000-000000007380'
const DETLIO_PHONE = '9111122223'
const OWN_PHONE = '9840012345'

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const savedEnv = { garageBook: envValues.garageBook }
const NOW = new Date()

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../lib/__fixtures__/${name}`, import.meta.url)))

// What the stand-ins "stored".
let bills: Array<{ id: string; number: number; garageJobId: string | null; bookingId: string | null; token: string; snapshot: Record<string, unknown>; createdAt: Date }> = []
let counter = 0
let workers: string[] = []
let level = 0
let usedFor = new Set<string>()
let moves: Array<Record<string, unknown>> = []
let orderStatus: 'sent' | 'received' = 'sent'
let expenseInserts = 0
let linkJobs: Array<Record<string, unknown>> = []
let savedDetails: Record<string, unknown> | null = null
let qrBytes: Uint8Array | null = null

function walkInRow(status: 'booked' | 'done' = 'done') {
  return {
    id: WALK_IN,
    clientId: 'client-stage2-01',
    garageCustomerId: CUSTOMER,
    customerName: 'Suresh Kumar',
    customerPhone: OWN_PHONE,
    carId: null,
    plate: 'TN 09 AB 4521',
    make: 'Hyundai',
    model: 'Creta',
    scheduledAt: NOW,
    status,
    paymentMethod: 'upi' as const,
    totalPaise: 139_800,
    remindInDays: 30,
    doneAt: status === 'done' ? NOW : null,
    createdAt: NOW,
    lines: [{ serviceId: SERVICE, label: 'Foam wash', pricePaise: 139_800, qty: 2 }],
    visitNumber: 3,
    origin: 'walk_in' as const,
  }
}

const itemRow = () => ({
  id: ITEM,
  name: 'Foam shampoo',
  unit: 'ml' as const,
  level,
  lowAt: 1000,
  packSize: 5000,
  packPricePaise: 115_000,
  supplierId: 'e2e00000-0000-4000-8000-000000007390',
  supplierName: 'Sri Balaji Supplies',
  maxUse: 150,
  usedThisMonth: 0,
  jobsThisMonth: 0,
})

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) => SEATS.filter((s) => s.userId === userId))
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((s) => s.vendorId === vendorId && s.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async () => undefined)
  patch(membersRepository, 'findUserById', async () => undefined)
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  // Stage 1's repository, for walk-ins and the booking link's customers.
  const book = garageBookRepository as unknown as Patchable
  patch(book, 'transaction', async (work: (tx: unknown) => Promise<unknown>) => work({}))
  patch(book, 'lockClientId', async () => undefined)
  patch(book, 'lockPhone', async () => undefined)
  patch(book, 'jobByClientId', async () => null)
  patch(book, 'job', async () => walkInRow())
  patch(book, 'ownCustomer', async () => null)
  patch(book, 'ownCustomerByPhone', async () => null)
  patch(book, 'insertCustomer', async () => ({ id: CUSTOMER }))
  patch(book, 'cars', async () => new Map())
  patch(book, 'insertCar', async () => ({ id: 'e2e00000-0000-4000-8000-000000007351' }))
  patch(book, 'servicesById', async () => [{ id: SERVICE, name: 'Foam wash', price: '699.00' }])
  patch(book, 'insertJob', async (_tx: unknown, data: Record<string, unknown>) => {
    if (data.origin === 'link') linkJobs.push(data)
    return { id: WALK_IN }
  })
  patch(book, 'setOwed', async () => undefined)
  patch(book, 'balance', async () => 0)
  patch(book, 'reminderSettings', async () => null)
  patch(book, 'vendor', async () => ({ id: GARAGE, businessName: 'Sample Car Care', phone: '9840000000', whatsapp: null }))
  patch(book, 'priceList', async () => [{ id: SERVICE, name: 'Foam wash', price: '699.00', durationMins: 40, isAddon: false }])
  patch(book, 'takings', async () => ({ ownPaise: 1_000_000, detlioPaise: 500_000, upiPaise: 0, cashPaise: 0, paidBackPaise: 0 }))

  // The team.
  const team = teamRepository as unknown as Patchable
  patch(team, 'members', async () => [
    { id: MEMBER, name: 'Arun', role: 'Washer', phone: null, offOn: null, createdAt: NOW },
  ])
  patch(team, 'work', async () => new Map([[MEMBER, { jobs: 62, valuePaise: 3_840_000 }]]))
  patch(team, 'jobsBetween', async () => new Map([[MEMBER, 6]]))
  patch(team, 'onNow', async () => new Map([[MEMBER, { ref: `own:${WALK_IN}`, plate: 'TN 09 AB 4521', make: null, model: 'Creta', service: 'Interior clean' }]]))
  patch(team, 'pay', async () => new Map([[MEMBER, { advancePaise: 200_000, salaryPaise: 0 }]]))
  patch(team, 'ownJobExists', async (_v: string, id: string) => id === WALK_IN)
  patch(team, 'detlioBookingExists', async (_v: string, id: string) => id === BOOKING)
  patch(team, 'transaction', async (work: (tx: unknown) => Promise<unknown>) => work({}))
  patch(team, 'lockTarget', async () => undefined)
  patch(team, 'replaceWorkers', async (_tx: unknown, _v: string, _t: unknown, ids: string[]) => {
    workers = ids
  })
  patch(team, 'workersFor', async () => new Map())
  patch(expensesService, 'ensureRepeats', async () => undefined)
  patch(expensesService, 'spentIn', async () => null)

  // Bills and payment details.
  const billsRepo = billsRepository as unknown as Patchable
  patch(billsRepo, 'garage', async () => ({
    id: GARAGE,
    businessName: 'Sample Car Care',
    address: '12, 3rd Main Rd, Velachery',
    city: 'Chennai',
    pincode: '600042',
    phone: '9840000000',
    whatsapp: null,
  }))
  patch(billsRepo, 'transaction', async (work: (tx: unknown) => Promise<unknown>) => work({}))
  patch(billsRepo, 'lockJob', async () => undefined)
  patch(billsRepo, 'billFor', async (_tx: unknown, _v: string, target: { kind: string; id: string }) =>
    bills.find((bill) => (target.kind === 'own' ? bill.garageJobId : bill.bookingId) === target.id) ?? null
  )
  patch(billsRepo, 'billByToken', async (token: string) => {
    const bill = bills.find((row) => row.token === token)
    return bill ? { ...bill, vendorId: GARAGE } : null
  })
  patch(billsRepo, 'nextNumber', async () => ++counter)
  patch(billsRepo, 'insertBill', async (_tx: unknown, data: { number: number; garageJobId: string | null; bookingId: string | null; token: string; snapshot: Record<string, unknown> }) => {
    const row = { id: `e2e00000-0000-4000-8000-00000000${String(7400 + bills.length).padStart(4, '0')}`, ...data, createdAt: NOW }
    bills.push(row)
    return { ...row, vendorId: GARAGE }
  })
  patch(billsRepo, 'updateSnapshot', async () => undefined)
  patch(billsRepo, 'lastPaidMethod', async () => null)
  patch(billsRepo, 'bookingForBill', async () => ({
    id: BOOKING,
    userName: 'Rahul Verma',
    status: 'completed',
    scheduledAt: NOW,
    completedAt: NOW,
    amount: '520.00',
    paymentMethod: 'online',
    paymentStatus: 'pending',
    plate: 'TN 22 CK 1180',
    make: 'Maruti',
    model: 'Swift',
    washIntervalDays: 21,
    items: [{ label: 'Foam wash', amount: '520.00' }],
  }))
  patch(billsRepo, 'paymentDetails', async () => savedDetails)
  patch(billsRepo, 'savePaymentDetails', async (_v: string, data: Record<string, unknown>) => {
    savedDetails = { ...data, updatedAt: NOW }
  })
  patch(payQrStorage, 'readPayQr', async () => qrBytes)
  patch(payQrStorage, 'removePayQr', async () => undefined)
  patch(payQrStorage, 'payQrLink', () => 'https://files.example/pay-qr.png?signed')

  // The booking link.
  const link = linkRepository as unknown as Patchable
  patch(link, 'bySlug', async (slug: string) =>
    slug === 'sample-car-care'
      ? {
          vendorId: GARAGE,
          slug,
          active: true,
          businessName: 'Sample Car Care',
          city: 'Chennai',
          lat: null,
          lng: null,
          status: 'active',
          deletedAt: null,
          purgedAt: null,
        }
      : null
  )
  patch(link, 'services', async () => [
    { id: SERVICE, name: 'Foam wash', price: '499.00', durationMins: 40, isAddon: false, shown: true },
  ])
  patch(link, 'hours', async () =>
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '00:00:00', closeTime: '23:59:00', isClosed: false }))
  )
  patch(link, 'closures', async () => new Set())
  patch(link, 'bookedOnDetlio', async (_v: string, phone: string) => phone === DETLIO_PHONE)
  patch(link, 'bookingsByPhone', async () => 0)
  patch(reviewsRepository, 'ratingAggregates', async () => [])
  patch(reviewsRepository, 'tagCounts', async () => [])
  patch(vendorsRepository, 'listGoogleRatings', async () => [])

  // Stock.
  const stock = stockRepository as unknown as Patchable
  patch(stock, 'items', async () => [itemRow()])
  patch(stock, 'item', async () => itemRow())
  patch(stock, 'usage', async () => [{ serviceId: SERVICE, amount: 150 }])
  patch(stock, 'moves', async () => [])
  patch(stock, 'transaction', async (work: (tx: unknown) => Promise<unknown>) => work({}))
  patch(stock, 'usageForServices', async () => [{ itemId: ITEM, serviceId: SERVICE, amount: 150 }])
  patch(stock, 'lockItem', async () => level)
  patch(stock, 'insertMove', async (_tx: unknown, data: Record<string, unknown>) => {
    if (data.kind === 'used') {
      const key = `${data.itemId}:${data.garageJobId}`
      if (usedFor.has(key)) return false
      usedFor.add(key)
    }
    moves.push(data)
    return true
  })
  patch(stock, 'setLevel', async (_tx: unknown, _id: string, value: number) => {
    level = value
  })
  patch(stock, 'lockOrder', async () => undefined)
  patch(stock, 'order', async () => ({
    id: ORDER,
    supplierId: 'e2e00000-0000-4000-8000-000000007390',
    supplierName: 'Sri Balaji Supplies',
    supplierPhone: '9840055555',
    status: orderStatus,
    lines: [{ itemId: ITEM, name: 'Foam shampoo', packs: 2, packSize: 5000, unit: 'ml', packPricePaise: 115_000 }],
    totalPaise: 230_000,
    sentAt: NOW,
    receivedAt: orderStatus === 'received' ? NOW : null,
    expenseId: null,
  }))
  patch(stock, 'markReceived', async () => {
    orderStatus = 'received'
  })
  patch(expensesRepository, 'insert', async () => {
    expenseInserts += 1
    return { id: 'e2e00000-0000-4000-8000-000000007395' }
  })
  patch(momentsService, 'reminderPaidBack', async () => ({ amountPaise: 139_800 }))
})

beforeEach(() => {
  envValues.garageBook = true
  bills = []
  counter = 0
  workers = []
  level = 5000
  usedFor = new Set()
  moves = []
  orderStatus = 'sent'
  expenseInserts = 0
  linkJobs = []
  savedDetails = null
  qrBytes = null
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/vendors/me/book', garageBookRoutes)
app.route('/public', publicGarageBookRoutes)

type Who = keyof typeof PEOPLE | null

async function call(method: string, path: string, who: Who, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (who) {
    const token = await signAccessToken({ sub: PEOPLE[who], aud: 'vendor', isCustomer: false, isVendorOwner: true })
    headers.Cookie = `access_token=${token}`
  }
  const response = await app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  let json: { code?: string; data?: Record<string, any> } = {}
  try {
    json = JSON.parse(text)
  } catch {
    // Not JSON.
  }
  return { status: response.status, body: json, text }
}

const BOOK = '/vendors/me/book'

describe('the GARAGE_BOOK switch', () => {
  test('off: the new routes and the public pages are a 404 for everyone', async () => {
    envValues.garageBook = false
    for (const who of [null, 'owner', 'operator'] as const) {
      for (const [method, path] of [
        ['GET', `${BOOK}/team`],
        ['GET', `${BOOK}/expenses`],
        ['POST', `${BOOK}/bills`],
        ['GET', `${BOOK}/stock`],
        ['GET', `${BOOK}/link`],
        ['GET', `${BOOK}/milestones`],
      ] as const) {
        expect((await call(method, path, who, method === 'POST' ? { ref: `own:${WALK_IN}` } : undefined)).status).toBe(404)
      }
    }
    expect((await call('GET', '/public/g/sample-car-care', null)).status).toBe(404)
    expect((await call('GET', '/public/bills/abcdefghijklmnopqrstuvwx', null)).status).toBe(404)
  })
})

describe('staff see no money', () => {
  test('every money route is the owner’s alone', async () => {
    for (const [method, path, body] of [
      ['POST', `${BOOK}/team`, { name: 'Ravi' }],
      ['DELETE', `${BOOK}/team/${MEMBER}`, undefined],
      ['GET', `${BOOK}/expenses`, undefined],
      ['POST', `${BOOK}/expenses`, { category: 'rent', amountPaise: 800_000, spentOn: '2026-11-05' }],
      ['POST', `${BOOK}/bills`, { ref: `own:${WALK_IN}` }],
      ['GET', `${BOOK}/payment-details`, undefined],
      ['PUT', `${BOOK}/payment-details`, { showOnBills: false }],
      ['GET', `${BOOK}/link`, undefined],
      ['POST', `${BOOK}/import/commit`, { rows: [{ name: 'A' }] }],
      ['POST', `${BOOK}/stock`, { name: 'Wax', unit: 'g' }],
      ['PUT', `${BOOK}/stock/${ITEM}/usage`, []],
      ['GET', `${BOOK}/suppliers`, undefined],
      ['GET', `${BOOK}/supplies/suggest`, undefined],
      ['POST', `${BOOK}/supplies/orders/${ORDER}/received`, undefined],
      ['GET', `${BOOK}/milestones`, undefined],
    ] as const) {
      const res = await call(method, path, 'operator', body)
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(res.body.code).toBe('INSUFFICIENT_ROLE')
    }
    expect(expenseInserts).toBe(0)
    expect(bills).toHaveLength(0)
  })

  test('the team list: staff see jobs and who is on what, never what the work came to or was paid', async () => {
    const staff = await call('GET', `${BOOK}/team`, 'operator')
    expect(staff.status).toBe(200)
    const member = staff.body.data!.members[0]
    expect(member).toMatchObject({ name: 'Arun', jobs: 62, jobsToday: 6, onNow: { car: 'Creta', service: 'Interior clean' } })
    expect(member).not.toHaveProperty('valuePaise')
    expect(member).not.toHaveProperty('advancePaise')
    expect(staff.text).not.toContain('3840000')

    const owner = await call('GET', `${BOOK}/team`, 'owner')
    expect(owner.body.data!.members[0]).toMatchObject({ valuePaise: 3_840_000, advancePaise: 200_000 })
  })

  test('stock: staff see levels and the dial, never a price or the supplier; and may count', async () => {
    const staff = await call('GET', `${BOOK}/stock`, 'operator')
    const item = staff.body.data!.items[0]
    expect(item).toMatchObject({ name: 'Foam shampoo', level: 5000, share: 1, low: false })
    expect(item).not.toHaveProperty('packPricePaise')
    expect(item).not.toHaveProperty('supplier')
    const owner = await call('GET', `${BOOK}/stock`, 'owner')
    expect(owner.body.data!.items[0]).toMatchObject({ packPricePaise: 115_000, supplier: { name: 'Sri Balaji Supplies' } })

    const counted = await call('POST', `${BOOK}/stock/${ITEM}/count`, 'operator', { level: 600 })
    expect(counted.status).toBe(200)
    expect(level).toBe(600)
    expect(moves).toEqual([expect.objectContaining({ kind: 'counted', delta: -4400, levelAfter: 600 })])
  })
})

describe('who did it', () => {
  test('any seat says who was on a walk-in or a Detlio booking; another garage’s job is not found', async () => {
    const res = await call('PUT', `${BOOK}/jobs/own:${WALK_IN}/workers`, 'operator', { memberIds: [MEMBER] })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ ref: `own:${WALK_IN}`, workers: [{ id: MEMBER, name: 'Arun' }] })
    expect(workers).toEqual([MEMBER])

    expect((await call('PUT', `${BOOK}/jobs/${BOOKING}/workers`, 'owner', { memberIds: [] })).body.data!.ref).toBe(`detlio:${BOOKING}`)
    const elsewhere = 'e2e00000-0000-4000-8000-000000007999'
    expect((await call('PUT', `${BOOK}/jobs/own:${elsewhere}/workers`, 'owner', { memberIds: [MEMBER] })).status).toBe(404)
    expect((await call('PUT', `${BOOK}/jobs/own:${WALK_IN}/workers`, 'owner', { memberIds: [elsewhere] })).status).toBe(404)
  })
})

describe('bills', () => {
  test('a job’s bill is made once: asking again gives the same number, and the next job the next one', async () => {
    const first = await call('POST', `${BOOK}/bills`, 'owner', { ref: `own:${WALK_IN}` })
    expect(first.status).toBe(201)
    expect(first.body.data).toMatchObject({ number: 1, numberText: '0001', created: true, madeWith: 'Made with Detlio for Garages' })
    expect(first.body.data!.token).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(first.body.data!.whatsappUrl).toStartWith(`https://wa.me/91${OWN_PHONE}?text=`)
    expect(decodeURIComponent(first.body.data!.whatsappUrl)).toContain('Bill 0001 from Sample Car Care')
    // The garage's own customer's phone goes in the wa.me link only, never in the bill itself.
    expect(JSON.stringify(first.body.data!.snapshot)).not.toContain(OWN_PHONE)

    const again = await call('POST', `${BOOK}/bills`, 'owner', { ref: WALK_IN })
    expect(again.status).toBe(200)
    expect(again.body.data).toMatchObject({ number: 1, created: false, token: first.body.data!.token })
    expect(counter).toBe(1)

    const next = await call('POST', `${BOOK}/bills`, 'owner', { ref: `detlio:${BOOKING}` })
    expect(next.body.data!.number).toBe(2)
  })

  test('a Detlio customer’s bill has a share link only: no wa.me, no phone', async () => {
    const res = await call('POST', `${BOOK}/bills`, 'owner', { ref: `detlio:${BOOKING}` })
    expect(res.status).toBe(201)
    expect(res.body.data!.whatsappUrl).toBeNull()
    expect(res.body.data!.shareUrl).toMatch(/\/b\/[A-Za-z0-9_-]{24}$/)
    expect(res.body.data!.snapshot.customer).toEqual({ firstName: 'Rahul', plate: 'TN 22 CK 1180', car: 'Maruti Swift' })
    expect(res.text).not.toContain(DETLIO_PHONE)
  })

  test('the public bill page shows the garage’s UPI details while unpaid, if it says so', async () => {
    savedDetails = {
      qrKey: `vendors/${GARAGE}/pay-qr/11111111-1111-4111-8111-111111111111.png`,
      upiId: 'samplecarcare@okaxis',
      upiName: 'Sample Car Care',
      phone: null,
      apps: ['gpay', 'phonepe'],
      showOnBills: true,
      showOnReminders: true,
      showOnBookingPage: true,
    }
    const made = await call('POST', `${BOOK}/bills`, 'owner', { ref: `detlio:${BOOKING}` })
    const page = await call('GET', `/public/bills/${made.body.data!.token}`, null)
    expect(page.status).toBe(200)
    expect(page.body.data).toMatchObject({
      numberText: '0001',
      paid: false,
      madeWith: 'Made with Detlio for Garages',
      pay: { upiId: 'samplecarcare@okaxis', phone: '9840000000', appsText: 'GPay/PhonePe', qrUrl: 'https://files.example/pay-qr.png?signed' },
    })
    expect(page.text).not.toContain(DETLIO_PHONE)
    expect((await call('GET', '/public/bills/nobodysbillnobodysbill00', null)).status).toBe(404)
  })
})

describe('stock that goes down by itself', () => {
  test('a walk-in saved as done uses its stock once: 2 foam washes take 300 ml, and a retry takes nothing', async () => {
    const job = {
      clientId: 'client-stage2-01',
      customer: { name: 'Suresh Kumar', phone: OWN_PHONE },
      lines: [{ serviceId: SERVICE, qty: 2 }],
      scheduledAt: NOW.toISOString(),
      status: 'done',
      payment: 'upi',
    }
    const res = await call('POST', `${BOOK}/jobs`, 'owner', job)
    expect(res.status).toBe(201)
    expect(level).toBe(4700)
    expect(moves).toEqual([expect.objectContaining({ kind: 'used', delta: -300, levelAfter: 4700, garageJobId: WALK_IN })])
    // Moment 5, to the owner: this customer came back after a reminder.
    expect(res.body.data!.reminderPaidBack).toEqual({ amountPaise: 139_800 })

    await call('POST', `${BOOK}/jobs`, 'owner', { ...job, clientId: 'client-stage2-02' })
    expect(level).toBe(4700)
    expect(moves).toHaveLength(1)

    // Staff hear nothing about money.
    const staff = await call('POST', `${BOOK}/jobs`, 'operator', { ...job, clientId: 'client-stage2-03' })
    expect(staff.body.data).not.toHaveProperty('reminderPaidBack')
  })

  test('a completed Detlio booking uses its stock in the background, once; nothing while the book is off', async () => {
    patch(stockRepository, 'bookingServices', async () => [{ serviceId: SERVICE, qty: 1 }])
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
    stockService.afterDetlioCompletion(GARAGE, BOOKING)
    await settle()
    expect(level).toBe(4850)
    expect(moves).toEqual([expect.objectContaining({ kind: 'used', bookingId: BOOKING, createdBy: null })])

    envValues.garageBook = false
    stockService.afterDetlioCompletion(GARAGE, BOOKING)
    await settle()
    expect(moves).toHaveLength(1)
  })

  test('a received order adds its packs and one expense, however often it is tapped', async () => {
    level = 600
    const first = await call('POST', `${BOOK}/supplies/orders/${ORDER}/received`, 'owner')
    expect(first.status).toBe(200)
    expect(first.body.data).toMatchObject({ added: true, order: { status: 'received' } })
    expect(level).toBe(10_600)
    expect(expenseInserts).toBe(1)

    const again = await call('POST', `${BOOK}/supplies/orders/${ORDER}/received`, 'owner')
    expect(again.body.data!.added).toBe(false)
    expect(level).toBe(10_600)
    expect(expenseInserts).toBe(1)
  })
})

describe('the booking link (decision 5)', () => {
  async function firstTime() {
    const page = await call('GET', '/public/g/sample-car-care', null)
    expect(page.status).toBe(200)
    return page.body.data!.days[0].times[0] as string
  }

  test('a phone that booked this garage on Detlio is sent to Detlio, and nothing is written', async () => {
    const at = await firstTime()
    const res = await call('POST', '/public/g/sample-car-care/book', null, { serviceId: SERVICE, at, name: 'Rahul', phone: DETLIO_PHONE })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ detlio: true, url: expect.stringMatching(new RegExp(`/garage/${GARAGE}$`)) })
    expect(linkJobs).toHaveLength(0)
  })

  test('anyone else books a walk-in marked as from the link, paid at the garage', async () => {
    const at = await firstTime()
    const res = await call('POST', '/public/g/sample-car-care/book', null, { serviceId: SERVICE, at, name: 'Priya', phone: '98400 22222' })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ detlio: false, booked: { garage: 'Sample Car Care', service: 'Foam wash', at } })
    expect(linkJobs).toEqual([expect.objectContaining({ origin: 'link', status: 'booked', totalPaise: 49_900 })])
  })

  test('Google rating for new garages: the page carries Google’s while it is the main one, never past 30 days', async () => {
    // No counted Detlio review (ratingAggregates stands in []): Google's leads.
    const reads: Array<{ vendorIds: string[]; heldSince: Date }> = []
    let fetchedAt = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000)
    patch(vendorsRepository, 'listGoogleRatings', async (vendorIds: string[], heldSince: Date) => {
      reads.push({ vendorIds, heldSince })
      return [{ vendorId: GARAGE, googleRating: '4.6', googleReviewCount: 312, googleFetchedAt: fetchedAt }]
    })
    const before = Date.now()
    const page = await call('GET', '/public/g/sample-car-care', null)
    const after = Date.now()
    expect(page.status).toBe(200)
    expect(page.body.data!.garage).toMatchObject({ rating: null, reviewCount: 0, google: { rating: 4.6, reviewCount: 312 } })
    // One read of the garage's lead, filtered to Google's 30 days.
    expect(reads).toHaveLength(1)
    expect(reads[0]!.vendorIds).toEqual([GARAGE])
    const DAYS_30 = 30 * 24 * 60 * 60 * 1000
    expect(reads[0]!.heldSince.getTime()).toBeGreaterThanOrEqual(before - DAYS_30)
    expect(reads[0]!.heldSince.getTime()).toBeLessThanOrEqual(after - DAYS_30)

    // A read 30 days old is never sent, even if the SQL let it through.
    fetchedAt = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    expect((await call('GET', '/public/g/sample-car-care', null)).body.data!.garage.google).toBeNull()
    patch(vendorsRepository, 'listGoogleRatings', async () => [])
  })

  test('a time the page didn’t offer, an unknown page, or a landline is refused', async () => {
    const odd = new Date(NOW.getTime() + 37 * 60_000).toISOString()
    expect((await call('POST', '/public/g/sample-car-care/book', null, { serviceId: SERVICE, at: odd, name: 'P', phone: '9840022222' })).body.code).toBe('TIME_NOT_OPEN')
    expect((await call('GET', '/public/g/nobody-here', null)).status).toBe(404)
    const at = await firstTime()
    expect((await call('POST', '/public/g/sample-car-care/book', null, { serviceId: SERVICE, at, name: 'P', phone: '0442345678' })).body.code).toBe('INVALID_PHONE')
    expect(linkJobs).toHaveLength(0)
  })
})

describe('payment details', () => {
  const key = `vendors/${GARAGE}/pay-qr/22222222-2222-4222-8222-222222222222.png`

  test('a UPI QR is read so the owner can check the name', async () => {
    qrBytes = fixture('upi-qr.png')
    const res = await call('PUT', `${BOOK}/payment-details`, 'owner', { qrKey: key, apps: ['phonepe', 'gpay'] })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      upiId: 'samplecarcare@okaxis',
      upiName: 'Sample Car Care',
      qrRead: 'read',
      phone: '9840000000',
      phoneIsGarage: true,
      apps: ['gpay', 'phonepe'],
    })
  })

  test('a QR that isn’t a UPI QR is refused, and nothing is saved', async () => {
    qrBytes = fixture('website-qr.png')
    const res = await call('PUT', `${BOOK}/payment-details`, 'owner', { qrKey: key })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('QR_NOT_UPI')
    expect(savedDetails).toBeNull()
  })

  test('a picture with no readable QR is kept, with no UPI id, so the owner is asked to check it', async () => {
    qrBytes = fixture('blank.png')
    const res = await call('PUT', `${BOOK}/payment-details`, 'owner', { qrKey: key })
    expect(res.body.data).toMatchObject({ upiId: null, qrRead: 'unreadable' })
  })

  test('another garage’s key is refused', async () => {
    const res = await call('PUT', `${BOOK}/payment-details`, 'owner', {
      qrKey: 'vendors/e2e00000-0000-4000-8000-000000009999/pay-qr/22222222-2222-4222-8222-222222222222.png',
    })
    expect(res.body.code).toBe('INVALID_QR_KEY')
  })
})
