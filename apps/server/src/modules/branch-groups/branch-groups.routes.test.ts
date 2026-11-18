/**
 * Branch groups (0081) through the real admin routes, auth and service, with
 * the database stood in for by a small in-memory one whose transaction rolls
 * back on a throw:
 *
 * - Link an existing garage and Remove from group, each one audit row; a
 *   group left with one garage is undone;
 * - change all branches: the preview, the save (only when it is the plan
 *   previewed, every write in one transaction, one audit row), the delete
 *   that skips a branch without the service, and admin only;
 * - "Add a branch" puts the source and the branch in one group;
 * - customers: the garage page's live branches and the cards' group line.
 *
 * The plan's rules themselves are unit-tested in lib/branch-groups.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { branchGroupsRepository } = await import('./branch-groups.repository.js')
const { branchGroupsService } = await import('./branch-groups.service.js')
const { citiesService } = await import('../cities/cities.service.js')
const { reviewsRepository } = await import('../reviews/reviews.repository.js')
const { slotAlertsService } = await import('../slot-alerts/slot-alerts.service.js')
const { adminRepository } = await import('../admin/admin.repository.js')
const { adminService } = await import('../admin/admin.service.js')
const { vendorsRepository } = await import('../vendors/vendors.repository.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ANNA = id(9001)
const VEL = id(9002)
const OMR = id(9003)
const TNAGAR = id(9004)
const LONE = id(9005)
const OTHER_A = id(9006)
const OTHER_B = id(9007)
const GROUP = id(9100)
const OTHER_GROUP = id(9101)

type Garage = {
  id: string
  businessName: string
  groupId: string | null
  deletedAt: Date | null
  purgedAt: Date | null
  status: string
  isVerified: boolean
  bookingsPausedAt: Date | null
  createdAt: Date
}
type Service = {
  id: string
  vendorId: string
  name: string
  price: string
  isActive: boolean
  deletedAt: Date | null
  [key: string]: unknown
}

let garages: Garage[] = []
let groups: Array<{ id: string; name: string }> = []
let services: Service[] = []
let audits: Array<Record<string, unknown>> = []
let newIds = 0

const day = (n: number) => new Date(Date.UTC(2026, 9, n))
const garage = (gid: string, businessName: string, groupId: string | null, created: number, over: Partial<Garage> = {}): Garage => ({
  id: gid, businessName, groupId, deletedAt: null, purgedAt: null, status: 'active', isVerified: true,
  bookingsPausedAt: null, createdAt: day(created), ...over,
})
const service = (sid: string, vendorId: string, name: string, price: string, over: Partial<Service> = {}): Service => ({
  id: sid, vendorId, name, description: null, category: 'car_wash', pricingType: 'flat', price, priceHatchback: null,
  priceSedan: null, priceSuv: null, approxPrice: null, durationMins: 45, commissionRate: null, isActive: true,
  deletedAt: null, ...over,
})

function reset() {
  garages = [
    garage(ANNA, 'Shine Auto Spa – Anna Nagar', GROUP, 1),
    garage(VEL, 'Shine Auto Spa – Velachery', GROUP, 2),
    garage(OMR, 'Shine Auto Spa – OMR', GROUP, 3, { bookingsPausedAt: day(10) }),
    garage(TNAGAR, 'Shine Auto Spa – T. Nagar', GROUP, 4, { status: 'pending', isVerified: false }),
    garage(LONE, 'Lone Car Care', null, 5),
    garage(OTHER_A, 'Velan Car Care – Adyar', OTHER_GROUP, 6),
    garage(OTHER_B, 'Velan Car Care – Porur', OTHER_GROUP, 7),
  ]
  groups = [
    { id: GROUP, name: 'Shine Auto Spa' },
    { id: OTHER_GROUP, name: 'Velan Car Care' },
  ]
  services = [
    service(id(9201), ANNA, 'Foam wash', '499.00'),
    service(id(9202), VEL, 'Foam wash', '499.00'),
    service(id(9203), OMR, 'foam wash', '529.00'),
    service(id(9204), TNAGAR, 'Foam wash', '499.00'),
    service(id(9205), VEL, 'Bike wash', '199.00'),
    service(id(9206), ANNA, 'Bike wash', '199.00'),
    // Another business's Foam wash: never touched.
    service(id(9207), OTHER_A, 'Foam wash', '450.00'),
    service(id(9208), LONE, 'Foam wash', '450.00'),
  ]
  audits = []
}

const tx = {} as never
const originals: Array<[Record<string, unknown>, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Record<string, unknown>
  originals.push([object, key, object[key]])
  object[key] = value
}

const pick = (row: Garage) => ({ id: row.id, businessName: row.businessName, groupId: row.groupId, deletedAt: row.deletedAt, purgedAt: row.purgedAt })
const live = (row: Garage) => row.status === 'active' && row.isVerified && !row.bookingsPausedAt && !row.deletedAt

beforeAll(() => {
  patch(branchGroupsRepository, 'inTransaction', async (work: (t: never) => Promise<unknown>) => {
    const snapshot = structuredClone({ garages, groups, services, audits })
    try {
      return await work(tx)
    } catch (error) {
      ;({ garages, groups, services, audits } = snapshot)
      throw error
    }
  })
  patch(branchGroupsRepository, 'findGarage', async (gid: string) => {
    const row = garages.find((g) => g.id === gid)
    return row ? pick(row) : null
  })
  patch(branchGroupsRepository, 'lockGarages', async (ids: string[]) =>
    garages.filter((g) => ids.includes(g.id)).map(pick)
  )
  patch(branchGroupsRepository, 'findGroup', async (gid: string) => groups.find((g) => g.id === gid) ?? null)
  patch(branchGroupsRepository, 'listGroupGarages', async (gid: string) =>
    garages
      .filter((g) => g.groupId === gid && !g.deletedAt && !g.purgedAt)
      .sort((a, b) => +a.createdAt - +b.createdAt)
      .map((g) => ({ ...g, address: `1, Main Road, ${g.businessName}`, pincode: '600001', showWhenCityOff: false, cityId: null }))
  )
  patch(branchGroupsRepository, 'countGroupMembers', async (gid: string) => garages.filter((g) => g.groupId === gid).length)
  patch(branchGroupsRepository, 'listPlainServices', async (ids: string[]) =>
    services.filter((s) => ids.includes(s.vendorId) && !s.deletedAt).map(({ deletedAt: _d, ...s }) => s)
  )
  patch(branchGroupsRepository, 'listPackagesHolding', async () => [])
  patch(branchGroupsRepository, 'createGroup', async (name: string) => {
    const gid = id(9300 + ++newIds)
    groups.push({ id: gid, name })
    return gid
  })
  patch(branchGroupsRepository, 'setGroup', async (ids: string[], gid: string | null) => {
    for (const g of garages) if (ids.includes(g.id)) g.groupId = gid
  })
  patch(branchGroupsRepository, 'dissolveGroup', async (gid: string) => {
    for (const g of garages) if (g.groupId === gid) g.groupId = null
    groups = groups.filter((g) => g.id !== gid)
  })
  patch(branchGroupsRepository, 'updateService', async (sid: string, vendorId: string, columns: Record<string, unknown>) => {
    const row = services.find((s) => s.id === sid && s.vendorId === vendorId && !s.deletedAt)
    if (row) Object.assign(row, columns)
  })
  patch(branchGroupsRepository, 'insertServices', async (rows: Array<Record<string, unknown>>) => {
    for (const row of rows) {
      services.push({ ...(row as Service), id: id(9400 + ++newIds), isActive: true, deletedAt: null })
    }
  })
  patch(branchGroupsRepository, 'markServicesDeleted', async (rows: Array<{ serviceId: string }>) => {
    for (const row of rows) {
      const found = services.find((s) => s.id === row.serviceId)!
      found.isActive = false
      found.deletedAt = new Date()
    }
  })
  patch(branchGroupsRepository, 'setHintsDismissed', async (ids: string[], vendorId: string, dismissed: boolean) => {
    for (const row of services) {
      if (ids.includes(row.id) && row.vendorId === vendorId) row.categoryHintDismissed = dismissed
    }
  })
  patch(branchGroupsRepository, 'insertAudit', async (row: Record<string, unknown>) => {
    audits.push(row)
  })
  patch(branchGroupsRepository, 'listLiveBranches', async (gid: string) => {
    const me = garages.find((g) => g.id === gid)
    return garages
      .filter((g) => me?.groupId && g.groupId === me.groupId && g.id !== gid && live(g))
      .map((g) => ({ id: g.id, businessName: g.businessName, lat: 13, lng: 80.2 }))
  })
  patch(branchGroupsRepository, 'listCardGroups', async (ids: string[]) =>
    garages
      .filter((g) => ids.includes(g.id) && g.groupId)
      .map((g) => ({
        vendorId: g.id,
        groupName: groups.find((group) => group.id === g.groupId)!.name,
        liveCount: garages.filter((other) => other.groupId === g.groupId && live(other)).length,
      }))
      .filter((row) => row.liveCount > 0)
  )
  patch(citiesService, 'rules', async () => ({
    cities: [],
    otherTownsVisible: true,
    standingOf: () => ({ city: null, cityShown: true, hiddenReason: null }),
  }))
  patch(reviewsRepository, 'ratingAggregates', async () => [{ vendorId: ANNA, average: 4.6, count: 212 }])
  patch(reviewsRepository, 'tagCounts', async () => [])
  patch(slotAlertsService, 'garageChanged', () => undefined)
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

beforeEach(reset)

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin', adminRoutes)

async function call(method: string, path: string, body?: unknown, signedIn = true) {
  const res = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(signedIn && { Cookie: `access_token=${await signAdminToken()}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: (await res.json()) as { code?: string; message?: string; data?: any } }
}

const foamAt549 = { name: 'Foam wash', category: 'car_wash', pricingType: 'flat', price: 549, durationMins: 45, commissionRate: null }
const underbody = { name: 'Underbody wash', category: 'car_wash', pricingType: 'flat', price: 249, durationMins: 30, commissionRate: null }
const saveChange = {
  kind: 'save',
  changed: [{ serviceId: id(9202), fields: ['price'], service: foamAt549 }],
  added: [underbody],
}

describe('the Branches card', () => {
  test('the group, its count and each branch with its state, the main one first', async () => {
    const res = await call('GET', `/admin/vendors/${VEL}/branches`)
    expect(res.status).toBe(200)
    expect(res.body.data.group).toEqual({ id: GROUP, name: 'Shine Auto Spa', count: 4 })
    expect(
      res.body.data.branches.map((b: any) => [b.label, b.state, b.isMain, b.isCurrent, b.rating, b.reviewCount])
    ).toEqual([
      ['Anna Nagar', 'live', true, false, 4.6, 212],
      ['Velachery', 'live', false, true, null, 0],
      ['OMR', 'paused', false, false, null, 0],
      ['T. Nagar', 'not_live', false, false, null, 0],
    ])
  })

  test('a garage in no group has none', async () => {
    const res = await call('GET', `/admin/vendors/${LONE}/branches`)
    expect(res.body.data).toEqual({ group: null, branches: [] })
  })

  test('admin only', async () => {
    expect((await call('GET', `/admin/vendors/${VEL}/branches`, undefined, false)).status).toBe(401)
    expect((await call('POST', `/admin/vendors/${VEL}/branches/link`, { vendorId: LONE }, false)).status).toBe(401)
    expect((await call('POST', `/admin/vendors/${VEL}/branches/services/preview`, { change: saveChange }, false)).status).toBe(401)
    expect((await call('POST', `/admin/vendors/${VEL}/branches/services`, { change: saveChange, key: 'a'.repeat(32) }, false)).status).toBe(401)
    expect(services.find((s) => s.id === id(9202))!.price).toBe('499.00')
  })
})

describe('Link an existing garage and Remove from group', () => {
  test('a garage in no group joins this one, with one audit row', async () => {
    const res = await call('POST', `/admin/vendors/${VEL}/branches/link`, { vendorId: LONE })
    expect(res.status).toBe(200)
    expect(garages.find((g) => g.id === LONE)!.groupId).toBe(GROUP)
    expect(res.body.data.group.count).toBe(5)
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'garage_branch_linked',
        actorName: 'admin',
        summary: expect.objectContaining({ vendorId: LONE, groupId: GROUP, toVendorId: VEL }),
        detail: { groupCreated: false, fromGroupId: null, previousGroupDissolved: false },
      }),
    ])
  })

  test('from a garage in no group: the group is made, named after it without the area', async () => {
    garages.find((g) => g.id === LONE)!.businessName = 'Lone Car Care – Guindy'
    await call('POST', `/admin/vendors/${LONE}/branches/link`, { vendorId: OTHER_A })
    const lone = garages.find((g) => g.id === LONE)!
    expect(lone.groupId).not.toBeNull()
    expect(groups.find((g) => g.id === lone.groupId)!.name).toBe('Lone Car Care')
    expect(garages.find((g) => g.id === OTHER_A)!.groupId).toBe(lone.groupId)
    // Velan Car Care is left with one garage: no group any more.
    expect(groups.some((g) => g.id === OTHER_GROUP)).toBe(false)
    expect(garages.find((g) => g.id === OTHER_B)!.groupId).toBeNull()
    expect(audits[0]!.detail).toEqual({ groupCreated: true, fromGroupId: OTHER_GROUP, previousGroupDissolved: true })
  })

  test('refused: itself, one already here, one in the Bin', async () => {
    expect((await call('POST', `/admin/vendors/${VEL}/branches/link`, { vendorId: VEL })).body.code).toBe('BRANCH_SELF')
    expect((await call('POST', `/admin/vendors/${VEL}/branches/link`, { vendorId: ANNA })).body.code).toBe('ALREADY_IN_GROUP')
    garages.find((g) => g.id === LONE)!.deletedAt = new Date()
    expect((await call('POST', `/admin/vendors/${VEL}/branches/link`, { vendorId: LONE })).body.code).toBe('VENDOR_IN_BIN')
    expect(audits).toEqual([])
  })

  test('Remove from group: the link goes, nothing else', async () => {
    const res = await call('POST', `/admin/vendors/${VEL}/branches/remove`, { vendorId: TNAGAR })
    expect(res.status).toBe(200)
    expect(garages.find((g) => g.id === TNAGAR)!.groupId).toBeNull()
    expect(res.body.data.group.count).toBe(3)
    expect(services.filter((s) => s.vendorId === TNAGAR)).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'garage_branch_unlinked', detail: { groupDissolved: false } })
  })

  test('a group left with one garage is undone', async () => {
    await call('POST', `/admin/vendors/${OTHER_A}/branches/remove`, { vendorId: OTHER_B })
    expect(groups.some((g) => g.id === OTHER_GROUP)).toBe(false)
    expect(garages.find((g) => g.id === OTHER_A)!.groupId).toBeNull()
    expect((await call('GET', `/admin/vendors/${OTHER_A}/branches`)).body.data.group).toBeNull()
  })

  test('only a garage of this group can be removed from it', async () => {
    expect((await call('POST', `/admin/vendors/${VEL}/branches/remove`, { vendorId: OTHER_A })).body.code).toBe('NOT_IN_GROUP')
  })
})

describe('change all branches at once', () => {
  test('the preview equals the save, and only the group’s services change', async () => {
    const preview = await call('POST', `/admin/vendors/${VEL}/branches/services/preview`, { change: saveChange })
    expect(preview.status).toBe(200)
    // Nothing written by a preview.
    expect(services.find((s) => s.id === id(9201))!.price).toBe('499.00')
    expect(audits).toEqual([])
    const foam = preview.body.data.items[0]
    expect(foam.lines.map((l: any) => [l.branch, l.before.price, l.after.price, l.wasDifferent])).toEqual([
      ['Anna Nagar', 499, 549, false],
      ['Velachery', 499, 549, false],
      ['OMR', 529, 549, true],
      ['T. Nagar', 499, 549, false],
    ])
    expect(preview.body.data.items[1].lines.every((l: any) => l.action === 'add')).toBe(true)

    const saved = await call('POST', `/admin/vendors/${VEL}/branches/services`, { change: saveChange, key: preview.body.data.key })
    expect(saved.status).toBe(200)
    expect(saved.body.data).toEqual(preview.body.data)
    expect(services.filter((s) => s.name.toLowerCase() === 'foam wash').map((s) => [s.vendorId, s.price])).toEqual([
      [ANNA, '549.00'],
      [VEL, '549.00'],
      [OMR, '549.00'],
      [TNAGAR, '549.00'],
      // Other businesses' Foam wash: as they were.
      [OTHER_A, '450.00'],
      [LONE, '450.00'],
    ])
    expect(services.filter((s) => s.name === 'Underbody wash').map((s) => s.vendorId)).toEqual([ANNA, VEL, OMR, TNAGAR])
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'garage_services_saved_all_branches',
        actorName: 'admin',
        summary: { vendorId: VEL, groupId: GROUP, branches: 4 },
        detail: expect.objectContaining({ updated: 4, added: 4, deleted: 0 }),
      }),
    ])
  })

  test('a “Not this” on a hint stays this garage’s own', async () => {
    const change = {
      ...saveChange,
      changed: [
        ...saveChange.changed,
        { serviceId: id(9205), fields: [], service: { ...foamAt549, name: 'Bike wash', price: 199, categoryHintDismissed: true } },
      ],
    }
    const preview = await call('POST', `/admin/vendors/${VEL}/branches/services/preview`, { change })
    // Nothing in the plan for it: it reaches no other branch.
    expect(preview.body.data.items.map((item: any) => item.name)).toEqual(['Foam wash', 'Underbody wash'])
    const saved = await call('POST', `/admin/vendors/${VEL}/branches/services`, { change, key: preview.body.data.key })
    expect(saved.status).toBe(200)
    expect(services.find((s) => s.id === id(9205))!.categoryHintDismissed).toBe(true)
    expect(services.find((s) => s.id === id(9206))!.categoryHintDismissed).toBeUndefined()
    expect(services.find((s) => s.id === id(9205))!.price).toBe('199.00')
  })

  test('refused, with nothing written, when the branches changed since the preview', async () => {
    const preview = await call('POST', `/admin/vendors/${VEL}/branches/services/preview`, { change: saveChange })
    services.find((s) => s.id === id(9204))!.price = '519.00'
    const saved = await call('POST', `/admin/vendors/${VEL}/branches/services`, { change: saveChange, key: preview.body.data.key })
    expect(saved).toMatchObject({ status: 409, body: { code: 'BRANCH_PLAN_CHANGED' } })
    expect(services.find((s) => s.id === id(9202))!.price).toBe('499.00')
    expect(services.some((s) => s.name === 'Underbody wash')).toBe(false)
    expect(audits).toEqual([])
  })

  test('delete: at every branch that has it, skipped where it does not', async () => {
    const change = { kind: 'delete', serviceId: id(9205) }
    const preview = await call('POST', `/admin/vendors/${VEL}/branches/services/preview`, { change })
    expect(preview.body.data.items[0].lines.map((l: any) => [l.branch, l.action])).toEqual([
      ['Anna Nagar', 'delete'],
      ['Velachery', 'delete'],
      ['OMR', 'skip'],
      ['T. Nagar', 'skip'],
    ])
    const saved = await call('POST', `/admin/vendors/${VEL}/branches/services`, { change, key: preview.body.data.key })
    expect(saved.status).toBe(200)
    expect(services.filter((s) => s.deletedAt).map((s) => s.id).sort()).toEqual([id(9205), id(9206)])
    expect(audits[0]).toMatchObject({ action: 'garage_services_deleted_all_branches', detail: { deleted: 2, added: 0 } })
  })

  test('a garage in no group is told to save for this branch only', async () => {
    const res = await call('POST', `/admin/vendors/${LONE}/branches/services/preview`, {
      change: { kind: 'delete', serviceId: id(9208) },
    })
    expect(res).toMatchObject({ status: 409, body: { code: 'NOT_IN_GROUP' } })
  })

  test('each service is held to the editor’s own price rules', async () => {
    const res = await call('POST', `/admin/vendors/${VEL}/branches/services/preview`, {
      change: { kind: 'save', changed: [], added: [{ ...underbody, price: 0 }] },
    })
    expect(res.status).toBe(400)
  })
})

describe('Add a branch puts the source and the branch in one group', () => {
  test('the group is the source’s business without its area', async () => {
    const plans: Array<Record<string, any>> = []
    patch(adminRepository, 'findVendorById', async () => ({
      id: VEL, ownerId: id(9500), businessName: 'Shine Auto Spa – Velachery', dropinEnabled: false, phone: '9000009500',
      whatsapp: null, email: null, deletedAt: null, purgedAt: null, pickup: 'no', pickupTermsAcceptedAt: null,
      pickupTermsAcceptedBy: null, logoUrl: null, logoStorageKey: null, vehicleTypes: [],
    }))
    patch(vendorsRepository, 'listServices', async () => [])
    patch(vendorsRepository, 'listAddOns', async () => [])
    patch(vendorsRepository, 'listPackages', async () => [])
    patch(adminRepository, 'findUserByPhone', async () => ({ id: id(9500), isVendorOwner: true }))
    patch(adminRepository, 'createBranch', async (plan: Record<string, any>) => {
      plans.push(plan)
      return { id: id(9600), ownerId: id(9500), groupId: GROUP, groupCreated: false }
    })
    await adminService.createBranch(
      VEL,
      { businessName: 'Shine Auto Spa – T. Nagar', city: 'Chennai', address: '', pincode: '', serviceIds: [],
        copyHours: false, copyPhotos: false, ownerPhone: '9000009500', actorName: 'admin' },
      { sub: 'admin', name: 'admin' }
    )
    expect(plans[0]!.source).toEqual({ id: VEL, groupName: 'Shine Auto Spa' })
  })
})

describe('customers', () => {
  test('the garage page lists the other live branches only, by area', async () => {
    expect(await branchGroupsService.liveBranchesOf(VEL)).toEqual([{ id: ANNA, name: 'Anna Nagar', lat: 13, lng: 80.2 }])
    expect(await branchGroupsService.liveBranchesOf(LONE)).toEqual([])
  })

  test('a card says its group only when two or more branches are live', async () => {
    const groupsOf = await branchGroupsService.cardGroupsOf([ANNA, VEL, LONE])
    expect(groupsOf.get(ANNA)).toEqual({ name: 'Shine Auto Spa', liveCount: 2 })
    expect(groupsOf.get(LONE)).toBeUndefined()
    garages.find((g) => g.id === VEL)!.bookingsPausedAt = new Date()
    expect((await branchGroupsService.cardGroupsOf([ANNA])).get(ANNA)).toBeUndefined()
  })
})
