/**
 * Garage Book stages 2 and 3 (0073) against the real database: the server's
 * unit tests try every rule with the repositories patched out, so this is
 * where the SQL itself (0073_garage_book_2 and the garage-book-* files) is
 * proved, as garage-book-api.spec.ts does for Stage 1.
 *
 * GARAGE_BOOK=on for the E2E API (.env.e2e); the portal's switch stays off,
 * so these tests use the API only. VENDORS.main, as STAFF.owner and
 * STAFF.operator (global setup's vendor-owner and vendor-operator sessions). Every name, phone and clientId carries this run's stamp,
 * so a retry never meets the first try's rows. Uploads to storage are not
 * used (no bucket locally): payment details are saved without a QR picture,
 * and reading a QR is unit-tested with real pictures (lib/upi-qr.test.ts).
 */
import { request, type APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../../support/fixtures'
import { API, statePath } from '../../support/auth'
import { sql } from '../../support/db'
import { VENDORS } from '../../support/seed-ids'

const BOOK = '/api/v1/vendors/me/book'
const PUBLIC = '/api/v1/public'
const AT_MAIN = { 'x-vendor-id': VENDORS.main.id }

const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
/** A 10-digit Indian mobile number no seeded user has. */
const phoneFor = (s: string, lead = '97') => `${lead}${String(parseInt(s, 36) % 1e8).padStart(8, '0')}`
const istMonth = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

let owner: APIRequestContext
let operator: APIRequestContext
let anyone: APIRequestContext

test.beforeAll(async () => {
  // The sessions global setup made: logging the same people in again here
  // would race garage-book-api.spec.ts for their OTPs when both run at once.
  const signedIn = (role: string) => request.newContext({ baseURL: API, storageState: statePath(role) })
  owner = await signedIn('vendor-owner')
  operator = await signedIn('vendor-operator')
  // The public pages: nobody signed in.
  anyone = await request.newContext({ baseURL: API, storageState: { cookies: [], origins: [] } })
})

test.afterAll(async () => {
  await owner?.dispose()
  await operator?.dispose()
  await anyone?.dispose()
})

async function data<T = any>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true)
  return (await res.json()).data as T
}

async function firstService(ctx: APIRequestContext) {
  const list = await data<Array<{ id: string; name: string; pricePaise: number; isAddon: boolean }>>(
    await ctx.get(`${BOOK}/services`, { headers: AT_MAIN })
  )
  return list.find((s) => !s.isAddon)!
}

/** A finished walk-in for a new customer of the garage's own: its job and total. */
async function walkIn(ctx: APIRequestContext, s: string, extra: Record<string, unknown> = {}) {
  const service = await firstService(ctx)
  const res = await ctx.post(`${BOOK}/jobs`, {
    headers: AT_MAIN,
    data: {
      clientId: `e2e-gb2-${s}`,
      customer: { name: `Bill Bala ${s}`, phone: phoneFor(s), plate: 'TN 10 AB 2222', make: 'Hyundai', model: 'Creta' },
      lines: [{ serviceId: service.id }],
      scheduledAt: new Date().toISOString(),
      status: 'done',
      payment: 'later',
      remindInDays: 30,
      ...extra,
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  return { job: (await res.json()).data, service }
}

test.describe('Garage Book stages 2 and 3 on the database @p0', () => {
  test('team: a person is added, picked as who did a job, and their month adds up (money for the owner only)', async () => {
    const s = stamp()
    const member = await data(await owner.post(`${BOOK}/team`, { headers: AT_MAIN, data: { name: `Arun ${s}`, role: 'Washer' } }))
    const { job, service } = await walkIn(owner, s, { payment: 'upi' })

    // Staff say who did it.
    const set = await data(
      await operator.put(`${BOOK}/jobs/own:${job.id}/workers`, { headers: AT_MAIN, data: { memberIds: [member.id] } })
    )
    expect(set).toEqual({ ref: `own:${job.id}`, workers: [{ id: member.id, name: `Arun ${s}` }] })

    // An advance this month shows on their card.
    await data(
      await owner.post(`${BOOK}/expenses`, {
        headers: AT_MAIN,
        data: { category: 'advance', amountPaise: 200_000, spentOn: istToday(), memberId: member.id, method: 'cash' },
      })
    )
    const team = await data(await owner.get(`${BOOK}/team`, { headers: AT_MAIN }))
    expect(team.members.find((m: { id: string }) => m.id === member.id)).toMatchObject({
      jobs: 1,
      jobsToday: 1,
      valuePaise: service.pricePaise,
      advancePaise: 200_000,
    })

    const staff = await data(await operator.get(`${BOOK}/team`, { headers: AT_MAIN }))
    const seen = staff.members.find((m: { id: string }) => m.id === member.id)
    expect(seen).toMatchObject({ jobs: 1 })
    expect(seen).not.toHaveProperty('valuePaise')
    expect(seen).not.toHaveProperty('advancePaise')

    // Today's list shows who is on it.
    const day = await data(await owner.get(`${BOOK}/today`, { headers: AT_MAIN }))
    const row = day.jobs.find((j: { id: string }) => j.id === job.id)
    expect(row.workers).toEqual([{ id: member.id, name: `Arun ${s}` }])
    expect(row.origin).toBe('walk_in')

    // Off the team: gone from the list, the job keeps the name.
    await data(await owner.delete(`${BOOK}/team/${member.id}`, { headers: AT_MAIN }))
    const after = await data(await owner.get(`${BOOK}/team`, { headers: AT_MAIN }))
    expect(after.members.map((m: { id: string }) => m.id)).not.toContain(member.id)
  })

  test('expenses make profit real, and an every-month expense copies itself into this month once', async () => {
    const month = istMonth()
    const before = await data(await owner.get(`${BOOK}/expenses`, { params: { month }, headers: AT_MAIN }))
    const s = stamp()
    const rent = await data(
      await owner.post(`${BOOK}/expenses`, {
        headers: AT_MAIN,
        data: { category: 'rent', amountPaise: 800_000, spentOn: istToday(), note: `Shop rent ${s}`, method: 'upi' },
      })
    )
    const after = await data(await owner.get(`${BOOK}/expenses`, { params: { month }, headers: AT_MAIN }))
    expect(after.spentPaise).toBe(before.spentPaise + 800_000)
    expect(after.totals.rent).toBe(before.totals.rent + 800_000)
    expect(after.profitPaise).toBe(after.takenPaise - after.spentPaise)
    expect(after.expenses.map((e: { id: string }) => e.id)).toContain(rent.id)

    // Stats' profit is the same sum.
    const stats = await data(await owner.get(`${BOOK}/stats`, { params: { month }, headers: AT_MAIN }))
    expect(stats.spentPaise).toBe(after.spentPaise)
    expect(stats.profitPaise).toBe(stats.split.ownPaise + stats.split.detlioPaise - after.spentPaise)

    // Last month's salary set to repeat: reading this month copies it in, once.
    const lastMonthDay = new Date(Date.now() - 32 * 86_400_000)
    const spentOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(lastMonthDay)
    const salary = await data(
      await owner.post(`${BOOK}/expenses`, {
        headers: AT_MAIN,
        data: { category: 'salary', amountPaise: 1_200_000, spentOn, note: `Salaries ${s}`, everyMonth: true },
      })
    )
    await owner.get(`${BOOK}/expenses`, { params: { month }, headers: AT_MAIN })
    await owner.get(`${BOOK}/expenses`, { params: { month }, headers: AT_MAIN })
    const copies = await sql<{ series_month: string }[]>`
      select series_month from garage_expenses where series_id = ${salary.id} order by series_month
    `
    expect(copies.map((row) => row.series_month)).toEqual([spentOn.slice(0, 7), month])

    // Staff never reach it.
    expect((await operator.get(`${BOOK}/expenses`, { headers: AT_MAIN })).status()).toBe(403)
  })

  test('bills: the garage’s own running number, the same bill when asked again, and a public page with no phone', async () => {
    const s = stamp()
    const { job } = await walkIn(owner, s)
    const first = await owner.post(`${BOOK}/bills`, { headers: AT_MAIN, data: { ref: `own:${job.id}` } })
    expect(first.status(), await first.text()).toBe(201)
    const bill = (await first.json()).data
    expect(bill.numberText).toBe(String(bill.number).padStart(4, '0'))
    expect(bill.whatsappUrl).toMatch(new RegExp(`^https://wa\\.me/91${phoneFor(s)}\\?text=`))
    expect(bill.madeWith).toBe('Made with Detlio for Garages')

    const again = await data(await owner.post(`${BOOK}/bills`, { headers: AT_MAIN, data: { ref: job.id } }))
    expect(again).toMatchObject({ number: bill.number, token: bill.token, created: false })

    const second = await walkIn(owner, `${s}b`)
    const next = await data(await owner.post(`${BOOK}/bills`, { headers: AT_MAIN, data: { ref: `own:${second.job.id}` } }))
    expect(next.number).toBe(bill.number + 1)
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from garage_bills where vendor_id = ${VENDORS.main.id} and number = ${bill.number}
    `
    expect(n).toBe(1)

    const page = await anyone.get(`${PUBLIC}/bills/${bill.token}`)
    expect(page.status()).toBe(200)
    expect(page.headers()['x-robots-tag']).toContain('noindex')
    const body = (await page.json()).data
    expect(body).toMatchObject({ numberText: bill.numberText, paid: false, customer: { firstName: 'Bill', plate: 'TN 10 AB 2222' } })
    expect(JSON.stringify(body)).not.toContain(phoneFor(s))
    expect((await anyone.get(`${PUBLIC}/bills/nobodysbillnobodysbill00`)).status()).toBe(404)

    // A bill is the owner's.
    expect((await operator.post(`${BOOK}/bills`, { headers: AT_MAIN, data: { ref: job.id } })).status()).toBe(403)
  })

  test('payment details show on an unpaid bill and its WhatsApp, and go once it is paid', async () => {
    const saved = await data(
      await owner.put(`${BOOK}/payment-details`, {
        headers: AT_MAIN,
        data: { phone: '98400 11111', apps: ['phonepe', 'gpay'], showOnBills: true, showOnReminders: true },
      })
    )
    expect(saved).toMatchObject({ set: true, phone: '9840011111', phoneIsGarage: false, apps: ['gpay', 'phonepe'], qrUrl: null })

    const s = stamp()
    const { job, service } = await walkIn(owner, s)
    const bill = await data(await owner.post(`${BOOK}/bills`, { headers: AT_MAIN, data: { ref: `own:${job.id}` } }))
    expect(decodeURIComponent(bill.whatsappUrl)).toContain('Pay on GPay/PhonePe 98400 11111')
    const unpaid = await data(await anyone.get(`${PUBLIC}/bills/${bill.token}`))
    expect(unpaid.pay).toMatchObject({ phone: '9840011111', appsText: 'GPay/PhonePe' })

    // Money owed: the Ask on WhatsApp line.
    const owed = await data(await owner.get(`${BOOK}/owed`, { headers: AT_MAIN }))
    expect(owed.payLine).toBe('Pay on GPay/PhonePe 98400 11111')

    // Paid back: the bill says so, and carries no payment details.
    await data(
      await owner.post(`${BOOK}/owed/${encodeURIComponent(job.customerId)}/paid`, {
        headers: AT_MAIN,
        data: { amountPaise: service.pricePaise, method: 'upi' },
      })
    )
    const paid = await data(await anyone.get(`${PUBLIC}/bills/${bill.token}`))
    expect(paid).toMatchObject({ paid: true, method: 'upi', pay: null })

    expect((await operator.get(`${BOOK}/payment-details`, { headers: AT_MAIN })).status()).toBe(403)
  })

  test('the booking link: a new customer books on it, and a Detlio customer of this garage is sent to Detlio', async () => {
    const link = await data(await owner.get(`${BOOK}/link`, { headers: AT_MAIN }))
    expect(link.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(link.url).toMatch(new RegExp(`/g/${link.slug}$`))
    expect(link.services.some((service: { shown: boolean }) => service.shown)).toBe(true)

    const page = await data(await anyone.get(`${PUBLIC}/g/${link.slug}`))
    expect(page.garage.name).toBe(VENDORS.main.name)
    expect(page.days.length).toBeGreaterThan(0)
    // A later day's first time: still open however long the run takes.
    const bookDay = page.days.at(-1)
    const at = bookDay.times[0]
    const serviceId = page.services[0].id

    const s = stamp()
    const phone = phoneFor(s, '96')
    const booked = await anyone.post(`${PUBLIC}/g/${link.slug}/book`, { data: { serviceId, at, name: `Link Lata ${s}`, phone } })
    expect(booked.status(), await booked.text()).toBe(201)
    expect((await booked.json()).data).toMatchObject({ detlio: false, booked: { at } })
    const rows = await sql<{ origin: string; status: string }[]>`
      select j.origin, j.status from garage_jobs j join garage_customers c on c.id = j.garage_customer_id
       where c.vendor_id = ${VENDORS.main.id} and c.phone = ${phone}
    `
    expect(rows).toEqual([{ origin: 'link', status: 'booked' }])
    const day = await data(
      await owner.get(`${BOOK}/today`, { params: { date: bookDay.date }, headers: AT_MAIN })
    )
    expect(day.jobs.some((j: { origin?: string; name: string }) => j.origin === 'link' && j.name === `Link Lata ${s}`)).toBe(true)

    // Decision 5: a phone that has booked this garage through Detlio books on Detlio. Nothing is written.
    const [detlio] = await sql<{ phone: string }[]>`
      select u.phone from bookings b join users u on u.id = b.user_id
       where b.vendor_id = ${VENDORS.main.id} and b.status <> 'rescheduled'
         and exists (select 1 from payments p where p.booking_id = b.id and p.status in ('paid', 'collected', 'refunded'))
       limit 1
    `
    const sent = await anyone.post(`${PUBLIC}/g/${link.slug}/book`, { data: { serviceId, at, name: 'Detlio Dev', phone: detlio!.phone } })
    expect(sent.status()).toBe(200)
    expect((await sent.json()).data).toEqual({ detlio: true, url: expect.stringMatching(new RegExp(`/garage/${VENDORS.main.id}$`)) })
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from garage_customers where vendor_id = ${VENDORS.main.id} and phone = ${detlio!.phone}
    `
    expect(n).toBe(0)

    // The link switched off is a 404, on again it is back.
    await data(await owner.put(`${BOOK}/link`, { headers: AT_MAIN, data: { active: false } }))
    expect((await anyone.get(`${PUBLIC}/g/${link.slug}`)).status()).toBe(404)
    await data(await owner.put(`${BOOK}/link`, { headers: AT_MAIN, data: { active: true } }))
    expect((await anyone.get(`${PUBLIC}/g/${link.slug}`)).status()).toBe(200)
  })

  test('stock goes down by itself on a finished walk-in, and a received order adds stock and one expense', async () => {
    const s = stamp()
    const service = await firstService(owner)
    const item = await data(
      await owner.post(`${BOOK}/stock`, {
        headers: AT_MAIN,
        data: { name: `Foam shampoo ${s}`, unit: 'ml', level: 1000, lowAt: 2000, packSize: 5000, packPricePaise: 115_000 },
      })
    )
    expect(item).toMatchObject({ level: 1000, low: true, share: 0.2 })
    await data(await owner.put(`${BOOK}/stock/${item.id}/usage`, { headers: AT_MAIN, data: [{ serviceId: service.id, amount: 150 }] }))

    // Two of that service on one walk-in: 300 ml off, once.
    await walkIn(operator, s, { lines: [{ serviceId: service.id, qty: 2 }], payment: 'cash' })
    const used = await data(await operator.get(`${BOOK}/stock/${item.id}`, { headers: AT_MAIN }))
    expect(used.item.level).toBe(700)
    expect(used.item).not.toHaveProperty('packPricePaise')
    expect(used.moves[0]).toMatchObject({ kind: 'used', delta: -300, levelAfter: 700 })

    // Count it (any seat).
    const counted = await data(await operator.post(`${BOOK}/stock/${item.id}/count`, { headers: AT_MAIN, data: { level: 650 } }))
    expect(counted.level).toBe(650)

    // Order from the garage's own supplier, then Received (twice).
    const supplier = await data(
      await owner.post(`${BOOK}/suppliers`, { headers: AT_MAIN, data: { name: `Sri Balaji ${s}`, phone: '98400 55555' } })
    )
    const suggest = await data(await owner.get(`${BOOK}/supplies/suggest`, { headers: AT_MAIN }))
    expect(JSON.stringify(suggest)).toContain(item.id)
    const order = await data(
      await owner.post(`${BOOK}/supplies/orders`, {
        headers: AT_MAIN,
        data: { supplierId: supplier.id, lines: [{ itemId: item.id, packs: 2 }] },
      })
    )
    expect(order.order).toMatchObject({ status: 'sent', totalPaise: 230_000 })
    expect(order.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919840055555\?text=/)
    expect(decodeURIComponent(order.whatsappUrl)).toContain(`Foam shampoo ${s} 5 L × 2`)

    const received = await data(await owner.post(`${BOOK}/supplies/orders/${order.order.id}/received`, { headers: AT_MAIN }))
    expect(received).toMatchObject({ added: true, order: { status: 'received' } })
    const again = await data(await owner.post(`${BOOK}/supplies/orders/${order.order.id}/received`, { headers: AT_MAIN }))
    expect(again.added).toBe(false)
    const after = await data(await owner.get(`${BOOK}/stock/${item.id}`, { headers: AT_MAIN }))
    expect(after.item.level).toBe(10_650)
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from garage_expenses where supply_order_id = ${order.order.id} and category = 'supplies' and amount_paise = 230000
    `
    expect(n).toBe(1)
  })

  test('bringing in a book: a sheet is read for checking, and adding it twice adds it once', async () => {
    const s = stamp()
    const phoneA = phoneFor(s, '95')
    const phoneB = phoneFor(`${s}x`, '94')
    const csv = [
      'Name,Mobile,Vehicle No,Model,Last Visit,Balance',
      `Imported Indra ${s},${phoneA},TN 11 AA 1111,Swift,12/10/2026,`,
      `Imported Mani ${s},${phoneB},TN 11 BB 2222,Innova,3/11/2026,6400`,
      `Smudged Sam ${s},98?40 1123?,,,,`,
    ].join('\n')
    const read = await data(
      await owner.post(`${BOOK}/import/extract`, {
        headers: AT_MAIN,
        data: { source: 'sheet', name: 'book.csv', dataBase64: Buffer.from(csv).toString('base64') },
      })
    )
    expect(read.rows).toHaveLength(3)
    expect(read.rows[2]).toMatchObject({ phone: null, unsure: ['phone'] })
    expect(read.rows[1]).toMatchObject({ phone: phoneB, owesPaise: 640_000, lastVisit: '2026-11-03' })

    const rows = read.rows.slice(0, 2)
    expect(await data(await owner.post(`${BOOK}/import/commit`, { headers: AT_MAIN, data: { rows } }))).toEqual({
      added: 2,
      merged: 0,
      skipped: 0,
    })
    expect(await data(await owner.post(`${BOOK}/import/commit`, { headers: AT_MAIN, data: { rows } }))).toEqual({
      added: 0,
      merged: 2,
      skipped: 0,
    })
    const owed = await sql<{ amount_paise: number }[]>`
      select p.amount_paise from garage_payments p join garage_customers c on c.id = p.garage_customer_id
       where c.vendor_id = ${VENDORS.main.id} and c.phone = ${phoneB} and p.source = 'import'
    `
    expect(owed).toEqual([{ amount_paise: 640_000 }])

    // A second read now says these are customers already in the book.
    const again = await data(
      await owner.post(`${BOOK}/import/extract`, {
        headers: AT_MAIN,
        data: { source: 'sheet', name: 'book.csv', dataBase64: Buffer.from(csv).toString('base64') },
      })
    )
    expect(again.rows[0].match).toMatchObject({ by: 'phone', name: `Imported Indra ${s}` })

    // A photo of the paper book, read by the AI (AI_FAKE answers with a fixed page).
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const png = readFileSync(path.resolve(dir, '../../../server/src/lib/__fixtures__/blank.png')).toString('base64')
    const photo = await data(
      await owner.post(`${BOOK}/import/extract`, {
        headers: AT_MAIN,
        data: { source: 'photos', files: [{ name: 'page1.png', mimeType: 'image/png', dataBase64: png }] },
      })
    )
    expect(photo.rows.map((row: { name: string }) => row.name)).toEqual(['Suresh Kumar', 'Ramesh', 'Meena Transports'])
    expect(photo.rows[1].unsure).toContain('phone')

    expect((await operator.post(`${BOOK}/import/commit`, { headers: AT_MAIN, data: { rows } })).status()).toBe(403)
  })

  test('staff get no money routes; milestones are the owner’s and each shows once', async () => {
    for (const [method, url] of [
      ['get', `${BOOK}/expenses`],
      ['get', `${BOOK}/link`],
      ['get', `${BOOK}/suppliers`],
      ['get', `${BOOK}/supplies/orders`],
      ['get', `${BOOK}/supplies/suggest`],
      ['get', `${BOOK}/milestones`],
      ['post', `${BOOK}/team`],
      ['post', `${BOOK}/stock`],
    ] as const) {
      const res = await operator[method](url, { headers: AT_MAIN, ...(method === 'post' ? { data: { name: 'x', unit: 'ml' } } : {}) })
      expect(res.status(), `${method} ${url}`).toBe(403)
    }
    const staffStock = await data(await operator.get(`${BOOK}/stock`, { headers: AT_MAIN }))
    for (const item of staffStock.items) {
      expect(item).not.toHaveProperty('packPricePaise')
      expect(item).not.toHaveProperty('supplier')
    }

    const milestone = await data(await owner.get(`${BOOK}/milestones`, { headers: AT_MAIN }))
    expect(milestone).toHaveProperty('milestone')
    if (milestone.milestone) {
      await data(await owner.post(`${BOOK}/milestones/${milestone.milestone.key}/seen`, { headers: AT_MAIN }))
      const next = await data(await owner.get(`${BOOK}/milestones`, { headers: AT_MAIN }))
      expect(next.milestone?.key).not.toBe(milestone.milestone.key)
    }
    expect((await owner.post(`${BOOK}/milestones/nothing_real/seen`, { headers: AT_MAIN })).status()).toBe(404)

    // Moment 5's sums are on Reminders, the money for the owner only.
    const reminders = await data(await owner.get(`${BOOK}/reminders`, { headers: AT_MAIN }))
    expect(typeof reminders.earnedThisMonthPaise).toBe('number')
    const staffReminders = await data(await operator.get(`${BOOK}/reminders`, { headers: AT_MAIN }))
    expect(staffReminders).not.toHaveProperty('earnedThisMonthPaise')
    expect(typeof staffReminders.cameBack).toBe('number')
  })
})
