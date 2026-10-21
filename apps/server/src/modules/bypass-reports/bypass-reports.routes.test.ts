/**
 * Who may reach bypass reports (0052), through the real routes and the real
 * auth middleware (the customer routes as users.routes.ts mounts them). Only
 * the database is stood in for: the reports repository is replaced on its
 * object with an in-memory one for these tests and put back afterwards, and
 * the super-admin lookup answers from a list. Telegram and push are off in
 * tests, so nothing is sent.
 *
 * The rules: a customer reports and reads only their own bookings' reports,
 * and never sees the team's names or reasons; only a super-admin lists,
 * confirms or dismisses; a garage has no route to any of it at all, and no
 * admin answer it could reach would name the reporter anyway. Confirming
 * rewards once per customer per garage; a second press is 409.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')
const { bypassReportsRepository } = await import('./bypass-reports.repository.js')
const { adminBypassReportRoutes, customerBypassReportRoutes } = await import('./bypass-reports.routes.js')
const { vendorsRoutes } = await import('../vendors/vendors.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000003210'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000003211'

const PEOPLE = {
  customer: 'e2e00000-0000-4000-8000-000000003201',
  otherCustomer: 'e2e00000-0000-4000-8000-000000003202',
  owner: 'e2e00000-0000-4000-8000-000000003203',
  superAdmin: 'e2e00000-0000-4000-8000-000000003204',
}

const DAY = 24 * 60 * 60 * 1000

/** The customers' bookings: one on, one finished long ago, one still waiting, and another garage's. */
const BOOKINGS: Record<string, { userId: string; vendorId: string; status: string; completedAt: Date | null; acceptedAt: Date | null }> = {
  'e2e00000-0000-4000-8000-000000003220': { userId: PEOPLE.customer, vendorId: GARAGE, status: 'confirmed', completedAt: null, acceptedAt: new Date() },
  'e2e00000-0000-4000-8000-000000003221': { userId: PEOPLE.customer, vendorId: GARAGE, status: 'completed', completedAt: new Date(Date.now() - 45 * DAY), acceptedAt: new Date(Date.now() - 46 * DAY) },
  'e2e00000-0000-4000-8000-000000003222': { userId: PEOPLE.customer, vendorId: GARAGE, status: 'pending', completedAt: null, acceptedAt: null },
  'e2e00000-0000-4000-8000-000000003223': { userId: PEOPLE.customer, vendorId: GARAGE, status: 'completed', completedAt: new Date(Date.now() - 2 * DAY), acceptedAt: new Date(Date.now() - 3 * DAY) },
  'e2e00000-0000-4000-8000-000000003224': { userId: PEOPLE.otherCustomer, vendorId: OTHER_GARAGE, status: 'confirmed', completedAt: null, acceptedAt: new Date() },
}
const [ON, OLD, WAITING, ALSO_DONE, OTHERS] = Object.keys(BOOKINGS) as [string, string, string, string, string]

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

type Report = {
  id: string
  userId: string | null
  bookingId: string | null
  rootBookingId: string | null
  bookingRef: string
  vendorId: string | null
  garageName: string
  kind: string
  note: string | null
  status: 'new' | 'confirmed' | 'dismissed'
  confirmedAt: Date | null
  confirmedBy: string | null
  dismissedAt: Date | null
  dismissedBy: string | null
  dismissedReason: string | null
  rewardStatus: 'none' | 'owed' | 'granted'
  rewardEntryId: string | null
  rewardGrantedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
const reports: Report[] = []
const ledger: Array<{ userId: string; amountPaise: number }> = []
const audits: Array<{ action: string; actorName: string }> = []
const savedGifts = env.giftsEnabled

const adminRow = (report: Report) => ({
  report,
  customerName: report.userId === PEOPLE.customer ? 'Priya Raman' : 'Arun K',
  customerPhone: '9876500001',
  bookingStatus: report.bookingId ? BOOKINGS[report.bookingId]?.status ?? null : null,
  bookingScheduledAt: new Date(),
  bookingMarkedTest: false,
})

const strikesNow = (vendorId: string) => reports.filter((r) => r.vendorId === vendorId && r.status === 'confirmed').length

beforeAll(() => {
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  // requireSuperAdmin signs every admin write with the session's name (0058).
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' } : undefined
  )

  const repo = bypassReportsRepository as unknown as Record<string, unknown>
  const stubs: Record<string, unknown> = {
    findOwnChain: async (userId: string, bookingId: string) => {
      const booking = BOOKINGS[bookingId]
      if (!booking || booking.userId !== userId) return null
      return {
        rootBookingId: bookingId,
        latest: {
          id: bookingId,
          status: booking.status,
          vendorId: booking.vendorId,
          garageName: booking.vendorId === GARAGE ? 'Marina Auto Spa' : 'Other Garage',
          acceptedAt: booking.acceptedAt,
          completedAt: booking.completedAt,
          deliveredAt: null,
          cancelledAt: null,
          scheduledAt: new Date(),
        },
      }
    },
    findOwnByRoot: async (userId: string, root: string) =>
      reports.find((r) => r.userId === userId && r.rootBookingId === root) ?? null,
    countSince: async (userId: string) => reports.filter((r) => r.userId === userId).length,
    insertUnderLimits: async (input: {
      userId: string
      values: Partial<Report> & { rootBookingId: string }
      decide: (counts: { alreadyReported: boolean; inLastYear: number }) => string | null
    }) => {
      const refusal = input.decide({
        alreadyReported: reports.some((r) => r.rootBookingId === input.values.rootBookingId),
        inLastYear: reports.filter((r) => r.userId === input.userId).length,
      })
      if (refusal) return { created: null, refusal }
      const now = new Date()
      const created: Report = {
        id: `e2e00000-0000-4000-8000-0000000032${30 + reports.length}`,
        userId: input.userId,
        bookingId: input.values.bookingId ?? null,
        rootBookingId: input.values.rootBookingId,
        bookingRef: input.values.bookingRef!,
        vendorId: input.values.vendorId ?? null,
        garageName: input.values.garageName!,
        kind: input.values.kind!,
        note: input.values.note ?? null,
        status: 'new',
        confirmedAt: null,
        confirmedBy: null,
        dismissedAt: null,
        dismissedBy: null,
        dismissedReason: null,
        rewardStatus: 'none',
        rewardEntryId: null,
        rewardGrantedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      reports.push(created)
      return { created }
    },
    listForCustomer: async (userId: string) => reports.filter((r) => r.userId === userId),
    listForAdmin: async (status: string) => reports.filter((r) => r.status === status).map(adminRow),
    countByStatus: async () => ({
      new: reports.filter((r) => r.status === 'new').length,
      confirmed: reports.filter((r) => r.status === 'confirmed').length,
      dismissed: reports.filter((r) => r.status === 'dismissed').length,
    }),
    findForAdmin: async (id: string) => {
      const report = reports.find((r) => r.id === id)
      return report ? adminRow(report) : null
    },
    strikeCounts: async ({ vendorIds }: { vendorIds: string[] | null }) =>
      [GARAGE, OTHER_GARAGE]
        .filter((id) => vendorIds === null || vendorIds.includes(id))
        .map((vendorId) => ({ vendorId, count: strikesNow(vendorId) }))
        .filter((row) => row.count > 0),
    // The repository's transaction, in memory: the same steps in the same order.
    confirm: async (input: {
      id: string
      actorName: string
      now: Date
      rewardAmountPaise: number
      decide: (facts: { hasAccount: boolean; hasGarage: boolean; alreadyRewarded: boolean }) => { kind: string }
    }) => {
      const report = reports.find((r) => r.id === input.id)
      if (!report) return { kind: 'not_found' }
      if (report.status !== 'new') return { kind: 'moved_on' }
      const strikesBefore = report.vendorId ? strikesNow(report.vendorId) : 0
      Object.assign(report, { status: 'confirmed', confirmedAt: input.now, confirmedBy: input.actorName })
      const strikesAfter = report.vendorId ? strikesNow(report.vendorId) : 0
      const alreadyRewarded = reports.some(
        (r) => r !== report && r.userId === report.userId && r.vendorId === report.vendorId && r.rewardStatus !== 'none'
      )
      const reward = input.decide({ hasAccount: report.userId !== null, hasGarage: report.vendorId !== null, alreadyRewarded })
      if (reward.kind === 'grant') {
        ledger.push({ userId: report.userId!, amountPaise: input.rewardAmountPaise })
        Object.assign(report, { rewardStatus: 'granted', rewardEntryId: `entry-${ledger.length}`, rewardGrantedAt: input.now })
      } else if (reward.kind === 'owe') {
        report.rewardStatus = 'owed'
      }
      audits.push({ action: 'bypass_report_confirmed', actorName: input.actorName })
      return { kind: 'confirmed', report, strikesBefore, strikesAfter, reward }
    },
    dismiss: async (input: { id: string; actorName: string; reason: string; now: Date }) => {
      const report = reports.find((r) => r.id === input.id && r.status === 'new')
      if (!report) return null
      Object.assign(report, {
        status: 'dismissed',
        dismissedAt: input.now,
        dismissedBy: input.actorName,
        dismissedReason: input.reason,
      })
      audits.push({ action: 'bypass_report_dismissed', actorName: input.actorName })
      return report
    },
    exists: async (id: string) => reports.some((r) => r.id === id),
  }
  for (const [key, value] of Object.entries(stubs)) patch(repo, key, value)
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  ;(env as unknown as Record<string, unknown>).giftsEnabled = savedGifts
})

beforeEach(() => {
  reports.length = 0
  ledger.length = 0
  audits.length = 0
  ;(env as unknown as Record<string, unknown>).giftsEnabled = true
})

// ─── The app, answering the way app.ts does ──────────────────────────────────

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
// As users.routes.ts mounts it: signed-in customers only, then /me.
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me', customerBypassReportRoutes)
app.route('/users', users)
app.route('/admin/bypass-reports', adminBypassReportRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass' | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({
          sub: PEOPLE[who],
          aud: who === 'owner' ? 'vendor' : 'customer',
          isCustomer: who !== 'owner',
          isVendorOwner: who === 'owner',
        })
  return { Cookie: `access_token=${token}` }
}

type Body = { code?: string; message?: string; data?: Record<string, unknown> & { reports?: Array<Record<string, unknown>> } }

async function call(path: string, who: Who, body?: unknown) {
  const response = await app.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(await cookieFor(who)), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Body }
}

const report = (bookingId: string, who: Who = 'customer', extra: Record<string, unknown> = {}) =>
  call('/users/me/bypass-reports', who, { bookingId, kind: 'pay_directly', note: 'Asked for UPI to his own number', ...extra })

// ─── The customer ────────────────────────────────────────────────────────────

describe('the customer: their own bookings only', () => {
  test('reports a booking the garage accepted, and sees it as theirs', async () => {
    const before = await call(`/users/me/bypass-reports/bookings/${ON}`, 'customer')
    expect(before.status).toBe(200)
    expect(before.body.data).toMatchObject({ canReport: true, report: null, reportsLeft: 5, rewardOffered: true })

    const sent = await report(ON)
    expect(sent.status).toBe(201)
    expect(sent.body.data).toMatchObject({ status: 'new', reward: 'none', kind: 'pay_directly', garageName: 'Marina Auto Spa' })

    const after = await call(`/users/me/bypass-reports/bookings/${ON}`, 'customer')
    expect(after.body.data).toMatchObject({ canReport: false, report: { status: 'new' }, reportsLeft: 4 })
  })

  test("someone else's booking is a 404, as if it did not exist", async () => {
    expect((await call(`/users/me/bypass-reports/bookings/${OTHERS}`, 'customer')).status).toBe(404)
    const sent = await report(OTHERS)
    expect(sent.status).toBe(404)
    expect(sent.body.code).toBe('BOOKING_NOT_FOUND')
    expect(reports).toHaveLength(0)
  })

  test('one per booking; not before acceptance; not 30 days after completion', async () => {
    expect((await report(ON)).status).toBe(201)
    const again = await report(ON)
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('BYPASS_ALREADY_REPORTED')
    expect((await report(WAITING)).body.code).toBe('BYPASS_NOT_YET')
    expect((await report(OLD)).body.code).toBe('BYPASS_WINDOW_CLOSED')
  })

  test('at most 5 a year', async () => {
    // Five made this year, about other bookings.
    for (let i = 0; i < 5; i += 1) {
      reports.push({ userId: PEOPLE.customer, rootBookingId: `earlier-${i}`, status: 'new' } as Report)
    }
    const status = await call(`/users/me/bypass-reports/bookings/${ON}`, 'customer')
    expect(status.body.data).toMatchObject({ canReport: false, refusal: 'limit_reached', reportsLeft: 0 })
    const sixth = await report(ON)
    expect(sixth.status).toBe(409)
    expect(sixth.body.code).toBe('BYPASS_REPORT_LIMIT')
    expect(reports).toHaveLength(5)
  })

  test('nothing extra rides along: a status, a reward or another customer is refused', async () => {
    expect((await report(ON, 'customer', { status: 'confirmed' })).status).toBe(400)
    expect((await report(ON, 'customer', { userId: PEOPLE.otherCustomer })).status).toBe(400)
    expect((await report(ON, 'customer', { kind: 'nonsense' })).status).toBe(400)
    expect(reports).toHaveLength(0)
  })

  test('the answer never carries the team’s names or reasons', async () => {
    const id = String((await report(ON)).body.data!.id)
    await call(`/admin/bypass-reports/${id}/dismiss`, 'superAdmin', { actorName: 'Lokesh', reason: 'Spoke to both; a misunderstanding' })
    const mine = await call('/users/me/bypass-reports', 'customer')
    const text = JSON.stringify(mine.body.data)
    expect(text).toContain('dismissed')
    for (const secret of ['Lokesh', 'misunderstanding', 'dismissedBy', 'dismissedReason', 'confirmedBy']) {
      expect(text).not.toContain(secret)
    }
  })

  test('a garage account and nobody signed in are refused', async () => {
    expect((await call('/users/me/bypass-reports', 'owner')).status).toBe(403)
    expect((await report(ON, 'owner')).status).toBe(403)
    expect((await call('/users/me/bypass-reports', null)).status).toBe(401)
  })
})

// ─── The garage ──────────────────────────────────────────────────────────────

describe('the garage: no way in, ever', () => {
  test('the garage portal has no route that mentions a report', () => {
    const paths = (vendorsRoutes as unknown as { routes: Array<{ path: string }> }).routes.map((r) => r.path)
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) expect(path).not.toContain('bypass')
  })

  test("a garage owner is refused every admin route", async () => {
    const id = String((await report(ON)).body.data!.id)
    const routes: Array<[string, unknown]> = [
      ['/admin/bypass-reports', undefined],
      [`/admin/bypass-reports/${id}`, undefined],
      [`/admin/bypass-reports/vendors/${GARAGE}`, undefined],
      ['/admin/bypass-reports/drop-off', undefined],
      [`/admin/bypass-reports/${id}/confirm`, { actorName: 'Owner' }],
      [`/admin/bypass-reports/${id}/dismiss`, { actorName: 'Owner', reason: 'Not true' }],
    ]
    for (const [path, body] of routes) {
      for (const who of ['owner', 'customer'] as const) {
        const { status } = await call(path, who, body)
        expect({ path, who, status }).toEqual({ path, who, status: 403 })
      }
      expect((await call(path, null, body)).status).toBe(401)
    }
    expect(reports[0]!.status).toBe('new')
    expect(ledger).toHaveLength(0)
  })
})

// ─── Admin ───────────────────────────────────────────────────────────────────

describe('admin: confirm rewards once per customer per garage', () => {
  test('a super-admin lists new reports with who made them; the break-glass login too', async () => {
    await report(ON)
    for (const who of ['superAdmin', 'breakGlass'] as const) {
      const { status, body } = await call('/admin/bypass-reports?show=new', who)
      expect(status).toBe(200)
      expect(body.data!.reports).toHaveLength(1)
      expect(body.data!.reports![0]).toMatchObject({
        status: 'new',
        kindLabel: 'Asked me to pay cash or UPI directly',
        customer: { name: 'Priya Raman' },
        garage: { id: GARAGE, strikes: 0 },
      })
    }
  })

  test('confirming adds ₹100 once; a second report about the same garage earns nothing more', async () => {
    const first = String((await report(ON)).body.data!.id)
    const second = String((await report(ALSO_DONE)).body.data!.id)

    const one = await call(`/admin/bypass-reports/${first}/confirm`, 'superAdmin', { actorName: 'Lokesh' })
    expect(one.status).toBe(200)
    // Signed by the session (0058): the typed name is ignored.
    expect(one.body.data).toMatchObject({ status: 'confirmed', confirmedBy: 'Signed-in Sam', reward: { status: 'granted' }, garage: { strikes: 1 } })
    expect(ledger).toEqual([{ userId: PEOPLE.customer, amountPaise: 10_000 }])

    const two = await call(`/admin/bypass-reports/${second}/confirm`, 'superAdmin', { actorName: 'Lokesh' })
    expect(two.body.data).toMatchObject({ status: 'confirmed', reward: { status: 'none' }, garage: { strikes: 2, highlighted: true } })
    expect(ledger).toHaveLength(1)
  })

  test('confirming twice is 409, and pays nothing twice', async () => {
    const id = String((await report(ON)).body.data!.id)
    expect((await call(`/admin/bypass-reports/${id}/confirm`, 'superAdmin', { actorName: 'Lokesh' })).status).toBe(200)
    const again = await call(`/admin/bypass-reports/${id}/confirm`, 'superAdmin', { actorName: 'Lokesh' })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('BYPASS_REPORT_ANSWERED')
    expect((await call(`/admin/bypass-reports/${id}/dismiss`, 'superAdmin', { actorName: 'Lokesh', reason: 'Changed mind' })).status).toBe(409)
    expect(ledger).toHaveLength(1)
  })

  test('submitting earns nothing: the reward waits for Detlio to confirm', async () => {
    await report(ON)
    expect(ledger).toHaveLength(0)
    expect(reports[0]!.rewardStatus).toBe('none')
  })

  test('while Detlio credit is off the reward is owed, not added', async () => {
    ;(env as unknown as Record<string, unknown>).giftsEnabled = false
    const id = String((await report(ON)).body.data!.id)
    const { body } = await call(`/admin/bypass-reports/${id}/confirm`, 'superAdmin', { actorName: 'Lokesh' })
    expect(body.data).toMatchObject({ reward: { status: 'owed' } })
    expect(ledger).toHaveLength(0)
  })

  test('dismissing needs a reason; a dismissed report is no strike', async () => {
    const id = String((await report(ON)).body.data!.id)
    expect((await call(`/admin/bypass-reports/${id}/dismiss`, 'superAdmin', { actorName: 'Lokesh' })).status).toBe(400)
    const { status, body } = await call(`/admin/bypass-reports/${id}/dismiss`, 'superAdmin', {
      actorName: 'Lokesh',
      reason: 'The customer asked the garage for its number',
    })
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ status: 'dismissed', reward: { status: 'none' }, garage: { strikes: 0 } })
    expect(audits.map((a) => a.action)).toEqual(['bypass_report_dismissed'])
  })

  test('an unknown report is a 404', async () => {
    const missing = 'e2e00000-0000-4000-8000-000000003299'
    expect((await call(`/admin/bypass-reports/${missing}`, 'superAdmin')).status).toBe(404)
    expect((await call(`/admin/bypass-reports/${missing}/confirm`, 'superAdmin', { actorName: 'Lokesh' })).status).toBe(404)
  })
})
