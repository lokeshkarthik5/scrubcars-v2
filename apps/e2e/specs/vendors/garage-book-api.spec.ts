/**
 * Garage Book (0072) against the real database: the server's unit tests try
 * every rule with the repository patched out, so this is where the SQL
 * itself (0072_garage_book and garage-book.repository.ts) is proved.
 *
 * GARAGE_BOOK=on for the E2E API (.env.e2e). The portal's own switch
 * (NEXT_PUBLIC_GARAGE_BOOK) stays off in the E2E build, so every other
 * garage spec still sees today's screens; these tests use the API only.
 *
 * VENDORS.main, as STAFF.owner and STAFF.operator. Garage Book's tables are
 * its own, so nothing here changes what another spec reads. Every name,
 * phone and clientId carries this run's stamp, so a retry never meets the
 * first try's rows, and lists are filtered to the garage's own customers
 * found by that name.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { STAFF, VENDORS } from '../../support/seed-ids'

const BOOK = '/api/v1/vendors/me/book'
const AT_MAIN = { 'x-vendor-id': VENDORS.main.id }
const AT_NARROW = { 'x-vendor-id': VENDORS.narrow.id }

/** A stamp for this try: letters and digits, so it fits a clientId and a name. */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
/** A 10-digit Indian mobile number no seeded user has. */
const phoneFor = (s: string) => `98${String(parseInt(s, 36) % 1e8).padStart(8, '0')}`

let owner: APIRequestContext
let operator: APIRequestContext

test.beforeAll(async () => {
  owner = await loginViaApi(STAFF.owner.phone, 'vendor')
  operator = await loginViaApi(STAFF.operator.phone, 'vendor')
})

test.afterAll(async () => {
  await owner?.dispose()
  await operator?.dispose()
})

async function data<T = any>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true)
  return (await res.json()).data as T
}

/** The price list a walk-in picks from: MAIN's first plain (non add-on) service. */
async function firstService(ctx: APIRequestContext) {
  const list = await data<Array<{ id: string; name: string; pricePaise: number; isAddon: boolean }>>(
    await ctx.get(`${BOOK}/services`, { headers: AT_MAIN })
  )
  const service = list.find((s) => !s.isAddon)
  expect(service, 'MAIN has a service on its price list').toBeTruthy()
  return service!
}

/** Saves a finished walk-in, paid later, for a new customer of the garage's own. */
async function walkIn(ctx: APIRequestContext, s: string, extra: Record<string, unknown> = {}) {
  const service = await firstService(ctx)
  const body = {
    clientId: `e2e-gb-${s}`,
    customer: {
      name: `Walk-in Wasim ${s}`,
      phone: phoneFor(s),
      plate: 'TN 09 AB 1234',
      make: 'Maruti',
      model: 'Swift',
    },
    lines: [{ serviceId: service.id }, { label: 'Tyre polish', pricePaise: 15_000 }],
    scheduledAt: new Date().toISOString(),
    status: 'done',
    payment: 'later',
    remindInDays: 21,
    ...extra,
  }
  const res = await ctx.post(`${BOOK}/jobs`, { data: body, headers: AT_MAIN })
  return { res, body, service }
}

test.describe('Garage Book on the database @p0', () => {
  test('a walk-in is saved once, shows on the day, and makes a customer of the garage’s own', async () => {
    const s = stamp()
    const { res, body, service } = await walkIn(owner, s)
    expect(res.status()).toBe(201)
    const job = await data(res)
    const total = service.pricePaise + 15_000
    expect(job).toMatchObject({
      source: 'own',
      clientId: body.clientId,
      status: 'done',
      payment: 'later',
      remindInDays: 21,
      visitNumber: 1,
      totalPaise: total,
      created: true,
    })
    expect(job.lines).toHaveLength(2)

    // The phone sends it again when the signal comes back: the same job, written once.
    const again = await owner.post(`${BOOK}/jobs`, { data: body, headers: AT_MAIN })
    expect(again.status()).toBe(200)
    expect(await data(again)).toMatchObject({ id: job.id, created: false })
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from garage_jobs where vendor_id = ${VENDORS.main.id} and client_id = ${body.clientId}
    `
    expect(n).toBe(1)

    // Today's list has it, among the garage's own jobs.
    const day = await data(await owner.get(`${BOOK}/today`, { headers: AT_MAIN }))
    expect(day.jobs.map((j: { id: string }) => j.id)).toContain(job.id)
    expect(day.counts.own).toBeGreaterThanOrEqual(1)

    // Customers: one of the garage's own, with the phone it was given and what is owed.
    const list = await data(
      await owner.get(`${BOOK}/customers`, { params: { filter: 'own', q: s }, headers: AT_MAIN })
    )
    expect(list.customers).toHaveLength(1)
    expect(list.customers[0]).toMatchObject({
      id: job.customerId,
      source: 'own',
      viaDetlio: false,
      name: `Walk-in Wasim ${s}`,
      phone: phoneFor(s),
      visits: 1,
      owesPaise: total,
    })

    // One customer: the car and the visit.
    const one = await data(
      await owner.get(`${BOOK}/customers/${encodeURIComponent(job.customerId)}`, { headers: AT_MAIN })
    )
    expect(one.cars[0]).toMatchObject({ plate: 'TN 09 AB 1234', make: 'Maruti', model: 'Swift' })
    expect(one.history).toHaveLength(1)
    expect(one.history[0]).toMatchObject({ source: 'own', id: job.id })
  })

  test('money owed is settled by a payment, and Stats and the Excel are the owner’s', async () => {
    const s = stamp()
    const { res, service } = await walkIn(owner, s)
    const job = await data(res)
    const total = service.pricePaise + 15_000

    const owed = await data(await owner.get(`${BOOK}/owed`, { headers: AT_MAIN }))
    const row = owed.customers.find((c: { customerId: string }) => c.customerId === job.customerId)
    expect(row).toMatchObject({ balancePaise: total, jobs: 1 })

    const paid = await owner.post(`${BOOK}/owed/${encodeURIComponent(job.customerId)}/paid`, {
      data: { amountPaise: total, method: 'upi' },
      headers: AT_MAIN,
    })
    expect(paid.ok(), await paid.text()).toBe(true)
    const after = await data(await owner.get(`${BOOK}/owed`, { headers: AT_MAIN }))
    expect(after.customers.map((c: { customerId: string }) => c.customerId)).not.toContain(job.customerId)
    expect(after.recent.some((r: { amountPaise: number; method: string }) => r.amountPaise === total && r.method === 'upi')).toBe(true)

    // Stats for this month, the garage's own business: at least this new customer.
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
      .format(new Date())
      .slice(0, 7)
    const stats = await data(await owner.get(`${BOOK}/stats`, { params: { month, filter: 'own' }, headers: AT_MAIN }))
    expect(stats.month).toBe(month)
    expect(stats.newCustomers).toBeGreaterThanOrEqual(1)
    expect(stats.busiestDays).toHaveLength(7)

    // The Excel download is a real .xlsx (a zip).
    const xlsx = await owner.get(`${BOOK}/export.xlsx`, { headers: AT_MAIN })
    expect(xlsx.status()).toBe(200)
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml')
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK')
  })

  test('a customer is added with no job (Customers → + Add), and a number already saved is refused', async () => {
    const s = stamp()
    const body = {
      name: `Added Anand ${s}`,
      phone: phoneFor(s),
      note: 'Likes tyre shine',
      cars: [{ plate: 'TN 09 ZZ 4321', make: 'Hyundai', model: 'Creta' }],
    }
    const res = await owner.post(`${BOOK}/customers`, { data: body, headers: AT_MAIN })
    expect(res.status()).toBe(201)
    const created = await data(res)
    expect(created).toMatchObject({ name: body.name, phone: body.phone, note: body.note, visits: 0 })
    expect(created.cars[0]).toMatchObject({ plate: 'TN 09 ZZ 4321', make: 'Hyundai', model: 'Creta' })

    // On Customers, as one of the garage's own, with no visit yet. Staff can add one too.
    const list = await data(
      await owner.get(`${BOOK}/customers`, { params: { filter: 'own', q: s }, headers: AT_MAIN })
    )
    expect(list.customers.map((c: { id: string }) => c.id)).toEqual([created.id])
    expect(list.customers[0]).toMatchObject({ source: 'own', viaDetlio: false, visits: 0 })

    // The same number again, typed another way, is the customer the garage already has.
    const again = await operator.post(`${BOOK}/customers`, {
      data: { name: `Again ${s}`, phone: `+91 ${body.phone}` },
      headers: AT_MAIN,
    })
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('CUSTOMER_PHONE_TAKEN')

    // Only the name is needed.
    const bare = await operator.post(`${BOOK}/customers`, { data: { name: `Bare Bala ${s}` }, headers: AT_MAIN })
    expect(bare.status()).toBe(201)
  })

  test('staff add walk-ins but see no money', async () => {
    const s = stamp()
    const { res } = await walkIn(operator, s)
    expect(res.status()).toBe(201)
    const job = await data(res)
    expect(job).not.toHaveProperty('totalPaise')

    const list = await data(
      await operator.get(`${BOOK}/customers`, { params: { filter: 'own', q: s }, headers: AT_MAIN })
    )
    expect(list.customers).toHaveLength(1)
    expect(list.customers[0]).not.toHaveProperty('spentPaise')
    expect(list.customers[0]).not.toHaveProperty('owesPaise')

    for (const path of ['/owed', '/stats', '/export.xlsx']) {
      const refused = await operator.get(`${BOOK}${path}`, { headers: AT_MAIN })
      expect(refused.status(), path).toBe(403)
    }
  })

  test('a reminder to the garage’s own customer opens its WhatsApp with the message filled in', async () => {
    const s = stamp()
    const job = await data((await walkIn(owner, s)).res)
    const message = await owner.put(`${BOOK}/reminders/message`, {
      data: { message: 'Hi {name}, your car is due for a wash. Reply to book. – {garage}' },
      headers: AT_MAIN,
    })
    expect(message.ok(), await message.text()).toBe(true)

    const sent = await data(
      await owner.post(`${BOOK}/reminders/${encodeURIComponent(job.customerId)}/send`, { headers: AT_MAIN })
    )
    expect(sent.channel).toBe('whatsapp')
    expect(sent.url).toMatch(new RegExp(`^https://wa\\.me/91${phoneFor(s)}\\?text=`))
    // {name} is the first name; {garage} the garage's own.
    const text = decodeURIComponent(sent.url.split('text=')[1])
    expect(text).toContain('Hi Walk-in,')
    expect(text).toContain(VENDORS.main.name)
  })

  test('a Detlio customer’s phone never shows, and another garage cannot read the book', async () => {
    const s = stamp()
    const job = await data((await walkIn(owner, s)).res)

    const detlio = await data(
      await owner.get(`${BOOK}/customers`, { params: { filter: 'detlio' }, headers: AT_MAIN })
    )
    for (const c of detlio.customers) {
      expect(c.source).toBe('detlio')
      expect(c.phone, c.name).toBeNull()
    }

    // NARROW's owner, in NARROW, asks for MAIN's customer: not found, never shown.
    const narrow = await loginViaApi(STAFF.narrowOwner.phone, 'vendor')
    try {
      const other = await narrow.get(`${BOOK}/customers/${encodeURIComponent(job.customerId)}`, {
        headers: AT_NARROW,
      })
      expect(other.status()).toBe(404)
      const theirs = await data(
        await narrow.get(`${BOOK}/customers`, { params: { filter: 'own', q: s }, headers: AT_NARROW })
      )
      expect(theirs.customers).toHaveLength(0)
      // And asking as MAIN, where it has no seat, is refused.
      const asMain = await narrow.get(`${BOOK}/customers`, { headers: AT_MAIN })
      expect(asMain.ok()).toBe(false)
    } finally {
      await narrow.dispose()
    }
  })

  test('Detlio staff can read a garage’s book, and every look is logged first', async () => {
    const admin = await loginViaApi(STAFF.superAdmin.phone, 'vendor')
    try {
      const before = await sql<{ n: number }[]>`
        select count(*)::int as n from internal_access_log
         where user_id = ${STAFF.superAdmin.id} and endpoint like ${`%/vendors/${VENDORS.main.id}/book%`}
      `
      const res = await admin.get(`/api/v1/admin/vendors/${VENDORS.main.id}/book`)
      expect(res.ok(), await res.text()).toBe(true)
      const after = await sql<{ n: number }[]>`
        select count(*)::int as n from internal_access_log
         where user_id = ${STAFF.superAdmin.id} and endpoint like ${`%/vendors/${VENDORS.main.id}/book%`}
      `
      expect(after[0].n).toBe(before[0].n + 1)

      // The garage's owner is not Detlio staff.
      const refused = await owner.get(`/api/v1/admin/vendors/${VENDORS.main.id}/book`)
      expect(refused.ok()).toBe(false)
    } finally {
      await admin.dispose()
    }
  })
})
