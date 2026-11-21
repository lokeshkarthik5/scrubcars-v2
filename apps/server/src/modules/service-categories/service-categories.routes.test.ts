/**
 * Settings → Services in Others (0080), through the real admin routes and
 * auth, with the repository stood in for (no database).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { membersRepository } = await import('../members/members.repository.js')
const { serviceCategoriesRepository } = await import('./service-categories.repository.js')

// E2E fixture range 7800–7849 (seeds/e2e-ids.ts), reused here as plain ids.
const OWNER = 'e2e00000-0000-4000-8000-000000007840'
const GARAGE = 'e2e00000-0000-4000-8000-000000007800'
const CLUTCH = 'e2e00000-0000-4000-8000-000000007811'
const ADD_ON = 'e2e00000-0000-4000-8000-000000007812'
const BINNED = 'e2e00000-0000-4000-8000-000000007813'
const NOBODY = 'e2e00000-0000-4000-8000-000000007849'

type Row = {
  id: string
  name: string
  category: string
  isAddon: boolean
  deleted: boolean
  vendorInBin: boolean
  categoryHintDismissedAt: Date | null
}
let rows: Map<string, Row>

const seed = () =>
  new Map<string, Row>([
    [CLUTCH, { id: CLUTCH, name: 'Clutch overhaul', category: 'others', isAddon: false, deleted: false, vendorInBin: false, categoryHintDismissedAt: null }],
    [ADD_ON, { id: ADD_ON, name: 'Helmet wash', category: 'others', isAddon: true, deleted: false, vendorInBin: false, categoryHintDismissedAt: null }],
    [BINNED, { id: BINNED, name: 'Brake pads', category: 'others', isAddon: false, deleted: false, vendorInBin: true, categoryHintDismissedAt: null }],
  ])

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  // The garage owner holds a garage seat and no platform row.
  patch(membersRepository, 'findActivePlatformRow', async () => undefined)
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) =>
    userId === OWNER ? [{ userId, vendorId: GARAGE, role: 'vendor_admin' }] : []
  )
  const r = serviceCategoriesRepository
  patch(r, 'listOthers', async () =>
    [...rows.values()]
      .filter((row) => row.category === 'others' && !row.isAddon && !row.deleted && !row.vendorInBin)
      .map((row) => ({
        id: row.id,
        name: row.name,
        vendorId: GARAGE,
        vendorName: 'Category Motors',
        pricingType: 'on_inspection',
        price: '499.00',
        priceHatchback: null,
        priceSedan: null,
        priceSuv: null,
        approxPrice: null,
        categoryHintDismissedAt: row.categoryHintDismissedAt,
      }))
  )
  patch(r, 'findService', async (id: string) => {
    const row = rows.get(id)
    return row && { id, vendorId: GARAGE, category: row.category, isAddon: row.isAddon, deleted: row.deleted, vendorInBin: row.vendorInBin }
  })
  patch(r, 'setCategory', async (id: string, from: string, to: string) => {
    const row = rows.get(id)
    if (!row || row.category !== from) return undefined
    row.category = to
    return { id, category: to }
  })
  patch(r, 'setHintDismissed', async (id: string, dismissed: boolean) => {
    const row = rows.get(id)
    if (!row) return undefined
    row.categoryHintDismissedAt = dismissed ? (row.categoryHintDismissedAt ?? new Date('2026-11-16T10:00:00Z')) : null
    return { id, categoryHintDismissedAt: row.categoryHintDismissedAt }
  })
})

beforeEach(() => {
  rows = seed()
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin', adminRoutes)

type Who = 'admin' | 'garage' | 'customer' | null
async function cookie(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const token =
    who === 'admin'
      ? await signAdminToken()
      : await signAccessToken({
          sub: OWNER,
          aud: who === 'customer' ? 'customer' : 'vendor',
          isCustomer: who === 'customer',
          isVendorOwner: who === 'garage',
        })
  return { Cookie: `access_token=${token}` }
}

async function call(method: string, path: string, who: Who, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(await cookie(who)),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: (await res.json()) as { data?: any; code?: string } }
}

const moveUrl = (id: string) => `/admin/service-categories/services/${id}/move`
const hintUrl = (id: string) => `/admin/service-categories/services/${id}/hint`

describe('admin only', () => {
  test('a garage, a customer and nobody are refused; nothing moves', async () => {
    for (const who of ['garage', 'customer'] as const) {
      expect((await call('GET', '/admin/service-categories/others', who)).status).toBe(403)
      expect((await call('POST', moveUrl(CLUTCH), who, { from: 'others', category: 'repairs' })).status).toBe(403)
      expect((await call('POST', hintUrl(CLUTCH), who, { dismissed: true })).status).toBe(403)
    }
    expect((await call('GET', '/admin/service-categories/others', null)).status).toBe(401)
    expect((await call('POST', moveUrl(CLUTCH), null, { from: 'others', category: 'repairs' })).status).toBe(401)
    expect(rows.get(CLUTCH)!.category).toBe('others')
    expect(rows.get(CLUTCH)!.categoryHintDismissedAt).toBeNull()
  })
})

describe('the list', () => {
  test("every garage's live plain services in Others, add-ons and binned garages left out", async () => {
    const { status, body } = await call('GET', '/admin/service-categories/others', 'admin')
    expect(status).toBe(200)
    expect(body.data.services).toEqual([
      expect.objectContaining({ id: CLUTCH, name: 'Clutch overhaul', vendorName: 'Category Motors', categoryHintDismissedAt: null }),
    ])
  })
})

describe('Move, and Undo', () => {
  test('moves at once, and Undo puts it back in Others', async () => {
    const moved = await call('POST', moveUrl(CLUTCH), 'admin', { from: 'others', category: 'repairs' })
    expect(moved.status).toBe(200)
    expect(moved.body.data).toEqual({ id: CLUTCH, category: 'repairs' })
    expect(rows.get(CLUTCH)!.category).toBe('repairs')
    expect((await call('GET', '/admin/service-categories/others', 'admin')).body.data.services).toEqual([])

    const undone = await call('POST', moveUrl(CLUTCH), 'admin', { from: 'repairs', category: 'others' })
    expect(undone.body.data).toEqual({ id: CLUTCH, category: 'others' })
    expect(rows.get(CLUTCH)!.category).toBe('others')
  })

  test('refused when someone changed it since the page loaded', async () => {
    rows.get(CLUTCH)!.category = 'detailing'
    const stale = await call('POST', moveUrl(CLUTCH), 'admin', { from: 'others', category: 'repairs' })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('CATEGORY_CHANGED')
    expect(rows.get(CLUTCH)!.category).toBe('detailing')
  })

  test('never an add-on, a package, a garage in the Bin or an unknown service', async () => {
    for (const id of [ADD_ON, BINNED, NOBODY]) {
      const res = await call('POST', moveUrl(id), 'admin', { from: 'others', category: 'repairs' })
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('SERVICE_NOT_FOUND')
    }
    expect(rows.get(ADD_ON)!.category).toBe('others')
    const pkg = await call('POST', moveUrl(CLUTCH), 'admin', { from: 'others', category: 'package' })
    expect(pkg.status).toBe(400)
    const odd = await call('POST', moveUrl(CLUTCH), 'admin', { from: 'others', category: 'repairs', extra: 1 })
    expect(odd.status).toBe(400)
  })
})

describe('Not this', () => {
  test('kept from the first time, and cleared to show it again', async () => {
    const first = await call('POST', hintUrl(CLUTCH), 'admin', { dismissed: true })
    expect(first.status).toBe(200)
    expect(first.body.data.categoryHintDismissedAt).toBe('2026-11-16T10:00:00.000Z')
    const again = await call('POST', hintUrl(CLUTCH), 'admin', { dismissed: true })
    expect(again.body.data.categoryHintDismissedAt).toBe('2026-11-16T10:00:00.000Z')
    const shown = await call('POST', hintUrl(CLUTCH), 'admin', { dismissed: false })
    expect(shown.body.data.categoryHintDismissedAt).toBeNull()
    expect(rows.get(CLUTCH)!.category).toBe('others')
  })
})
