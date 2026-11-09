/**
 * Garage Book (0069) through the real routes and the real auth and tenant
 * middleware. Only the database is stood in for (the seat lookups and the
 * book's repository, put back afterwards).
 *
 * What it holds the module to:
 *   - GARAGE_BOOK off: every route is a 404, before auth.
 *   - Staff (vendor_operator) get no money: no totals, no Detlio amounts,
 *     and Money owed, Stats and the Excel are refused.
 *   - A resend of a walk-in saved offline (same clientId) writes nothing
 *     new and answers with the job already written.
 *   - A Detlio customer's phone is never in any answer.
 *   - A Detlio push reminder goes at most once per customer every 7 days.
 *   - Admin's read-only view is logged before it is read.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { pushService } = await import('../push/push.service.js')
const { garageBookRepository } = await import('./garage-book.repository.js')
const { garageBookRoutes, adminGarageBookRoutes } = await import('./garage-book.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000006910'
const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000006901',
  operator: 'e2e00000-0000-4000-8000-000000006902',
  superAdmin: 'e2e00000-0000-4000-8000-000000006905',
}
const SEATS = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' as const },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' as const },
]
const OWN_CUSTOMER = 'e2e00000-0000-4000-8000-000000006920'
const DETLIO_USER = 'e2e00000-0000-4000-8000-000000006930'
const DETLIO_PHONE = '9111122223'
const SERVICE = 'e2e00000-0000-4000-8000-000000006940'

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const savedEnv = { garageBook: envValues.garageBook, expoPushAccessToken: envValues.expoPushAccessToken }

const NOW = new Date()

/** The walk-ins "stored", by clientId. */
const jobs = new Map<string, ReturnType<typeof jobRow>>()
let inserted = 0
let lastPush: Date | null = null
let pushes: Array<{ userId: string; title: string; body: string }> = []
let sends: Array<Record<string, unknown>> = []
let adminLogs: Array<Record<string, unknown>> = []

function jobRow(id: string, clientId: string, totalPaise: number) {
  return {
    id,
    clientId,
    garageCustomerId: OWN_CUSTOMER,
    customerName: 'Suresh Kumar',
    customerPhone: '9840012345',
    carId: null,
    plate: 'TN 09 AB 4521',
    make: 'Hyundai',
    model: 'Creta',
    scheduledAt: NOW,
    status: 'booked' as const,
    paymentMethod: 'upi' as const,
    totalPaise,
    remindInDays: 30,
    doneAt: null,
    createdAt: NOW,
    lines: [{ serviceId: SERVICE, label: 'Foam wash', pricePaise: totalPaise, qty: 1 }],
    visitNumber: 3,
  }
}

const detlioBooking = {
  id: 'e2e00000-0000-4000-8000-000000006950',
  userId: DETLIO_USER,
  userName: 'Rahul Verma',
  status: 'confirmed',
  bookingType: 'dropin',
  scheduledAt: NOW,
  durationMins: 40,
  amount: '520.00',
  paymentMethod: 'online',
  completedAt: null,
  make: 'Maruti',
  model: 'Swift',
  plate: 'TN 22 CK 1180',
  items: ['Foam wash'],
}

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) => SEATS.filter((s) => s.userId === userId))
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((s) => s.vendorId === vendorId && s.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' } : undefined
  )
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  const repo = garageBookRepository as unknown as Patchable
  patch(repo, 'transaction', async (work: (tx: unknown) => Promise<unknown>) => work({}))
  patch(repo, 'lockClientId', async () => undefined)
  patch(repo, 'lockCustomer', async () => undefined)
  patch(repo, 'lockPush', async () => undefined)
  patch(repo, 'lockJob', async () => undefined)
  patch(repo, 'lockPhone', async () => undefined)
  patch(repo, 'updateJob', async () => undefined)
  patch(repo, 'replaceLines', async () => undefined)
  patch(repo, 'vendor', async () => ({ id: GARAGE, businessName: 'Sample Car Care', phone: '9840000000', whatsapp: null }))
  patch(repo, 'jobsBetween', async () => [jobRow('e2e00000-0000-4000-8000-000000006960', 'client-today-1', 49_900)])
  patch(repo, 'detlioJobsBetween', async () => [detlioBooking])
  patch(repo, 'takings', async () => ({ ownPaise: 49_900, detlioPaise: 52_000, upiPaise: 49_900, cashPaise: 0, paidBackPaise: 0 }))
  patch(repo, 'jobByClientId', async (_v: string, clientId: string) => jobs.get(clientId) ?? null)
  patch(repo, 'job', async (_v: string, jobId: string) => [...jobs.values()].find((job) => job.id === jobId) ?? null)
  patch(repo, 'ownCustomer', async (_v: string, id: string) =>
    id === OWN_CUSTOMER ? { id, vendorId: GARAGE, name: 'Suresh Kumar', phone: '9840012345', note: null, createdAt: NOW, deletedAt: null } : null
  )
  patch(repo, 'ownCustomerByPhone', async () => null)
  patch(repo, 'insertCustomer', async () => ({ id: OWN_CUSTOMER, name: 'Suresh Kumar' }))
  patch(repo, 'cars', async () => new Map())
  patch(repo, 'insertCar', async () => ({ id: 'e2e00000-0000-4000-8000-000000006970' }))
  patch(repo, 'servicesById', async () => [{ id: SERVICE, name: 'Foam wash', price: '499.00' }])
  patch(repo, 'insertJob', async (_tx: unknown, data: { clientId: string; totalPaise: number }) => {
    inserted += 1
    const row = jobRow(`e2e00000-0000-4000-8000-00000000${String(7000 + inserted).padStart(4, '0')}`, data.clientId, data.totalPaise)
    jobs.set(data.clientId, row)
    return { id: row.id }
  })
  patch(repo, 'setOwed', async () => undefined)
  patch(repo, 'priceList', async () => [
    { id: SERVICE, name: 'Foam wash', price: '499.00', durationMins: 40, isAddon: false },
  ])
  patch(repo, 'reminderSettings', async () => null)
  patch(repo, 'ownCustomers', async () => [
    {
      id: OWN_CUSTOMER,
      name: 'Suresh Kumar',
      phone: '9840012345',
      note: null,
      createdAt: NOW,
      cars: [],
      visits: 7,
      spentPaise: 894_000,
      owesPaise: 0,
      lastVisitAt: new Date(NOW.getTime() - 31 * 86_400_000),
      lastRemindIn: 30,
      lastCarIntervalDays: null,
      remindedAt: null,
    },
  ])
  // As if a read had leaked the number: the service must still never send it.
  patch(repo, 'detlioCustomers', async () => [
    {
      userId: DETLIO_USER,
      name: 'Rahul Verma',
      phone: DETLIO_PHONE,
      firstAt: NOW,
      cars: [{ id: 'e2e00000-0000-4000-8000-000000006980', plate: 'TN 22 CK 1180', make: 'Maruti', model: 'Swift', washIntervalDays: 21 }],
      visits: 2,
      spentPaise: 104_000,
      lastVisitAt: new Date(NOW.getTime() - 22 * 86_400_000),
      remindedAt: null,
    },
  ])
  patch(repo, 'detlioCustomerExists', async (_v: string, userId: string) => userId === DETLIO_USER)
  patch(repo, 'detlioJobsForUser', async () => [{ ...detlioBooking, status: 'completed', completedAt: new Date(NOW.getTime() - 22 * 86_400_000) }])
  patch(repo, 'detlioNote', async () => null)
  patch(repo, 'setDetlioNote', async () => undefined)
  patch(repo, 'lastPushTo', async () => lastPush)
  patch(repo, 'logSend', async (data: Record<string, unknown>) => {
    sends.push(data)
    return { sentAt: NOW }
  })
  patch(repo, 'owed', async () => [])
  patch(repo, 'recentPaid', async () => [])
  patch(repo, 'visitors', async () => [])
  patch(repo, 'jobsByWeekday', async () => [0, 0, 0, 0, 0, 0, 0])
  patch(repo, 'jobsForCustomer', async () => [])
  patch(repo, 'balance', async () => 0)
  patch(repo, 'lastWhatsAppTo', async () => null)
  patch(repo, 'exportRows', async () => ({ customers: [], cars: [], jobs: [], payments: [] }))
  patch(repo, 'logAdminAccess', async (data: Record<string, unknown>) => {
    adminLogs.push(data)
  })
  patch(pushService, 'notifyCustomer', (userId: string, message: { title: string; body: string }) => {
    pushes.push({ userId, title: message.title, body: message.body })
  })
})

beforeEach(() => {
  envValues.garageBook = true
  envValues.expoPushAccessToken = 'test-access-token'
  jobs.clear()
  inserted = 0
  lastPush = null
  pushes = []
  sends = []
  adminLogs = []
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
app.route('/admin', adminGarageBookRoutes)

type Who = keyof typeof PEOPLE | null

async function call(method: string, path: string, who: Who, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (who) {
    const token = await signAccessToken({ sub: PEOPLE[who], aud: 'vendor', isCustomer: false, isVendorOwner: true })
    headers.Cookie = `access_token=${token}`
  }
  const response = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json: { code?: string; data?: Record<string, unknown> } = {}
  try {
    json = JSON.parse(text)
  } catch {
    // The Excel download is not JSON.
  }
  return { status: response.status, body: json, text, headers: response.headers }
}

const walkIn = (clientId: string) => ({
  clientId,
  customer: { name: 'Suresh Kumar', phone: '98400 12345', plate: 'tn09ab4521', make: 'Hyundai', model: 'Creta' },
  lines: [{ serviceId: SERVICE }],
  scheduledAt: NOW.toISOString(),
  payment: 'upi',
  remindInDays: 30,
})

describe('the GARAGE_BOOK switch', () => {
  test('off: every route is a 404 for everyone, signed in or not', async () => {
    envValues.garageBook = false
    for (const who of [null, 'owner', 'operator'] as const) {
      for (const [method, path] of [
        ['GET', '/vendors/me/book/today'],
        ['GET', '/vendors/me/book/customers'],
        ['POST', '/vendors/me/book/jobs'],
        ['GET', '/vendors/me/book/owed'],
        ['GET', '/vendors/me/book/stats'],
      ] as const) {
        const { status, body } = await call(method, path, who, method === 'POST' ? walkIn('client-off-001') : undefined)
        expect(status).toBe(404)
        expect(body.code).toBe('NOT_FOUND')
      }
    }
    expect((await call('GET', `/admin/vendors/${GARAGE}/book`, 'superAdmin')).status).toBe(404)
    expect(inserted).toBe(0)
  })

  test('on: signed out is refused', async () => {
    expect((await call('GET', '/vendors/me/book/today', null)).status).toBe(401)
  })
})

describe('staff see no money', () => {
  test("Today: the owner gets totals and the Detlio amount; staff get neither", async () => {
    const owner = await call('GET', '/vendors/me/book/today', 'owner')
    expect(owner.status).toBe(200)
    const ownerJobs = owner.body.data!.jobs as Array<Record<string, unknown>>
    expect(ownerJobs.find((job) => job.source === 'own')!.totalPaise).toBe(49_900)
    expect(ownerJobs.find((job) => job.source === 'detlio')!.amount).toBe('520.00')
    expect(owner.body.data!.taken).toMatchObject({ totalPaise: 101_900 })

    const staff = await call('GET', '/vendors/me/book/today', 'operator')
    expect(staff.status).toBe(200)
    const staffJobs = staff.body.data!.jobs as Array<Record<string, unknown>>
    expect(staffJobs).toHaveLength(2)
    for (const job of staffJobs) {
      expect(job).not.toHaveProperty('totalPaise')
      expect(job).not.toHaveProperty('amount')
      for (const line of job.lines as Array<Record<string, unknown>>) expect(line).not.toHaveProperty('pricePaise')
    }
    expect(staff.body.data).not.toHaveProperty('taken')
    expect(staff.body.data).not.toHaveProperty('closing')
    expect(staff.text).not.toContain('49900')
    expect(staff.text).not.toContain('520.00')
  })

  test('Customers: staff get no spent or owes', async () => {
    const staff = await call('GET', '/vendors/me/book/customers', 'operator')
    for (const row of staff.body.data!.customers as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty('spentPaise')
      expect(row).not.toHaveProperty('owesPaise')
    }
    const owner = await call('GET', '/vendors/me/book/customers', 'owner')
    const own = (owner.body.data!.customers as Array<Record<string, unknown>>).find((row) => row.source === 'own')!
    expect(own.spentPaise).toBe(894_000)
  })

  test('Money owed, Stats and the Excel download are refused to staff, open to the owner', async () => {
    for (const path of ['/vendors/me/book/owed', '/vendors/me/book/stats', '/vendors/me/book/export.xlsx']) {
      const staff = await call('GET', path, 'operator')
      expect(staff.status).toBe(403)
      expect(staff.body.code).toBe('INSUFFICIENT_ROLE')
      expect((await call('GET', path, 'owner')).status).toBe(200)
    }
    const paid = await call('POST', `/vendors/me/book/owed/own:${OWN_CUSTOMER}/paid`, 'operator', { amountPaise: 10_000, method: 'cash' })
    expect(paid.status).toBe(403)
  })

  test('the price list a walk-in picks from is open to staff: public prices, no takings', async () => {
    const staff = await call('GET', '/vendors/me/book/services', 'operator')
    expect(staff.status).toBe(200)
    expect(staff.body.data as unknown).toEqual([{ id: SERVICE, name: 'Foam wash', pricePaise: 49_900, durationMins: 40, isAddon: false }])
  })

  test('the walk-in a member saves comes back without its total for staff', async () => {
    const staff = await call('POST', '/vendors/me/book/jobs', 'operator', walkIn('client-staff-0001'))
    expect(staff.status).toBe(201)
    expect(staff.body.data).not.toHaveProperty('totalPaise')
  })

  test('the Excel is a real .xlsx download', async () => {
    const owner = await call('GET', '/vendors/me/book/export.xlsx', 'owner')
    expect(owner.headers.get('content-type')).toContain('spreadsheetml')
    expect(owner.headers.get('content-disposition')).toContain('sample-car-care-book-')
    expect(owner.text.startsWith('PK')).toBe(true)
  })
})

describe('a walk-in saved offline and sent again', () => {
  test('the same clientId writes once; the resend answers 200 with the first job', async () => {
    const first = await call('POST', '/vendors/me/book/jobs', 'owner', walkIn('client-offline-01'))
    expect(first.status).toBe(201)
    expect(first.body.data!.created).toBe(true)
    expect(first.body.data!.totalPaise).toBe(49_900)

    const again = await call('POST', '/vendors/me/book/jobs', 'owner', walkIn('client-offline-01'))
    expect(again.status).toBe(200)
    expect(again.body.data!.created).toBe(false)
    expect(again.body.data!.id).toBe(first.body.data!.id)
    expect(inserted).toBe(1)

    const other = await call('POST', '/vendors/me/book/jobs', 'owner', walkIn('client-offline-02'))
    expect(other.status).toBe(201)
    expect(inserted).toBe(2)
  })

  test('a clientId that is too short is refused before anything is written', async () => {
    const { status } = await call('POST', '/vendors/me/book/jobs', 'owner', walkIn('short'))
    expect(status).toBe(400)
    expect(inserted).toBe(0)
  })

  test('a walk-in is never for a Detlio customer', async () => {
    const { status } = await call('POST', '/vendors/me/book/jobs', 'owner', {
      ...walkIn('client-detlio-01'),
      customer: { id: `detlio:${DETLIO_USER}` },
    })
    expect(status).toBe(404)
    expect(inserted).toBe(0)
  })
})

describe('editing a walk-in', () => {
  test("a finished job's payment and services can't change: its money is settled", async () => {
    await call('POST', '/vendors/me/book/jobs', 'owner', walkIn('client-settled-1'))
    const job = jobs.get('client-settled-1')!
    jobs.set('client-settled-1', { ...job, status: 'done' as never, doneAt: NOW as never, paymentMethod: 'later' as never })
    const pay = await call('PATCH', `/vendors/me/book/jobs/${job.id}`, 'owner', { payment: 'upi' })
    expect(pay.status).toBe(400)
    expect(pay.body.code).toBe('JOB_SETTLED')
    const lines = await call('PATCH', `/vendors/me/book/jobs/${job.id}`, 'operator', { lines: [{ serviceId: SERVICE }] })
    expect(lines.body.code).toBe('JOB_SETTLED')
    const back = await call('PATCH', `/vendors/me/book/jobs/${job.id}`, 'owner', { status: 'booked' })
    expect(back.body.code).toBe('INVALID_JOB_STATUS')
  })

  test('an impossible date is a 400, not a crash', async () => {
    expect((await call('GET', '/vendors/me/book/today?date=2026-02-31', 'owner')).status).toBe(400)
  })
})

describe("a Detlio customer's phone", () => {
  test('is never in the customer list, one customer, or the reminders, for any seat', async () => {
    for (const who of ['owner', 'operator'] as const) {
      const list = await call('GET', '/vendors/me/book/customers', who)
      const detlio = (list.body.data!.customers as Array<Record<string, unknown>>).find((row) => row.source === 'detlio')!
      expect(detlio.viaDetlio).toBe(true)
      expect(detlio.phone).toBeNull()
      expect(list.text).not.toContain(DETLIO_PHONE)

      const one = await call('GET', `/vendors/me/book/customers/detlio:${DETLIO_USER}`, who)
      expect(one.status).toBe(200)
      expect(one.body.data!.phone).toBeNull()
      expect(one.text).not.toContain(DETLIO_PHONE)

      const reminders = await call('GET', '/vendors/me/book/reminders', who)
      expect(reminders.text).not.toContain(DETLIO_PHONE)
    }
  })

  test('only a note can be kept on a Detlio customer', async () => {
    const renamed = await call('PATCH', `/vendors/me/book/customers/detlio:${DETLIO_USER}`, 'owner', { name: 'Someone' })
    expect(renamed.status).toBe(400)
    expect(renamed.body.code).toBe('DETLIO_NOTE_ONLY')
    const noted = await call('PATCH', `/vendors/me/book/customers/detlio:${DETLIO_USER}`, 'owner', { note: 'Likes tyre shine' })
    expect(noted.status).toBe(200)
  })

  test('a Detlio user who never booked this garage is not found', async () => {
    const other = 'e2e00000-0000-4000-8000-000000006999'
    expect((await call('POST', `/vendors/me/book/reminders/detlio:${other}/send`, 'owner')).status).toBe(404)
  })
})

describe('reminders', () => {
  test("an own customer's reminder is a wa.me link with the message filled in, and it is logged", async () => {
    const { status, body } = await call('POST', `/vendors/me/book/reminders/own:${OWN_CUSTOMER}/send`, 'operator')
    expect(status).toBe(200)
    expect(body.data!.channel).toBe('whatsapp')
    expect(String(body.data!.url)).toStartWith('https://wa.me/919840012345?text=')
    expect(decodeURIComponent(String(body.data!.url))).toContain('Hi Suresh')
    expect(sends).toEqual([expect.objectContaining({ channel: 'whatsapp', garageCustomerId: OWN_CUSTOMER })])
    expect(pushes).toHaveLength(0)
  })

  test('a Detlio push goes, then not again within 7 days, then again after', async () => {
    const first = await call('POST', `/vendors/me/book/reminders/detlio:${DETLIO_USER}/send`, 'owner')
    expect(first.status).toBe(200)
    expect(first.body.data).toEqual({ channel: 'detlio_push', sentAt: NOW.toISOString() })
    expect(pushes).toEqual([expect.objectContaining({ userId: DETLIO_USER, title: 'Sample Car Care' })])
    expect(first.text).not.toContain(DETLIO_PHONE)

    lastPush = new Date(Date.now() - 3 * 86_400_000)
    const soon = await call('POST', `/vendors/me/book/reminders/detlio:${DETLIO_USER}/send`, 'operator')
    expect(soon.status).toBe(429)
    expect(soon.body.code).toBe('REMINDER_TOO_SOON')
    expect(pushes).toHaveLength(1)

    lastPush = new Date(Date.now() - 6.9 * 86_400_000)
    expect((await call('POST', `/vendors/me/book/reminders/detlio:${DETLIO_USER}/send`, 'owner')).status).toBe(429)

    lastPush = new Date(Date.now() - 7.1 * 86_400_000)
    expect((await call('POST', `/vendors/me/book/reminders/detlio:${DETLIO_USER}/send`, 'owner')).status).toBe(200)
    expect(pushes).toHaveLength(2)
  })

  test("the push carries Detlio's fixed words, never the garage's typed message", async () => {
    await call('POST', `/vendors/me/book/reminders/detlio:${DETLIO_USER}/send`, 'owner')
    expect(pushes[0]!.body).toBe('Your car may be due for a wash. Book your next one in the Detlio app.')
  })

  test('with notifications off, a Detlio reminder is refused and nothing is logged', async () => {
    envValues.expoPushAccessToken = undefined
    const saved = { vapidPublicKey: envValues.vapidPublicKey, pushFake: envValues.pushFake }
    envValues.vapidPublicKey = undefined
    envValues.pushFake = false
    const { status, body } = await call('POST', `/vendors/me/book/reminders/detlio:${DETLIO_USER}/send`, 'owner')
    Object.assign(envValues, saved)
    expect(status).toBe(409)
    expect(body.code).toBe('PUSH_OFF')
    expect(sends).toHaveLength(0)
  })

  test('a message with a link is refused', async () => {
    const { status, body } = await call('PUT', '/vendors/me/book/reminders/message', 'owner', {
      message: 'Book at www.example.com',
    })
    expect(status).toBe(400)
    expect(body.code).toBe('INVALID_MESSAGE')
  })
})

describe("admin's read-only view", () => {
  test('logs the look first, and is for super admins only', async () => {
    const { status, body } = await call('GET', `/admin/vendors/${GARAGE}/book`, 'superAdmin')
    expect(status).toBe(200)
    expect(body.data!.vendor).toEqual({ id: GARAGE, name: 'Sample Car Care' })
    expect(adminLogs).toEqual([expect.objectContaining({ userId: PEOPLE.superAdmin, vendorId: GARAGE })])
    expect((await call('GET', `/admin/vendors/${GARAGE}/book`, 'owner')).status).toBe(403)
  })
})
