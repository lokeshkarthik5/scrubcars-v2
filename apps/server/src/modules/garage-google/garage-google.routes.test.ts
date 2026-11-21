/**
 * "Link to Google listing" (Google rating for new garages, 21 Nov 2026)
 * through the real routes and the real admin auth; only the database and
 * Google are stood in for (a fake Google source, never a real call). The
 * search looks around the garage's pin; Link reads the place from Google
 * once and puts it on the garage's lead (made when it has none, or a
 * Coverage lead holding the place becomes the garage's); Unlink clears it;
 * each writes admin_audit_log with place ids only, signed by the session.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { setPlacesSourcesForTests } = await import('../../lib/places/index.js')
const { leadsRepository } = await import('../leads/leads.repository.js')
const { reviewsRepository } = await import('../reviews/reviews.repository.js')
const { membersRepository } = await import('../members/members.repository.js')
const { garageGoogleRepository } = await import('./garage-google.repository.js')
const { adminGarageGoogleRoutes } = await import('./garage-google.routes.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GARAGE = id(8140)
const OTHER_GARAGE = id(8141)
const BIN_GARAGE = id(8142)
const PIN = { lat: 13.0827, lng: 80.2707 }

type Lead = {
  id: string
  name: string | null
  vendorId: string | null
  status: string
  source: string
  pinSource: string | null
  lat: number | null
  lng: number | null
  googlePlaceId: string | null
  googleName: string | null
  googlePhone: string | null
  googleAddress: string | null
  googleRating: string | null
  googleReviewCount: number | null
  googleFetchedAt: Date | null
  [key: string]: unknown
}
let leads: Lead[]
let audits: Array<{ action: string; actor: { sub: string; name: string }; summary: Record<string, unknown>; detail: Record<string, unknown> }>
let detailsCalls: string[]
let synced: Array<{ leadId: string; vendorId: string | null }>

const PLACES = {
  royal: { placeId: 'g-royal', name: 'Royal Car Wash', address: '7/2 Paper Mills Rd', north: 120, rating: 4.3, reviewCount: 58 },
  service: { placeId: 'g-royal-service', name: 'Royal Car Wash & Service Centre', address: '41 MTH Rd', north: 6800, rating: 4.1, reviewCount: 402 },
  cars: { placeId: 'g-royal-cars', name: 'Royal Cars Villivakkam', address: 'Sidco Nagar', north: 900, rating: null, reviewCount: null },
}

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  setPlacesSourcesForTests({
    google: {
      name: 'google',
      async search(query) {
        expect(query.centre).toEqual(PIN)
        return Object.values(PLACES).map((place) => ({
          source: 'google' as const,
          placeId: place.placeId,
          name: place.name,
          address: place.address,
          lat: PIN.lat + place.north / 111_320,
          lng: PIN.lng,
          phone: null,
          rating: place.rating,
          reviewCount: place.reviewCount,
          kinds: [],
        }))
      },
      async details(placeId) {
        detailsCalls.push(placeId)
        if (placeId === 'g-gone') return null
        const place = Object.values(PLACES).find((row) => row.placeId === placeId)
        return {
          name: place?.name ?? 'Somewhere',
          address: place?.address ?? null,
          phone: '9840011223',
          rating: place?.rating ?? 4,
          reviewCount: place?.reviewCount ?? 10,
          lat: null,
          lng: null,
        }
      },
    },
    ola: null,
  })
  // A customer's session has no platform row: never an admin.
  patch(membersRepository, 'findActivePlatformRow', async () => undefined)
  patch(garageGoogleRepository, 'findGarage', async (vendorId: string) => {
    if (vendorId === GARAGE) return { id: GARAGE, businessName: 'Royal Car Wash', ...PIN, deletedAt: null, purgedAt: null }
    if (vendorId === OTHER_GARAGE) return { id: OTHER_GARAGE, businessName: 'Velan Car Care', ...PIN, deletedAt: null, purgedAt: null }
    if (vendorId === BIN_GARAGE) return { id: BIN_GARAGE, businessName: 'Binned', ...PIN, deletedAt: new Date(), purgedAt: null }
    return undefined
  })
  patch(garageGoogleRepository, 'lockLeadOfGarage', async (vendorId: string) => leads.find((lead) => lead.vendorId === vendorId))
  patch(garageGoogleRepository, 'lockLeadOfPlace', async (placeId: string) => leads.find((lead) => lead.googlePlaceId === placeId))
  patch(garageGoogleRepository, 'listPlaceHolders', async (placeIds: string[]) =>
    leads
      .filter((lead) => lead.googlePlaceId && placeIds.includes(lead.googlePlaceId))
      .map((lead) => ({
        leadId: lead.id,
        name: lead.name,
        googleName: lead.googleName,
        placeId: lead.googlePlaceId!,
        vendorId: lead.vendorId,
        garageName: lead.vendorId === OTHER_GARAGE ? 'Velan Car Care' : lead.vendorId ? 'Royal Car Wash' : null,
      }))
  )
  patch(garageGoogleRepository, 'insertLead', async (row: Partial<Lead>) => {
    const lead = { id: id(8150 + leads.length), ...row } as Lead
    leads.push(lead)
    return [lead]
  })
  patch(garageGoogleRepository, 'updateLead', async (leadId: string, values: Partial<Lead>) => {
    const lead = leads.find((row) => row.id === leadId)!
    Object.assign(lead, values)
    return lead
  })
  patch(garageGoogleRepository, 'audit', async (_conn: unknown, entry: (typeof audits)[number]) => {
    audits.push(entry)
  })
  patch(garageGoogleRepository, 'transaction', async (work: (tx: unknown) => Promise<unknown>) => work({}))
  patch(leadsRepository, 'listZones', async () => [{ id: id(8149), name: 'Villivakkam', lat: PIN.lat, lng: PIN.lng }])
  patch(leadsRepository, 'lockRecommendationsOfLead', async (leadId: string) => {
    synced.push({ leadId, vendorId: GARAGE })
    return []
  })
  patch(leadsRepository, 'setRecommendationGarages', async () => 0)
  patch(reviewsRepository, 'ratingAggregates', async () => [{ vendorId: GARAGE, average: 4.5, count: 2 }])
})

beforeEach(() => {
  leads = []
  audits = []
  detailsCalls = []
  synced = []
})

afterAll(() => {
  setPlacesSourcesForTests(null)
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin', adminGarageGoogleRoutes)

async function call(path: string, body: unknown = {}, who: 'admin' | 'customer' = 'admin') {
  const token =
    who === 'admin'
      ? await signAdminToken()
      : await signAccessToken({ sub: id(8148), aud: 'customer', isCustomer: true, isVendorOwner: false })
  const response = await app.request(path, {
    method: 'POST',
    headers: { Cookie: `access_token=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as { code?: string; data?: any } }
}

const coverageLead = (over: Partial<Lead> = {}): Lead => ({
  id: id(8160),
  name: null,
  vendorId: null,
  status: 'to_target',
  source: 'google',
  pinSource: 'google',
  lat: PIN.lat,
  lng: PIN.lng,
  googlePlaceId: 'g-royal',
  googleName: 'Royal Car Wash',
  googlePhone: null,
  googleAddress: '7/2 Paper Mills Rd',
  googleRating: '4.3',
  googleReviewCount: 58,
  googleFetchedAt: new Date(),
  ...over,
})

describe('the search', () => {
  test('Google’s places nearest the garage’s pin first, with who holds each', async () => {
    leads.push(coverageLead({ id: id(8161), googlePlaceId: 'g-royal-service', vendorId: OTHER_GARAGE, name: 'Velan' }))
    const res = await call(`/admin/vendors/${GARAGE}/google/search`, { text: 'Royal Car Wash Villivakkam' })
    expect(res.status).toBe(200)
    const places = res.body.data.places as Array<{ placeId: string; distanceM: number; linkedGarage: unknown }>
    expect(places.map((place) => place.placeId)).toEqual(['g-royal', 'g-royal-cars', 'g-royal-service'])
    expect(places[2]!.linkedGarage).toEqual({ id: OTHER_GARAGE, name: 'Velan Car Care' })
    // Nothing is stored by a search.
    expect(leads).toHaveLength(1)
    expect(audits).toEqual([])
  })

  test('admins only; a garage in the Bin is read-only', async () => {
    expect((await call(`/admin/vendors/${GARAGE}/google/search`, {}, 'customer')).status).toBe(403)
    expect((await call(`/admin/vendors/${BIN_GARAGE}/google/search`)).body.code).toBe('VENDOR_IN_BIN')
  })
})

describe('Link', () => {
  test('a garage with no lead gets one, holding the place and Google’s figures, audited with ids only', async () => {
    const res = await call(`/admin/vendors/${GARAGE}/google/link`, { placeId: 'g-royal', actorName: 'Spoofed' })
    expect(res.status).toBe(200)
    expect(detailsCalls).toEqual(['g-royal'])
    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({
      name: 'Royal Car Wash',
      vendorId: GARAGE,
      status: 'onboarded',
      source: 'google',
      pinSource: 'map',
      googlePlaceId: 'g-royal',
      googleRating: '4.3',
      googleReviewCount: 58,
    })
    expect(res.body.data.listing).toMatchObject({
      placeId: 'g-royal',
      google: { rating: 4.3, reviewCount: 58 },
      detlioReviews: 2,
      shown: true,
    })
    expect(audits).toHaveLength(1)
    const [audit] = audits
    expect(audit!.action).toBe('garage_google_linked')
    // Signed by the session, never the name a body carries.
    expect(audit!.actor).toEqual({ sub: 'admin', name: 'admin' })
    expect(audit!.summary).toEqual({ vendorId: GARAGE, leadId: leads[0]!.id })
    expect(audit!.detail).toEqual({ placeId: 'g-royal', previousPlaceId: null, how: 'create' })
    // Google's content is never kept in the audit log (Google's 30 days).
    expect(JSON.stringify(audit)).not.toContain('Paper Mills')
  })

  test('Change: the garage’s own lead takes the new place', async () => {
    leads.push(coverageLead({ id: id(8162), name: 'Royal', vendorId: GARAGE, status: 'onboarded', googlePlaceId: 'g-royal-cars' }))
    const res = await call(`/admin/vendors/${GARAGE}/google/link`, { placeId: 'g-royal' })
    expect(res.status).toBe(200)
    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({ googlePlaceId: 'g-royal', googleReviewCount: 58 })
    expect(audits[0]!.detail).toEqual({ placeId: 'g-royal', previousPlaceId: 'g-royal-cars', how: 'update' })
  })

  test('a Coverage lead already holding the place becomes the garage’s, and its recommendations follow', async () => {
    leads.push(coverageLead())
    const res = await call(`/admin/vendors/${GARAGE}/google/link`, { placeId: 'g-royal' })
    expect(res.status).toBe(200)
    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({ vendorId: GARAGE, status: 'onboarded' })
    expect(synced).toEqual([{ leadId: id(8160), vendorId: GARAGE }])
    expect(audits[0]!.detail).toMatchObject({ how: 'link_lead' })
  })

  test('another garage’s listing, a place on another lead, and a place Google lost are refused, nothing written', async () => {
    leads.push(coverageLead({ vendorId: OTHER_GARAGE }))
    expect((await call(`/admin/vendors/${GARAGE}/google/link`, { placeId: 'g-royal' })).body.code).toBe('GOOGLE_LISTING_TAKEN')

    leads = [coverageLead(), coverageLead({ id: id(8163), name: 'Royal own', vendorId: GARAGE, googlePlaceId: null })]
    const onLead = await call(`/admin/vendors/${GARAGE}/google/link`, { placeId: 'g-royal' })
    expect(onLead.status).toBe(409)
    expect(onLead.body.code).toBe('GOOGLE_LISTING_ON_LEAD')

    const gone = await call(`/admin/vendors/${GARAGE}/google/link`, { placeId: 'g-gone' })
    expect(gone.status).toBe(404)
    expect(gone.body.code).toBe('GOOGLE_PLACE_GONE')
    expect(audits).toEqual([])
    expect(leads[1]!.googlePlaceId).toBeNull()
  })

  test('Google not connected: 503, and no Google call', async () => {
    setPlacesSourcesForTests({ google: null, ola: null })
    try {
      const res = await call(`/admin/vendors/${GARAGE}/google/link`, { placeId: 'g-royal' })
      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PLACES_UNCONFIGURED')
    } finally {
      setPlacesSourcesForTests(null)
    }
  })
})

describe('Unlink', () => {
  test('clears the listing and Google’s figures (and a Google pin) from the garage’s lead, audited', async () => {
    leads.push(coverageLead({ vendorId: GARAGE, status: 'onboarded' }))
    const res = await call(`/admin/vendors/${GARAGE}/google/unlink`, {})
    expect(res.status).toBe(200)
    expect(leads[0]).toMatchObject({
      vendorId: GARAGE,
      googlePlaceId: null,
      googleRating: null,
      googleReviewCount: null,
      googleFetchedAt: null,
      name: 'Royal Car Wash',
      pinSource: null,
      lat: null,
    })
    expect(audits).toEqual([
      {
        action: 'garage_google_unlinked',
        actor: { sub: 'admin', name: 'admin' },
        summary: { vendorId: GARAGE, leadId: id(8160) },
        detail: { placeId: 'g-royal' },
      },
    ])
  })

  test('nothing to unlink is a 404', async () => {
    const res = await call(`/admin/vendors/${GARAGE}/google/unlink`, {})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('GOOGLE_LISTING_NOT_FOUND')
  })
})
