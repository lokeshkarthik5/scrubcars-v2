/**
 * Coverage & leads (0064) through the real admin routes and auth: zone
 * edits, leads (add, duplicates, paste, status, assign, note, garage link,
 * remove), the zone finder with PLACES_FAKE's list and its rate limit, and
 * the nightly Google refresh. The repositories are stood in for by memory
 * (no database); the rules are the real ones.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { env } = await import('../../lib/env.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { personalAdminSubject } = await import('../../lib/admin-actor.js')
const { setPlacesSourcesForTests } = await import('../../lib/places/index.js')
const { createFakePlaces, FAKE_GONE_PLACE_ID } =
  await import('../../lib/places/fake.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { adminLoginsRepository } =
  await import('../admin-logins/admin-logins.repository.js')
const { leadsRepository } = await import('../leads/leads.repository.js')
const { leadsService } = await import('../leads/leads.service.js')
const { coverageRepository } = await import('./coverage.repository.js')
const { geoService } = await import('../geo/geo.service.js')

type Lead = Awaited<ReturnType<typeof leadsRepository.listAll>>[number]
type Zone = Awaited<ReturnType<typeof coverageRepository.listZones>>[number]

const RAGA = 'e2e00000-0000-4000-8000-000000004401'
const PRIYA = 'e2e00000-0000-4000-8000-000000004402'
const ANNA = 'e2e00000-0000-4000-8000-000000004411'
const KILPAUK = 'e2e00000-0000-4000-8000-000000004412'
const GARAGE_LIVE = 'e2e00000-0000-4000-8000-000000004421'
const GARAGE_PENDING = 'e2e00000-0000-4000-8000-000000004422'
const GARAGE_BINNED = 'e2e00000-0000-4000-8000-000000004423'

const ANNA_CENTRE = { lat: 13.085, lng: 80.2101 }
const north = (lat: number, metres: number) => lat + metres / 111_320

let zones: Zone[] = []
const leads = new Map<string, Lead>()
let nextId = 1
const newId = () =>
  `e2e00000-0000-4000-8000-${String(900000 + nextId++).padStart(12, '0')}`

const zone = (
  id: string,
  slug: string,
  name: string,
  lat: number,
  lng: number,
  priority: boolean
): Zone => ({
  id,
  slug,
  name,
  lat,
  lng,
  priority,
  target: 5,
  liveAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const garages = [
  {
    id: GARAGE_LIVE,
    businessName: 'SJA Car Care',
    phone: '9000000101',
    whatsapp: null,
    lat: north(ANNA_CENTRE.lat, 300),
    lng: ANNA_CENTRE.lng,
    status: 'active',
    isVerified: true,
    bookingsPausedAt: null,
    deletedAt: null,
  },
  {
    id: GARAGE_PENDING,
    businessName: 'Glossy Doorstep',
    phone: '9000000102',
    whatsapp: '9000000103',
    lat: north(ANNA_CENTRE.lat, -300),
    lng: ANNA_CENTRE.lng,
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

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(adminLoginsRepository, 'findSession', async (id: string) =>
    id === RAGA || id === PRIYA
      ? {
          id,
          username: id === RAGA ? 'raga' : 'priya',
          name: id === RAGA ? 'Raga' : 'Priya',
          status: 'active',
          isOwner: false,
          sessionsFrom: new Date('2026-01-01'),
        }
      : undefined
  )
  const l = leadsRepository
  patch(l, 'listAll', async () => [...leads.values()])
  patch(l, 'findById', async (id: string) => leads.get(id))
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
  patch(l, 'remove', async (id: string) => leads.delete(id))
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
    id === GARAGE_BINNED
      ? { id, deletedAt: new Date(), purgedAt: null }
      : garages.some((garage) => garage.id === id)
        ? { id, deletedAt: null, purgedAt: null }
        : undefined
  )
  patch(l, 'findActiveLogin', async (id: string) =>
    id === PRIYA ? { id, name: 'Priya' } : undefined
  )
  patch(l, 'listGoogleDue', async (before: Date) =>
    [...leads.values()].filter(
      (lead) => lead.googleFetchedAt && lead.googleFetchedAt <= before
    )
  )
  patch(
    l,
    'applyGoogleRefresh',
    async (id: string, readAt: Date, values: Partial<Lead>) => {
      const lead = leads.get(id)
      if (!lead || lead.googleFetchedAt?.getTime() !== readAt.getTime())
        return false
      leads.set(id, { ...lead, ...values })
      return true
    }
  )
  patch(l, 'listPinned', async () =>
    [...leads.values()].filter((lead) => lead.lat !== null)
  )
  patch(
    l,
    'setZones',
    async (moves: Array<{ id: string; zoneId: string | null }>) => {
      for (const move of moves)
        leads.set(move.id, { ...leads.get(move.id)!, zoneId: move.zoneId })
    }
  )
  patch(
    l,
    'countInZone',
    async (zoneId: string) =>
      [...leads.values()].filter((lead) => lead.zoneId === zoneId).length
  )
  patch(l, 'listByPlaceIds', async (googleIds: string[], olaIds: string[]) =>
    [...leads.values()].filter(
      (lead) =>
        (lead.googlePlaceId && googleIds.includes(lead.googlePlaceId)) ||
        (lead.olaPlaceId && olaIds.includes(lead.olaPlaceId))
    )
  )
  const c = coverageRepository
  patch(c, 'listZones', async () => [...zones])
  patch(c, 'findZone', async (id: string) => zones.find((z) => z.id === id))
  patch(c, 'insertZone', async (values: Omit<Zone, 'id' | 'liveAt'>) => {
    const row = { ...values, id: newId(), liveAt: null } as Zone
    zones.push(row)
    return row
  })
  patch(c, 'updateZone', async (id: string, values: Partial<Zone>) => {
    const at = zones.findIndex((z) => z.id === id)
    if (at === -1) return undefined
    zones[at] = { ...zones[at], ...values }
    return zones[at]
  })
  patch(c, 'deleteZone', async (id: string) => {
    const before = zones.length
    zones = zones.filter((z) => z.id !== id)
    return zones.length < before
  })
  patch(c, 'listGarages', async () => garages)
  patch(c, 'transaction', async (work: (tx: unknown) => Promise<unknown>) =>
    work({})
  )
  patch(geoService, 'resolveMapsLink', async () => ({
    lat: 13.0855,
    lng: 80.2105,
    address: null,
    warning: null,
    source: 'link',
  }))
  setPlacesSourcesForTests(createFakePlaces())
})

beforeEach(() => {
  zones = [
    zone(
      ANNA,
      'anna-nagar',
      'Anna Nagar',
      ANNA_CENTRE.lat,
      ANNA_CENTRE.lng,
      true
    ),
    zone(KILPAUK, 'kilpauk', 'Kilpauk', 13.085, 80.242, false),
  ]
  leads.clear()
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  setPlacesSourcesForTests(null)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    status: res.status,
    body: (await res.json()) as { data?: any; code?: string; message?: string },
  }
}

const raga = () => signAdminToken(personalAdminSubject(RAGA))

describe('the overview', () => {
  test('zones, garages with their zone from the pin, leads and the finder sources; admin only', async () => {
    expect((await call('GET', '/admin/coverage', null)).status).toBe(401)
    leads.set('x', fullLead({ id: 'x', name: 'Speed Wash', zoneId: ANNA }))
    const { status, body } = await call('GET', '/admin/coverage', await raga())
    expect(status).toBe(200)
    expect(body.data.zones.map((z: Zone) => z.name)).toEqual([
      'Anna Nagar',
      'Kilpauk',
    ])
    expect(body.data.garages).toEqual([
      expect.objectContaining({
        id: GARAGE_LIVE,
        zoneId: ANNA,
        live: true,
        stage: 'live',
      }),
      expect.objectContaining({
        id: GARAGE_PENDING,
        zoneId: ANNA,
        live: false,
        stage: 'pending',
      }),
    ])
    expect(body.data.leads[0]).toMatchObject({
      name: 'Speed Wash',
      zoneId: ANNA,
      status: 'to_target',
    })
    expect(body.data.finder).toEqual({ google: true, ola: true })
  })
})

describe('zone edits', () => {
  test('add a zone: slug from its name, signed; a taken name or a far centre is refused', async () => {
    const added = await call('POST', '/admin/coverage/zones', await raga(), {
      name: ' Besant  Nagar ',
      lat: 13.0,
      lng: 80.27,
      priority: true,
      target: 4,
    })
    expect(added.status).toBe(201)
    expect(added.body.data).toMatchObject({
      slug: 'besant-nagar',
      name: 'Besant Nagar',
      priority: true,
      target: 4,
    })
    const taken = await call('POST', '/admin/coverage/zones', await raga(), {
      name: 'anna nagar',
      lat: 13.0,
      lng: 80.2,
    })
    expect([taken.status, taken.body.code]).toEqual([409, 'ZONE_NAME_TAKEN'])
    const far = await call('POST', '/admin/coverage/zones', await raga(), {
      name: 'Bengaluru',
      lat: 12.97,
      lng: 77.59,
    })
    expect([far.status, far.body.code]).toEqual([400, 'ZONE_INVALID'])
    expect(
      (
        await call('POST', '/admin/coverage/zones', await raga(), {
          name: 'X',
          lat: 13,
          lng: 80.2,
          target: 0,
        })
      ).status
    ).toBe(400)
  })

  test('rename keeps the slug; priority and target change; moving the centre moves pinned leads', async () => {
    const between = fullLead({
      name: 'Between',
      lat: 13.085,
      lng: 80.2265,
      pinSource: 'map',
      zoneId: KILPAUK,
    })
    leads.set(between.id, between)
    const renamed = await call(
      'PATCH',
      `/admin/coverage/zones/${ANNA}`,
      await raga(),
      { name: 'Anna Nagar West', priority: false, target: 8 }
    )
    expect(renamed.body.data).toMatchObject({
      slug: 'anna-nagar',
      name: 'Anna Nagar West',
      priority: false,
      target: 8,
    })
    // Anna Nagar's centre moves east, past the lead: it is Anna Nagar's now.
    const moved = await call(
      'PATCH',
      `/admin/coverage/zones/${ANNA}`,
      await raga(),
      { lat: 13.085, lng: 80.222 }
    )
    expect(moved.status).toBe(200)
    expect(leads.get(between.id)?.zoneId).toBe(ANNA)
    expect(
      (
        await call('PATCH', `/admin/coverage/zones/${ANNA}`, await raga(), {
          lat: 13.085,
        })
      ).status
    ).toBe(400)
    expect(
      (
        await call('PATCH', `/admin/coverage/zones/${ANNA}`, await raga(), {
          name: 'Kilpauk',
        })
      ).body.code
    ).toBe('ZONE_NAME_TAKEN')
    expect(
      (
        await call(
          'PATCH',
          `/admin/coverage/zones/e2e00000-0000-4000-8000-000000000999`,
          await raga(),
          { target: 3 }
        )
      ).status
    ).toBe(404)
  })

  test('remove only a zone no lead points at', async () => {
    const lead = fullLead({ name: 'Kept', zoneId: KILPAUK })
    leads.set(lead.id, lead)
    const refused = await call(
      'DELETE',
      `/admin/coverage/zones/${KILPAUK}`,
      await raga()
    )
    expect([refused.status, refused.body.code]).toEqual([409, 'ZONE_HAS_LEADS'])
    expect(refused.body.message).toBe(
      '1 lead is in Kilpauk. Move it to another zone or remove it first.'
    )
    leads.clear()
    expect(
      (await call('DELETE', `/admin/coverage/zones/${KILPAUK}`, await raga()))
        .status
    ).toBe(200)
    expect(zones.map((z) => z.id)).toEqual([ANNA])
  })
})

describe('leads', () => {
  test('Add lead: a Maps link’s pin and zone, then saved with its zone from the pin, signed', async () => {
    const link =
      'https://www.google.com/maps/place/Car+Spa/@13.0861,80.2111,17z'
    const pin = await call('POST', '/admin/leads/resolve-pin', await raga(), {
      mapsUrl: link,
    })
    expect(pin.body.data).toEqual({
      lat: 13.0861,
      lng: 80.2111,
      warning: null,
      zone: { id: ANNA, name: 'Anna Nagar' },
    })
    // A short link goes through the address search's resolver.
    const short = await call('POST', '/admin/leads/resolve-pin', await raga(), {
      mapsUrl: 'https://maps.app.goo.gl/abc',
    })
    expect(short.body.data.zone).toEqual({ id: ANNA, name: 'Anna Nagar' })

    const saved = await call('POST', '/admin/leads', await raga(), {
      name: 'Car Spa Studio',
      phone: '+91 97900 10288',
      mapsUrl: link,
      lat: 13.0861,
      lng: 80.2111,
      zoneId: KILPAUK,
      assignedLoginId: PRIYA,
      note: 'Owner back Thursday',
      actorName: 'Someone else',
    })
    expect(saved.status).toBe(201)
    expect(saved.body.data).toMatchObject({
      name: 'Car Spa Studio',
      phone: '9790010288',
      zoneId: ANNA,
      pinSource: 'maps_link',
      source: 'manual',
      status: 'to_target',
      assignedName: 'Priya',
      lastNote: 'Owner back Thursday',
      lastNoteBy: 'Raga',
      createdByName: 'Raga',
    })
  })

  test('a lead with no pin is in the zone it was added in; an unknown zone is 404', async () => {
    const saved = await call('POST', '/admin/leads', await raga(), {
      name: 'No Pin Wash',
      zoneId: KILPAUK,
    })
    expect(saved.body.data).toMatchObject({
      zoneId: KILPAUK,
      lat: null,
      pinSource: null,
    })
    expect(
      (
        await call('POST', '/admin/leads', await raga(), {
          name: 'X',
          zoneId: 'e2e00000-0000-4000-8000-000000000999',
        })
      ).status
    ).toBe(404)
  })

  test('Not interested needs a reason; it keeps the day and the try-again day', async () => {
    expect(
      (
        await call('POST', '/admin/leads', await raga(), {
          name: 'Nope',
          status: 'not_interested',
        })
      ).status
    ).toBe(400)
    const saved = await call('POST', '/admin/leads', await raga(), {
      name: 'Nope',
      status: 'not_interested',
      reason: 'Has their own app',
      retryAfter: '2027-01-29',
    })
    expect(saved.body.data).toMatchObject({
      status: 'not_interested',
      notInterestedReason: 'Has their own app',
      retryAfter: '2027-01-29',
    })
    expect(saved.body.data.notInterestedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('duplicates: the same phone as a garage, a similar name within 150 m; refused unless saved anyway', async () => {
    const check = await call('POST', '/admin/leads/duplicates', await raga(), {
      name: 'Glossy Doorstep Wash',
      phone: '9000000103',
    })
    expect(check.body.data.matches).toEqual([
      {
        kind: 'garage',
        id: GARAGE_PENDING,
        name: 'Glossy Doorstep',
        status: 'not_live',
        zoneId: ANNA,
        reason: 'phone',
      },
    ])
    const near = await call('POST', '/admin/leads/duplicates', await raga(), {
      name: 'SJA Car Care Centre',
      lat: north(ANNA_CENTRE.lat, 380),
      lng: ANNA_CENTRE.lng,
    })
    expect(
      near.body.data.matches.map((m: { id: string; reason: string }) => [
        m.id,
        m.reason,
      ])
    ).toEqual([[GARAGE_LIVE, 'name_nearby']])

    const refused = await call('POST', '/admin/leads', await raga(), {
      name: 'Something',
      phone: '9000000101',
    })
    expect([refused.status, refused.body.code]).toEqual([409, 'LEAD_DUPLICATE'])
    expect(refused.body.message).toBe(
      'This looks like SJA Car Care, already a garage. Check it, or save anyway.'
    )
    expect(
      (
        await call('POST', '/admin/leads', await raga(), {
          name: 'Something',
          phone: '9000000101',
          allowDuplicate: true,
        })
      ).status
    ).toBe(201)
    // Editing a lead: it is not its own duplicate.
    const lead = [...leads.values()][0]
    const self = await call('POST', '/admin/leads/duplicates', await raga(), {
      name: 'Something',
      excludeLeadId: lead.id,
    })
    expect(self.body.data.matches).toEqual([])
  })

  test('PATCH: status, assign, note, name and phone, garage link; signed', async () => {
    const lead = fullLead({ name: 'Speed Wash', zoneId: ANNA })
    leads.set(lead.id, lead)
    const path = `/admin/leads/${lead.id}`
    const nope = await call('PATCH', path, await raga(), {
      status: 'not_interested',
      reason: 'Too busy',
      retryAfter: '2027-02-01',
    })
    expect(nope.body.data).toMatchObject({
      status: 'not_interested',
      notInterestedReason: 'Too busy',
      retryAfter: '2027-02-01',
    })
    const back = await call('PATCH', path, await raga(), {
      status: 'to_target',
    })
    expect(back.body.data).toMatchObject({
      status: 'to_target',
      notInterestedReason: null,
      notInterestedOn: null,
      retryAfter: null,
    })

    const assigned = await call('PATCH', path, await raga(), {
      assignedLoginId: PRIYA,
    })
    expect(assigned.body.data).toMatchObject({
      assignedLoginId: PRIYA,
      assignedName: 'Priya',
    })
    expect(
      (await call('PATCH', path, await raga(), { assignedLoginId: RAGA })).body
        .code
    ).toBe('LEAD_ASSIGNEE_UNKNOWN')
    expect(
      (await call('PATCH', path, await raga(), { assignedLoginId: null })).body
        .data.assignedName
    ).toBeNull()

    const noted = await call('PATCH', path, await raga(), {
      note: 'Call back Thu, owner travelling',
    })
    expect(noted.body.data).toMatchObject({
      lastNote: 'Call back Thu, owner travelling',
      lastNoteBy: 'Raga',
    })
    expect(
      (await call('PATCH', path, await raga(), { note: '' })).body.data.lastNote
    ).toBeNull()

    const edited = await call('PATCH', path, await raga(), {
      name: 'Speed Wash Anna Nagar',
      phone: '98400 41230',
    })
    expect(edited.body.data).toMatchObject({
      name: 'Speed Wash Anna Nagar',
      ownName: 'Speed Wash Anna Nagar',
      phone: '9840041230',
    })
    expect(
      (await call('PATCH', path, await raga(), { phone: 'call me' })).status
    ).toBe(400)

    // Onboarded only with a garage; a garage in the Bin or another lead's is refused.
    expect(
      (await call('PATCH', path, await raga(), { status: 'onboarded' })).body
        .code
    ).toBe('LEAD_NEEDS_GARAGE')
    expect(
      (await call('PATCH', path, await raga(), { vendorId: GARAGE_BINNED }))
        .body.code
    ).toBe('VENDOR_IN_BIN')
    const linked = await call('PATCH', path, await raga(), {
      vendorId: GARAGE_PENDING,
    })
    expect(linked.body.data).toMatchObject({
      status: 'onboarded',
      vendorId: GARAGE_PENDING,
    })
    expect(linked.body.data.onboardedAt).not.toBeNull()
    const other = fullLead({ name: 'Other' })
    leads.set(other.id, other)
    expect(
      (
        await call('PATCH', `/admin/leads/${other.id}`, await raga(), {
          vendorId: GARAGE_PENDING,
        })
      ).body.code
    ).toBe('LEAD_GARAGE_TAKEN')
    const unlinked = await call('PATCH', path, await raga(), { vendorId: null })
    expect(unlinked.body.data).toMatchObject({
      status: 'to_target',
      vendorId: null,
      onboardedAt: null,
    })
  })

  test('PATCH a pin: the zone follows it; a pinned lead cannot be moved to a zone by hand', async () => {
    const lead = fullLead({ name: 'Mover', zoneId: KILPAUK })
    leads.set(lead.id, lead)
    const path = `/admin/leads/${lead.id}`
    const pinned = await call('PATCH', path, await raga(), {
      lat: 13.0855,
      lng: 80.2105,
    })
    expect(pinned.body.data).toMatchObject({ zoneId: ANNA, pinSource: 'map' })
    expect(
      (await call('PATCH', path, await raga(), { zoneId: KILPAUK })).body.code
    ).toBe('LEAD_ZONE_FROM_PIN')
    const cleared = await call('PATCH', path, await raga(), {
      lat: null,
      lng: null,
      zoneId: KILPAUK,
    })
    expect(cleared.body.data).toMatchObject({
      lat: null,
      pinSource: null,
      zoneId: KILPAUK,
    })
  })

  test('GET one lead for Onboard; DELETE removes it; both 404 when gone', async () => {
    const lead = fullLead({
      name: 'Onboard Me',
      phone: '9840000001',
      lat: 13.0855,
      lng: 80.2105,
      pinSource: 'map',
      zoneId: ANNA,
    })
    leads.set(lead.id, lead)
    expect(
      (await call('GET', `/admin/leads/${lead.id}`, await raga())).body.data
    ).toMatchObject({ name: 'Onboard Me', phone: '9840000001', lat: 13.0855 })
    expect(
      (await call('DELETE', `/admin/leads/${lead.id}`, await raga())).status
    ).toBe(200)
    expect(
      (await call('GET', `/admin/leads/${lead.id}`, await raga())).status
    ).toBe(404)
    expect(
      (await call('DELETE', `/admin/leads/${lead.id}`, await raga())).status
    ).toBe(404)
  })
})

describe('Paste a list', () => {
  test('the preview says each line’s problem and what it looks like; nothing is saved', async () => {
    const preview = await call(
      'POST',
      '/admin/leads/paste/preview',
      await raga(),
      {
        text: 'Name, Phone\nSpeed Wash, 98400 41230\nSJA, 9000000101\n9840000000\nSpeed Wash again, 9840041230',
        zoneId: ANNA,
      }
    )
    expect(preview.status).toBe(200)
    expect(
      preview.body.data.lines.map(
        (l: {
          name: string
          problem: string | null
          duplicates: unknown[]
        }) => [l.name, l.problem, l.duplicates.length]
      )
    ).toEqual([
      ['Speed Wash', null, 0],
      ['SJA', null, 1],
      ['', 'no_name', 0],
      ['Speed Wash again', 'repeated', 0],
    ])
    expect(preview.body.data.lines[1].duplicates[0]).toMatchObject({
      kind: 'garage',
      reason: 'phone',
    })
    expect(leads.size).toBe(0)
  })

  test('save: the lines kept, To target in the zone, assigned; a duplicate needs Save anyway', async () => {
    const refused = await call('POST', '/admin/leads/paste', await raga(), {
      zoneId: ANNA,
      rows: [
        { name: 'Speed Wash', phone: '9840041230' },
        { name: 'SJA', phone: '9000000101' },
      ],
    })
    expect([refused.status, refused.body.code]).toEqual([409, 'LEAD_DUPLICATE'])
    expect(leads.size).toBe(0)
    const saved = await call('POST', '/admin/leads/paste', await raga(), {
      zoneId: ANNA,
      assignedLoginId: PRIYA,
      rows: [
        { name: 'Speed Wash', phone: '98400 41230' },
        { name: 'SJA', phone: '9000000101', allowDuplicate: true },
        { name: 'No Phone', phone: null },
      ],
    })
    expect(saved.status).toBe(201)
    expect(saved.body.data.added).toBe(3)
    expect(
      [...leads.values()].map((l) => [
        l.name,
        l.phone,
        l.source,
        l.zoneId,
        l.assignedName,
        l.createdByName,
      ])
    ).toEqual([
      ['Speed Wash', '9840041230', 'paste', ANNA, 'Priya', 'Raga'],
      ['SJA', '9000000101', 'paste', ANNA, 'Priya', 'Raga'],
      ['No Phone', null, 'paste', ANNA, 'Priya', 'Raga'],
    ])
  })
})

describe('the zone finder', () => {
  test('one list from both sources, kept to the zone, marked against what is known', async () => {
    leads.set(
      'aqua',
      fullLead({
        id: 'aqua',
        name: 'Aqua Foam',
        phone: '9790060193',
        zoneId: ANNA,
        assignedName: 'Priya',
      })
    )
    const found = await call('POST', '/admin/places/search', await raga(), {
      zoneId: ANNA,
      kinds: ['car_wash', 'detailing', 'workshop', 'doorstep'],
    })
    expect(found.status).toBe(200)
    expect(found.body.data.sources).toEqual({ google: 'ok', ola: 'ok' })
    const names = found.body.data.places.map((p: { name: string }) => p.name)
    expect(names).toEqual([
      'Aqua Foam Car Wash',
      'Shine Pro Detailing',
      'Gloss Garage Ceramic',
      'Splash Doorstep Wash',
      'Sri Murugan Auto Works',
    ])
    const shine = found.body.data.places[1]
    expect([shine.google?.placeId, shine.ola?.placeId]).toEqual([
      'fake-google-shine',
      'fake-ola-shine',
    ])
    expect(found.body.data.places[0].known).toMatchObject({
      kind: 'lead',
      id: 'aqua',
      status: 'to_target',
      assignedName: 'Priya',
      reason: 'phone',
    })
    expect(found.body.data.counts).toEqual({
      found: 5,
      google: 4,
      ola: 2,
      both: 1,
      known: 1,
      new: 4,
    })
  })

  test('nothing ticked and no words is 400; an unknown zone 404', async () => {
    expect(
      (
        await call('POST', '/admin/places/search', await raga(), {
          zoneId: ANNA,
          kinds: [],
        })
      ).status
    ).toBe(400)
    expect(
      (
        await call('POST', '/admin/places/search', await raga(), {
          zoneId: ANNA,
          kinds: ['boats'],
        })
      ).status
    ).toBe(400)
    expect(
      (
        await call('POST', '/admin/places/search', await raga(), {
          zoneId: 'e2e00000-0000-4000-8000-000000000999',
          kinds: ['car_wash'],
        })
      ).status
    ).toBe(404)
  })

  test('Google not connected: Ola alone answers, and says so', async () => {
    setPlacesSourcesForTests({ google: null, ola: createFakePlaces().ola })
    const found = await call('POST', '/admin/places/search', await raga(), {
      zoneId: ANNA,
      kinds: ['detailing'],
    })
    expect(found.body.data.sources).toEqual({ google: 'off', ola: 'ok' })
    expect(found.body.data.places.map((p: { name: string }) => p.name)).toEqual(
      ['Shine Pro Detailing Studio']
    )
    setPlacesSourcesForTests({ google: null, ola: null })
    expect(
      (
        await call('POST', '/admin/places/search', await raga(), {
          zoneId: ANNA,
          kinds: ['detailing'],
        })
      ).body.code
    ).toBe('PLACES_UNCONFIGURED')
    setPlacesSourcesForTests(createFakePlaces())
  })

  test('Add N as leads: Google’s fields held apart and dated, Ola’s as the lead’s own; a place twice is skipped', async () => {
    const found = await call('POST', '/admin/places/search', await raga(), {
      zoneId: ANNA,
      kinds: ['detailing', 'workshop'],
    })
    const picked = found.body.data.places.filter(
      (p: { name: string }) => p.name !== 'Gloss Garage Ceramic'
    )
    const body = {
      zoneId: ANNA,
      assignedLoginId: PRIYA,
      places: picked.map((p: { google: unknown; ola: unknown }) => ({
        google: p.google,
        ola: p.ola,
      })),
    }
    const added = await call(
      'POST',
      '/admin/leads/from-places',
      await raga(),
      body
    )
    expect(added.status).toBe(201)
    expect(added.body.data).toMatchObject({ added: 2, skipped: 0 })
    const [shine, murugan] = [...leads.values()]
    expect(shine).toMatchObject({
      name: 'Shine Pro Detailing Studio',
      phone: '9840022417',
      source: 'google',
      pinSource: 'ola',
      zoneId: ANNA,
      googlePlaceId: 'fake-google-shine',
      olaPlaceId: 'fake-ola-shine',
      googleName: 'Shine Pro Detailing',
      googleRating: '4.7',
      googleReviewCount: 318,
      assignedName: 'Priya',
    })
    expect(shine.googleFetchedAt).toBeInstanceOf(Date)
    expect(murugan).toMatchObject({
      name: 'Sri Murugan Auto Works',
      source: 'ola',
      googlePlaceId: null,
      googleFetchedAt: null,
    })
    // A Google-only place: no name of ours yet, Google's shown.
    const gloss = found.body.data.places.find(
      (p: { name: string }) => p.name === 'Gloss Garage Ceramic'
    )
    const again = await call('POST', '/admin/leads/from-places', await raga(), {
      zoneId: ANNA,
      places: [{ google: gloss.google, ola: null }, ...body.places],
    })
    expect(again.body.data).toMatchObject({ added: 1, skipped: 2 })
    expect(again.body.data.leads[0]).toMatchObject({
      name: 'Gloss Garage Ceramic',
      ownName: null,
      pinSource: 'google',
      google: { rating: 4.9 },
    })
  })

  test('rate limited per admin per hour', async () => {
    const writable = env as { placesSearchRateLimit: number }
    const before = writable.placesSearchRateLimit
    writable.placesSearchRateLimit = 2
    try {
      const token = await signAdminToken(personalAdminSubject(PRIYA))
      const search = () =>
        call('POST', '/admin/places/search', token, {
          zoneId: ANNA,
          kinds: ['car_wash'],
        })
      expect((await search()).status).toBe(200)
      expect((await search()).status).toBe(200)
      const third = await search()
      expect([third.status, third.body.code]).toEqual([
        429,
        'RATE_LIMIT_EXCEEDED',
      ])
      // Another admin (the shared login, which has not searched) has their own count.
      expect(
        (
          await call('POST', '/admin/places/search', await signAdminToken(), {
            zoneId: ANNA,
            kinds: ['car_wash'],
          })
        ).status
      ).toBe(200)
    } finally {
      writable.placesSearchRateLimit = before
    }
  })
})

describe('the nightly Google refresh', () => {
  const NIGHT = new Date('2026-10-29T21:30:00Z') // 03:00 IST
  const DAY = 24 * 60 * 60 * 1000
  const held = (values: Partial<Lead>) =>
    fullLead({
      googlePlaceId: 'fake-google-aqua',
      googleName: 'Old Name',
      googlePhone: '9790060193',
      googleAddress: 'Old',
      googleRating: '4.0',
      googleReviewCount: 1,
      source: 'google',
      zoneId: ANNA,
      ...values,
    })

  test('only in the night runs; 29 days on, read again; Google gone or (after 30 days) unreachable, cleared; ours kept', async () => {
    const fresh = held({
      googleFetchedAt: new Date(NIGHT.getTime() - 10 * DAY),
    })
    const due = held({
      googleFetchedAt: new Date(NIGHT.getTime() - 29 * DAY),
      name: 'Our Name',
      lastNote: 'ours',
    })
    const gone = held({
      googlePlaceId: FAKE_GONE_PLACE_ID,
      googleFetchedAt: new Date(NIGHT.getTime() - 29 * DAY),
      pinSource: 'google',
      lat: 13.085,
      lng: 80.21,
    })
    for (const lead of [fresh, due, gone]) leads.set(lead.id, lead)

    expect(
      await leadsService.refreshGoogle(
        { dryRun: false },
        new Date('2026-10-29T08:00:00Z')
      )
    ).toEqual({ ran: false })
    expect(await leadsService.refreshGoogle({ dryRun: true }, NIGHT)).toEqual({
      ran: true,
      due: 2,
    })

    const run = await leadsService.refreshGoogle({ dryRun: false }, NIGHT)
    expect(run).toMatchObject({
      ran: true,
      due: 2,
      refreshed: 1,
      cleared: 1,
      kept: 0,
      failed: 0,
    })
    expect(leads.get(fresh.id)?.googleName).toBe('Old Name')
    expect(leads.get(due.id)).toMatchObject({
      name: 'Our Name',
      lastNote: 'ours',
      googleName: 'Aqua Foam Car Wash',
      googleRating: '4.4',
      googleFetchedAt: NIGHT,
    })
    expect(leads.get(gone.id)).toMatchObject({
      googlePlaceId: FAKE_GONE_PLACE_ID,
      googleName: null,
      googlePhone: null,
      googleAddress: null,
      googleRating: null,
      googleReviewCount: null,
      googleFetchedAt: null,
      lat: null,
      lng: null,
      pinSource: null,
      zoneId: ANNA,
    })
  })

  test('Google not connected: kept until 30 days, then cleared', async () => {
    setPlacesSourcesForTests({ google: null, ola: null })
    try {
      const day29 = held({
        googleFetchedAt: new Date(NIGHT.getTime() - 29.5 * DAY),
      })
      const day31 = held({
        googlePlaceId: 'g-other',
        googleFetchedAt: new Date(NIGHT.getTime() - 31 * DAY),
      })
      leads.set(day29.id, day29)
      leads.set(day31.id, day31)
      expect(
        await leadsService.refreshGoogle({ dryRun: false }, NIGHT)
      ).toMatchObject({ refreshed: 0, cleared: 1, kept: 1 })
      expect(leads.get(day29.id)?.googleName).toBe('Old Name')
      expect(leads.get(day31.id)).toMatchObject({
        googleName: null,
        googleFetchedAt: null,
        googlePlaceId: 'g-other',
      })
    } finally {
      setPlacesSourcesForTests(createFakePlaces())
    }
  })
})
