/**
 * Coverage, part 3 (0064) through the real admin routes and auth: demand
 * per zone and the Hot flag in the overview, customer recommendations
 * (duplicates, Make lead, link to a lead, Dismiss), the recommendation
 * following its lead to a garage (Onboard, the garage link, unlinking,
 * removing the lead; once its credit is decided, never again), and the
 * zone removal guard. The repositories are stood in for by memory (no
 * database); the rules are the real ones.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { personalAdminSubject } = await import('../../lib/admin-actor.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { adminLoginsRepository } =
  await import('../admin-logins/admin-logins.repository.js')
const { leadsRepository } = await import('../leads/leads.repository.js')
const { leadsService } = await import('../leads/leads.service.js')
const { coverageRepository } = await import('./coverage.repository.js')
const { bookingRequestsRepository } =
  await import('../booking-requests/booking-requests.repository.js')
const { areaSignupsRepository } =
  await import('../area-signups/area-signups.repository.js')

type Lead = Awaited<ReturnType<typeof leadsRepository.listAll>>[number]
type Rec = Awaited<ReturnType<typeof leadsRepository.listRecommendations>>[number]
type Zone = Awaited<ReturnType<typeof coverageRepository.listZones>>[number]

const RAGA = 'e2e00000-0000-4000-8000-000000005901'
const PERAMBUR = 'e2e00000-0000-4000-8000-000000005911'
const ADYAR = 'e2e00000-0000-4000-8000-000000005912'
const EGMORE = 'e2e00000-0000-4000-8000-000000005913'
const GARAGE = 'e2e00000-0000-4000-8000-000000005921'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000005922'
const CUSTOMER = 'e2e00000-0000-4000-8000-000000005931'

const PERAMBUR_CENTRE = { lat: 13.1167, lng: 80.2333 }

let zones: Zone[] = []
const leads = new Map<string, Lead>()
const recs = new Map<string, Rec>()
let signups: Array<{
  zoneId: string
  freeWash: boolean
  discountId: string | null
}> = []
let requestFacts: Array<{
  zoneSlug: string | null
  status: string
  reply: string | null
}> = []
let nextId = 1
const newId = () =>
  `e2e00000-0000-4000-8000-${String(950000 + nextId++).padStart(12, '0')}`

const zone = (
  id: string,
  slug: string,
  name: string,
  lat: number,
  lng: number,
  liveAt: Date | null = null
): Zone => ({
  id,
  slug,
  name,
  lat,
  lng,
  priority: false,
  target: 5,
  liveAt,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const garages = [
  {
    id: GARAGE,
    businessName: 'Kolathur Shine',
    phone: '9000005921',
    whatsapp: null,
    lat: 13.2,
    lng: 80.5,
    status: 'pending',
    isVerified: false,
    bookingsPausedAt: null,
    deletedAt: null,
  },
]

function fullLead(values: Partial<Lead>): Lead {
  return {
    id: newId(),
    name: null,
    phone: null,
    address: null,
    mapsUrl: null,
    lat: null,
    lng: null,
    pinSource: null,
    zoneId: null,
    source: 'manual',
    status: 'to_target',
    notInterestedReason: null,
    notInterestedOn: null,
    retryAfter: null,
    assignedLoginId: null,
    assignedName: null,
    lastNote: null,
    lastNoteBy: null,
    lastNoteAt: null,
    vendorId: null,
    onboardedAt: null,
    googlePlaceId: null,
    olaPlaceId: null,
    googleName: null,
    googlePhone: null,
    googleAddress: null,
    googleRating: null,
    googleReviewCount: null,
    googleFetchedAt: null,
    createdByName: 'seed',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...values,
  } as Lead
}

function fullRec(values: Partial<Rec>): Rec {
  return {
    id: newId(),
    userId: CUSTOMER,
    zoneId: PERAMBUR,
    name: 'Kolathur Shine',
    mapsLink: null,
    phone: '9000005060',
    why: 'Careful with my old car',
    status: 'new',
    vendorId: null,
    creditStatus: null,
    creditAmount: null,
    creditEntryId: null,
    creditBookingId: null,
    creditedAt: null,
    leadId: null,
    handledBy: null,
    handledAt: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
    ...values,
  } as Rec
}

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

/** What a lead's row lock reads instead of the stored row (a change meanwhile), and the connections it was taken on. */
const lockedLead = new Map<string, Lead>()
let lockedWith: unknown[] = []
let handledWith: unknown
let zoneRequests = new Map<string, number>()
let deleteAnswer: 'deleted' | 'in_use' | 'missing' | null = null

beforeAll(() => {
  patch(adminLoginsRepository, 'findSession', async (id: string) =>
    id === RAGA
      ? {
          id,
          username: 'raga',
          name: 'Raga',
          status: 'active',
          isOwner: false,
          sessionsFrom: new Date('2026-01-01'),
        }
      : undefined
  )
  const l = leadsRepository
  patch(l, 'transaction', async (work: (tx: unknown) => Promise<unknown>) =>
    work({})
  )
  patch(l, 'listAll', async () => [...leads.values()])
  patch(l, 'findById', async (id: string) => leads.get(id))
  // The lead as its row lock reads it: the stored row, unless a test says
  // what a lead became meanwhile (after the plain read).
  patch(l, 'lockById', async (id: string, conn: unknown) => {
    lockedWith.push(conn)
    return lockedLead.get(id) ?? leads.get(id)
  })
  patch(l, 'findByVendor', async (vendorId: string) =>
    [...leads.values()].find((lead) => lead.vendorId === vendorId)
  )
  patch(l, 'insert', async (rows: Partial<Lead>[]) =>
    rows.map((row) => {
      const lead = fullLead(row)
      leads.set(lead.id, lead)
      return lead
    })
  )
  patch(l, 'update', async (id: string, values: Partial<Lead>) => {
    const lead = leads.get(id)
    if (!lead) return undefined
    const next = { ...lead, ...values }
    leads.set(id, next)
    return next
  })
  patch(l, 'remove', async (id: string) => {
    const removed = leads.delete(id)
    // ON DELETE SET NULL
    for (const rec of recs.values())
      if (rec.leadId === id) recs.set(rec.id, { ...rec, leadId: null })
    return removed
  })
  patch(l, 'markOnboarded', async (id: string, vendorId: string, now: Date) => {
    const lead = leads.get(id)
    if (!lead || lead.vendorId) return false
    leads.set(id, { ...lead, vendorId, status: 'onboarded', onboardedAt: now })
    return true
  })
  patch(l, 'listZones', async () =>
    zones.map(({ id, name, lat, lng }) => ({ id, name, lat, lng }))
  )
  patch(l, 'listGaragesForMatch', async () => garages)
  patch(l, 'findGarage', async (id: string) =>
    id === GARAGE || id === OTHER_GARAGE
      ? { id, deletedAt: null, purgedAt: null }
      : undefined
  )
  patch(l, 'findActiveLogin', async () => undefined)
  patch(
    l,
    'countInZone',
    async (zoneId: string) =>
      [...leads.values()].filter((lead) => lead.zoneId === zoneId).length
  )
  patch(l, 'listPinned', async () => [])
  patch(l, 'setZones', async () => undefined)
  patch(l, 'listRecommendations', async () => [...recs.values()])
  patch(l, 'findRecommendation', async (id: string) => recs.get(id))
  patch(
    l,
    'countRecommendationsInZone',
    async (zoneId: string) =>
      [...recs.values()].filter((rec) => rec.zoneId === zoneId).length
  )
  // The repository's own conditions, in memory: only a new one is handled.
  patch(
    l,
    'handleRecommendation',
    async (
      id: string,
      values: {
        status: Rec['status']
        leadId: string | null
        handledBy: string
        now: Date
      },
      conn?: unknown
    ) => {
      handledWith = conn
      const rec = recs.get(id)
      if (!rec || rec.status !== 'new') return undefined
      const next = {
        ...rec,
        status: values.status,
        leadId: values.leadId,
        handledBy: values.handledBy,
        handledAt: values.now,
      }
      recs.set(id, next)
      return next
    }
  )
  patch(l, 'lockRecommendationsOfLead', async (leadId: string) =>
    [...recs.values()]
      .filter((rec) => rec.leadId === leadId)
      .map(({ id, status, vendorId, creditStatus }) => ({
        id,
        status,
        vendorId,
        creditStatus,
      }))
  )
  patch(
    l,
    'setRecommendationGarages',
    async (
      changes: Array<{ id: string; vendorId: string | null; status: Rec['status'] }>
    ) => {
      let changed = 0
      for (const change of changes) {
        const rec = recs.get(change.id)
        if (!rec || rec.creditStatus !== null) continue
        recs.set(rec.id, { ...rec, ...change })
        changed++
      }
      return changed
    }
  )
  patch(l, 'reopenRecommendationsOfLead', async (leadId: string) => {
    let reopened = 0
    for (const rec of recs.values()) {
      if (rec.leadId !== leadId || rec.vendorId || rec.creditStatus) continue
      recs.set(rec.id, {
        ...rec,
        status: 'new',
        leadId: null,
        handledBy: null,
        handledAt: null,
      })
      reopened++
    }
    return reopened
  })

  const c = coverageRepository
  patch(c, 'listZones', async () => [...zones])
  patch(c, 'findZone', async (id: string) => zones.find((z) => z.id === id))
  patch(c, 'updateZone', async (id: string, values: Partial<Zone>) => {
    const at = zones.findIndex((z) => z.id === id)
    if (at === -1) return undefined
    zones[at] = { ...zones[at]!, ...values }
    return zones[at]
  })
  patch(c, 'deleteZone', async (id: string) => {
    if (deleteAnswer) return deleteAnswer
    const before = zones.length
    zones = zones.filter((z) => z.id !== id)
    return zones.length < before ? 'deleted' : 'missing'
  })
  patch(c, 'listGarages', async () => garages)
  patch(c, 'listSignups', async () => signups)
  patch(
    c,
    'countSignupsInZone',
    async (zoneId: string) => signups.filter((s) => s.zoneId === zoneId).length
  )
  patch(c, 'transaction', async (work: (tx: unknown) => Promise<unknown>) =>
    work({})
  )
  patch(bookingRequestsRepository, 'listLatestSince', async () => requestFacts)
  patch(
    bookingRequestsRepository,
    'countInZone',
    async (slug: string) => zoneRequests.get(slug) ?? 0
  )
  patch(areaSignupsRepository, 'unusedDiscounts', async (ids: string[]) =>
    ids.map((id) => ({
      id,
      code: 'FW-TEST',
      amountOff: '499.00',
      endsAt: new Date(Date.now() + 86_400_000),
      isActive: true,
      held: id === 'used' ? 1 : 0,
    }))
  )
})

beforeEach(() => {
  zones = [
    zone(ADYAR, 'adyar', 'Adyar', 13.0012, 80.2565),
    zone(EGMORE, 'egmore', 'Egmore', 13.0732, 80.2609, new Date('2026-10-01')),
    zone(PERAMBUR, 'perambur', 'Perambur', PERAMBUR_CENTRE.lat, PERAMBUR_CENTRE.lng),
  ]
  leads.clear()
  recs.clear()
  lockedLead.clear()
  lockedWith = []
  signups = []
  requestFacts = []
  zoneRequests = new Map()
  deleteAnswer = null
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json(
        { success: false, message: err.message, code: err.code },
        err.statusCode as 400
      )
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin', adminRoutes)

async function call(
  method: string,
  path: string,
  token: string | null,
  body?: unknown
) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(token ? { Cookie: `access_token=${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return {
    status: res.status,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: (await res.json()) as { data?: any; code?: string; message?: string },
  }
}

const raga = () => signAdminToken(personalAdminSubject(RAGA))

describe('demand per zone in the overview', () => {
  test('waiting, free washes held, requests sent and failed, recommendations; Hot by the rule', async () => {
    signups = [
      ...Array.from({ length: 12 }, () => ({
        zoneId: PERAMBUR,
        freeWash: true,
        discountId: null,
      })),
      { zoneId: ADYAR, freeWash: true, discountId: null },
      // Egmore is live: codes issued, one used.
      { zoneId: EGMORE, freeWash: true, discountId: 'unused' },
      { zoneId: EGMORE, freeWash: true, discountId: 'used' },
    ]
    requestFacts = [
      { zoneSlug: 'perambur', status: 'pending', reply: null },
      { zoneSlug: 'perambur', status: 'expired', reply: null },
      { zoneSlug: 'perambur', status: 'declined', reply: 'declined' },
      { zoneSlug: 'perambur', status: 'expired', reply: 'accepted' },
      { zoneSlug: null, status: 'expired', reply: null },
    ]
    recs.set('r1', fullRec({ id: 'r1' }))
    recs.set('r2', fullRec({ id: 'r2', status: 'declined' }))

    expect((await call('GET', '/admin/coverage', null)).status).toBe(401)
    const { status, body } = await call('GET', '/admin/coverage', await raga())
    expect(status).toBe(200)
    const byZone = Object.fromEntries(
      body.data.demand.map((d: { zoneId: string }) => [d.zoneId, d])
    )
    expect(byZone[PERAMBUR]).toEqual({
      zoneId: PERAMBUR,
      waiting: 12,
      signups: 12,
      unusedFreeWashes: 12,
      requests: 4,
      openRequests: 1,
      failedRequests: 2,
      recommendations: 2,
      newRecommendations: 1,
      score: 14,
      hot: true,
    })
    expect(byZone[ADYAR]).toMatchObject({ waiting: 1, score: 1, hot: false })
    expect(byZone[EGMORE]).toMatchObject({
      waiting: 0,
      signups: 2,
      unusedFreeWashes: 1,
      hot: false,
    })
    expect(body.data.hotRule).toEqual({ top: 3, minScore: 10, requestDays: 30 })
    // Dismissed ones are not listed; nobody's identity ever is.
    expect(body.data.recommendations).toHaveLength(1)
    expect(body.data.recommendations[0]).toEqual({
      id: 'r1',
      zoneId: PERAMBUR,
      name: 'Kolathur Shine',
      phone: '9000005060',
      mapsLink: null,
      why: 'Careful with my old car',
      status: 'new',
      leadId: null,
      vendorId: null,
      handledBy: null,
      handledAt: null,
      createdAt: '2026-10-20T10:00:00.000Z',
    })
    expect(JSON.stringify(body.data)).not.toContain(CUSTOMER)
  })
})

describe('Make lead from a recommendation', () => {
  test('a new lead (customer, pinned from the link), the recommendation taken on by the signed name; once', async () => {
    recs.set(
      'r1',
      fullRec({
        id: 'r1',
        mapsLink: 'https://www.google.com/maps/@13.1180,80.2340,17z',
      })
    )
    expect(
      (await call('POST', '/admin/coverage/recommendations/r1/lead', null, {}))
        .status
    ).toBe(401)
    const made = await call(
      'POST',
      `/admin/coverage/recommendations/${'r1'}/lead`,
      await raga(),
      {}
    )
    // The id is not a uuid: the route refuses it before anything else.
    expect(made.status).toBe(400)

    const id = newId()
    recs.set(id, { ...recs.get('r1')!, id })
    const ok = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/lead`,
      await raga(),
      { actorName: 'Someone else' }
    )
    expect(ok.status).toBe(201)
    expect(ok.body.data.lead).toMatchObject({
      name: 'Kolathur Shine',
      phone: '9000005060',
      source: 'customer',
      status: 'to_target',
      lat: 13.118,
      lng: 80.234,
      pinSource: 'maps_link',
      zoneId: PERAMBUR,
      createdByName: 'Raga',
    })
    expect(ok.body.data.recommendation).toMatchObject({
      status: 'contacted',
      leadId: ok.body.data.lead.id,
      handledBy: 'Raga',
    })
    // A second press, or a second person: refused, and no second lead.
    const again = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/lead`,
      await raga(),
      {}
    )
    expect([again.status, again.body.code]).toEqual([
      409,
      'RECOMMENDATION_HANDLED',
    ])
    expect(
      [...leads.values()].filter((lead) => lead.source === 'customer')
    ).toHaveLength(1)
  })

  test('a lookalike of a lead the team has: the duplicates, 409 unless anyway, or linked to that lead', async () => {
    const known = fullLead({
      name: 'Shine Car Care',
      phone: '9000005060',
      zoneId: PERAMBUR,
    })
    leads.set(known.id, known)
    const id = newId()
    recs.set(id, fullRec({ id }))

    const preview = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/duplicates`,
      await raga()
    )
    expect(preview.body.data.matches).toEqual([
      expect.objectContaining({ kind: 'lead', id: known.id, reason: 'phone' }),
    ])
    const refused = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/lead`,
      await raga(),
      {}
    )
    expect([refused.status, refused.body.code]).toEqual([409, 'LEAD_DUPLICATE'])
    expect(recs.get(id)!.status).toBe('new')

    const linked = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/lead`,
      await raga(),
      { leadId: known.id }
    )
    expect(linked.status).toBe(201)
    expect(linked.body.data.lead.id).toBe(known.id)
    expect(recs.get(id)).toMatchObject({
      status: 'contacted',
      leadId: known.id,
      handledBy: 'Raga',
    })
    expect(leads.size).toBe(1)

    // Another one of the same place, saved anyway as its own lead.
    const other = newId()
    recs.set(other, fullRec({ id: other }))
    const anyway = await call(
      'POST',
      `/admin/coverage/recommendations/${other}/lead`,
      await raga(),
      { allowDuplicate: true }
    )
    expect(anyway.status).toBe(201)
    expect(leads.size).toBe(2)
  })

  test('a lead already a garage is not linked to; an unknown one is 404', async () => {
    const onboarded = fullLead({
      name: 'Done',
      zoneId: PERAMBUR,
      status: 'onboarded',
      vendorId: GARAGE,
    })
    leads.set(onboarded.id, onboarded)
    const id = newId()
    recs.set(id, fullRec({ id }))
    const refused = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/lead`,
      await raga(),
      { leadId: onboarded.id }
    )
    expect([refused.status, refused.body.code]).toEqual([
      409,
      'LEAD_ALREADY_ONBOARDED',
    ])
    expect(
      (
        await call(
          'POST',
          `/admin/coverage/recommendations/${newId()}/lead`,
          await raga(),
          {}
        )
      ).body.code
    ).toBe('RECOMMENDATION_NOT_FOUND')
  })

  test('Link to a lead that became a garage meanwhile: read under its lock, in the link’s transaction, and refused', async () => {
    // The plain read still says "no garage"; the lead's row, locked, has one.
    const lead = fullLead({ name: 'Shine Car Care', zoneId: PERAMBUR })
    leads.set(lead.id, lead)
    lockedLead.set(lead.id, { ...lead, status: 'onboarded', vendorId: GARAGE })
    const id = newId()
    recs.set(id, fullRec({ id }))
    const refused = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/lead`,
      await raga(),
      { leadId: lead.id }
    )
    expect([refused.status, refused.body.code]).toEqual([
      409,
      'LEAD_ALREADY_ONBOARDED',
    ])
    // Left new, never a "contacted" one on a garage's lead with no garage.
    expect(recs.get(id)).toMatchObject({ status: 'new', leadId: null })

    // Not a garage: the lock and the link are one transaction.
    lockedLead.clear()
    lockedWith = []
    const linked = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/lead`,
      await raga(),
      { leadId: lead.id }
    )
    expect(linked.status).toBe(201)
    expect(lockedWith).toHaveLength(1)
    expect(lockedWith[0]).toBeDefined()
    expect(handledWith).toBe(lockedWith[0])
  })

  test('Dismiss: declined, by the signed name, and off the zone’s list; once', async () => {
    const id = newId()
    recs.set(id, fullRec({ id }))
    const dismissed = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/dismiss`,
      await raga(),
      {}
    )
    expect(dismissed.status).toBe(200)
    expect(dismissed.body.data).toMatchObject({
      status: 'declined',
      handledBy: 'Raga',
    })
    const again = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/dismiss`,
      await raga(),
      {}
    )
    expect(again.body.code).toBe('RECOMMENDATION_HANDLED')
    const overview = await call('GET', '/admin/coverage', await raga())
    expect(overview.body.data.recommendations).toEqual([])
  })
})

describe('the recommendation follows its lead to a garage (referral credit)', () => {
  async function madeLead() {
    const id = newId()
    recs.set(id, fullRec({ id }))
    const made = await call(
      'POST',
      `/admin/coverage/recommendations/${id}/lead`,
      await raga(),
      {}
    )
    return { recId: id, leadId: made.body.data.lead.id as string }
  }

  test('Onboard (POST /admin/vendors { leadId } calls this): linked to the garage, joined; a second Create changes nothing', async () => {
    const { recId, leadId } = await madeLead()
    expect(await leadsService.linkOnboardedGarage(leadId, GARAGE)).toBe(true)
    expect(recs.get(recId)).toMatchObject({ vendorId: GARAGE, status: 'joined' })
    expect(leads.get(leadId)).toMatchObject({
      vendorId: GARAGE,
      status: 'onboarded',
    })
    expect(await leadsService.linkOnboardedGarage(leadId, OTHER_GARAGE)).toBe(
      false
    )
    expect(recs.get(recId)).toMatchObject({ vendorId: GARAGE, status: 'joined' })
  })

  test('the lead’s garage link changed by hand: it follows; unlinked, back to contacted', async () => {
    const { recId, leadId } = await madeLead()
    const linked = await call('PATCH', `/admin/leads/${leadId}`, await raga(), {
      vendorId: GARAGE,
    })
    expect(linked.status).toBe(200)
    expect(recs.get(recId)).toMatchObject({ vendorId: GARAGE, status: 'joined' })
    await call('PATCH', `/admin/leads/${leadId}`, await raga(), {
      vendorId: OTHER_GARAGE,
    })
    expect(recs.get(recId)).toMatchObject({ vendorId: OTHER_GARAGE })
    await call('PATCH', `/admin/leads/${leadId}`, await raga(), {
      status: 'to_target',
    })
    expect(recs.get(recId)).toMatchObject({
      vendorId: null,
      status: 'contacted',
    })
  })

  test('unlinked on a stale read (the lead was linked meanwhile): the recommendation still follows the row as saved', async () => {
    const { recId, leadId } = await madeLead()
    // Linked to a garage by someone else after this PATCH read the lead:
    // the recommendation already joined, the read still says no garage.
    recs.set(recId, { ...recs.get(recId)!, vendorId: GARAGE, status: 'joined' })
    const unlinked = await call('PATCH', `/admin/leads/${leadId}`, await raga(), {
      status: 'to_target',
    })
    expect(unlinked.status).toBe(200)
    expect(recs.get(recId)).toMatchObject({ vendorId: null, status: 'contacted' })
  })

  test('once its credit is decided, nothing the lead does moves it', async () => {
    const { recId, leadId } = await madeLead()
    await leadsService.linkOnboardedGarage(leadId, GARAGE)
    recs.set(recId, {
      ...recs.get(recId)!,
      creditStatus: 'granted',
      creditAmount: '100.00',
    })
    await call('PATCH', `/admin/leads/${leadId}`, await raga(), {
      vendorId: OTHER_GARAGE,
    })
    await call('PATCH', `/admin/leads/${leadId}`, await raga(), {
      vendorId: null,
    })
    expect(recs.get(recId)).toMatchObject({
      vendorId: GARAGE,
      status: 'joined',
      creditStatus: 'granted',
    })
  })

  test('removing the lead puts a recommendation that never reached a garage back on the zone’s list', async () => {
    const { recId, leadId } = await madeLead()
    const removed = await call('DELETE', `/admin/leads/${leadId}`, await raga())
    expect(removed.status).toBe(200)
    expect(recs.get(recId)).toMatchObject({
      status: 'new',
      leadId: null,
      handledBy: null,
    })
    // One that reached a garage keeps it.
    const second = await madeLead()
    await leadsService.linkOnboardedGarage(second.leadId, GARAGE)
    await call('DELETE', `/admin/leads/${second.leadId}`, await raga())
    expect(recs.get(second.recId)).toMatchObject({
      status: 'joined',
      vendorId: GARAGE,
      leadId: null,
    })
  })
})

describe('zone safety', () => {
  test('a zone customers used is kept, saying what is in it', async () => {
    signups = [{ zoneId: PERAMBUR, freeWash: true, discountId: null }]
    zoneRequests.set('perambur', 2)
    recs.set('r1', fullRec({ id: 'r1' }))
    leads.set('l1', fullLead({ id: 'l1', name: 'A', zoneId: PERAMBUR }))
    const refused = await call(
      'DELETE',
      `/admin/coverage/zones/${PERAMBUR}`,
      await raga()
    )
    expect([refused.status, refused.body.code]).toEqual([409, 'ZONE_IN_USE'])
    expect(refused.body.message).toBe(
      "Perambur is kept: it has 1 free-wash sign-up, 2 requests, 1 customer recommendation and 1 lead. A zone customers have used can't be removed; rename it instead."
    )
    expect(zones.map((z) => z.id)).toContain(PERAMBUR)
  })

  test('a request sent from it after the count: the delete itself refuses (requests keep the slug)', async () => {
    deleteAnswer = 'in_use'
    const refused = await call(
      'DELETE',
      `/admin/coverage/zones/${ADYAR}`,
      await raga()
    )
    expect([refused.status, refused.body.code]).toEqual([409, 'ZONE_IN_USE'])
    deleteAnswer = 'missing'
    expect(
      (await call('DELETE', `/admin/coverage/zones/${ADYAR}`, await raga()))
        .status
    ).toBe(404)
  })

  test('an empty zone goes; a renamed one keeps its slug, so its requests stay its own', async () => {
    requestFacts = [{ zoneSlug: 'perambur', status: 'expired', reply: null }]
    const renamed = await call(
      'PATCH',
      `/admin/coverage/zones/${PERAMBUR}`,
      await raga(),
      { name: 'Perambur North' }
    )
    expect(renamed.body.data).toMatchObject({
      slug: 'perambur',
      name: 'Perambur North',
    })
    const overview = await call('GET', '/admin/coverage', await raga())
    expect(
      overview.body.data.demand.find(
        (d: { zoneId: string }) => d.zoneId === PERAMBUR
      )
    ).toMatchObject({ requests: 1, failedRequests: 1 })
    expect(
      (await call('DELETE', `/admin/coverage/zones/${ADYAR}`, await raga()))
        .status
    ).toBe(200)
    expect(zones.map((z) => z.id)).not.toContain(ADYAR)
  })
})
