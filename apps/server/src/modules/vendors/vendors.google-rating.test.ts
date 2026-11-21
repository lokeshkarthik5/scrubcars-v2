/**
 * Google rating for new garages (21 Nov 2026) through the real list and
 * garage page code, with only the database stood in for: a card carries
 * Google's rating while the garage has fewer than 5 counted Detlio reviews,
 * never from 5, never on the map's payload (`map=true`), and never once 30
 * days old; the garage page carries it whatever the count (its small "Also"
 * line). The list reads the leads once for the whole page.
 */
import { afterEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { vendorsService, vendorCardsFor } = await import('./vendors.service.js')
const { vendorsRepository } = await import('./vendors.repository.js')
const { reviewsRepository } = await import('../reviews/reviews.repository.js')
const { tiersService } = await import('../tiers/tiers.service.js')
const { citiesService } = await import('../cities/cities.service.js')
const { reachService } = await import('../reach/reach.service.js')
const { reachRepository } = await import('../reach/reach.repository.js')
const { branchGroupsRepository } = await import('../branch-groups/branch-groups.repository.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const NEW_LINKED = id(8130)
const RATED_LINKED = id(8131)
const UNLINKED = id(8132)
const STALE = id(8133)
const DAY = 24 * 60 * 60 * 1000

const restores: Array<() => void> = []
function patch(target: object, key: string, value: unknown) {
  const holder = target as Record<string, unknown>
  const original = holder[key]
  holder[key] = value
  restores.push(() => {
    holder[key] = original
  })
}
afterEach(() => {
  while (restores.length) restores.pop()!()
})

function garageRow(vendorId: string) {
  return {
    id: vendorId,
    businessName: `Garage ${vendorId.slice(-4)}`,
    logoUrl: null,
    city: 'Chennai',
    cityId: null,
    isVerified: true,
    status: 'active',
    doorstepEnabled: false,
    dropinEnabled: true,
    pickupEnabled: false,
    pickupRadiusKm: null,
    doorstepWholeCity: false,
    pickupWholeCity: false,
    lat: 13.08,
    lng: 80.27,
    services: [],
    photos: [],
    workingHours: [],
    serviceAreas: [],
    slotIntervalMins: 30,
    bookingsPausedAt: null,
    bookingsPausedReason: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  }
}

/** Counted Detlio reviews per garage, and the leads' Google figures. */
const COUNTED: Record<string, number> = { [NEW_LINKED]: 3, [RATED_LINKED]: 5, [UNLINKED]: 0, [STALE]: 0 }
let googleReads = 0

function standIn() {
  googleReads = 0
  patch(vendorsRepository, 'listPublicVendorsByIds', async (ids: string[]) => ids.map(garageRow))
  patch(vendorsRepository, 'listClosuresForVendors', async () => [])
  patch(reviewsRepository, 'ratingAggregates', async (ids: string[]) =>
    ids.filter((vendorId) => COUNTED[vendorId]).map((vendorId) => ({ vendorId, average: 4.8, count: COUNTED[vendorId]! }))
  )
  patch(reviewsRepository, 'tagCounts', async () => [])
  patch(tiersService, 'customerTiers', async () => new Map())
  // Branches (0081) and the Luxury badge (0083): none of these garages has either.
  patch(branchGroupsRepository, 'listCardGroups', async () => [])
  patch(branchGroupsRepository, 'listLiveBranches', async () => [])
  patch(vendorsRepository, 'listLuxuryBadges', async () => new Map())
  patch(citiesService, 'rules', async () => ({ cities: [], standingOf: () => ({ cityShown: true }) }))
  patch(vendorsRepository, 'listGoogleRatings', async (ids: string[], heldSince: Date) => {
    googleReads++
    const now = Date.now()
    const rows = [
      { vendorId: NEW_LINKED, googleRating: '4.6', googleReviewCount: 312, googleFetchedAt: new Date(now - 3 * DAY) },
      { vendorId: RATED_LINKED, googleRating: '4.4', googleReviewCount: 186, googleFetchedAt: new Date(now - 3 * DAY) },
      { vendorId: STALE, googleRating: '4.9', googleReviewCount: 40, googleFetchedAt: new Date(now - 31 * DAY) },
    ]
    // As the real read: only leads read inside the 30 days come back.
    return rows.filter((row) => ids.includes(row.vendorId) && row.googleFetchedAt > heldSince)
  })
}

const PAGE = [NEW_LINKED, RATED_LINKED, UNLINKED, STALE].map((vendorId) => ({ id: vendorId, distanceM: 1200 }))

describe('the garage cards', () => {
  test('Google’s rating only on a linked garage with fewer than 5 counted reviews, read once', async () => {
    standIn()
    const cards = await vendorCardsFor(PAGE)
    const byId = new Map(cards.map((card) => [card.id, card]))
    expect(byId.get(NEW_LINKED)!.google).toEqual({ rating: 4.6, reviewCount: 312 })
    // Detlio's own stays as it was, apart.
    expect(byId.get(NEW_LINKED)!.rating).toBe(4.8)
    expect(byId.get(NEW_LINKED)!.reviewCount).toBe(3)
    expect(byId.get(RATED_LINKED)!.google).toBeNull()
    expect(byId.get(UNLINKED)!.google).toBeNull()
    expect(byId.get(STALE)!.google).toBeNull()
    expect(googleReads).toBe(1)
  })

  test('the map’s payload never carries Google’s rating, and does not read it', async () => {
    standIn()
    const cards = await vendorCardsFor(PAGE, undefined, { map: true })
    expect(cards.every((card) => card.google === null)).toBe(true)
    expect(googleReads).toBe(0)
  })

  test('GET /vendors?map=true (the map views) carries none; the list does', async () => {
    standIn()
    patch(vendorsRepository, 'listPublicVendorPage', async (params: { segment: string }) =>
      params.segment === 'located' ? PAGE : []
    )
    const map = await vendorsService.listPublicVendors({ map: true, includeUnlocated: false } as never)
    expect(map.items).toHaveLength(4)
    expect(map.items.some((card) => card.google !== null)).toBe(false)
    expect(JSON.stringify(map)).not.toContain('312')

    const list = await vendorsService.listPublicVendors({ includeUnlocated: false } as never)
    expect(list.items.find((card) => card.id === NEW_LINKED)!.google).toEqual({ rating: 4.6, reviewCount: 312 })
  })
})

describe('the map’s "just outside" group', () => {
  // The map's list for Doorstep or Pickup with a location carries the
  // "just outside" group too (reach.service withReach): its cards are the
  // map's payload as well, so they never carry Google's rating either.
  async function withOutside(map: boolean) {
    standIn()
    patch(reachRepository, 'summary', async () => {
      throw new Error('not read here')
    })
    patch(reachRepository, 'listJustOutside', async () => [
      { id: NEW_LINKED, distanceM: 9000, coverKm: 5, outsideM: 4000 },
    ])
    const query = {
      bookingType: 'doorstep',
      lat: 13.08,
      lng: 80.27,
      includeUnlocated: false,
      ...(map ? { map: true } : {}),
    } as never
    return reachService.withReach({ items: [], nextCursor: null } as never, query)
  }

  test('on the map: none, and the leads are not read', async () => {
    const answer = await withOutside(true)
    expect(answer.outside).toHaveLength(1)
    expect(answer.outside![0]!.google).toBeNull()
    expect(googleReads).toBe(0)
  })

  test('on the list: Google’s while it is the main one', async () => {
    const answer = await withOutside(false)
    expect(answer.outside![0]!.google).toEqual({ rating: 4.6, reviewCount: 312 })
  })
})

describe('the garage page', () => {
  test('carries Google’s rating whatever the count, for its small line', async () => {
    standIn()
    patch(vendorsRepository, 'findPublicVendorById', async (vendorId: string) => garageRow(vendorId))
    patch(vendorsRepository, 'listPhotos', async () => [])
    patch(vendorsRepository, 'listServices', async () => [])
    const rated = await vendorsService.getPublicVendor(RATED_LINKED)
    expect(rated.google).toEqual({ rating: 4.4, reviewCount: 186 })
    expect(rated.rating).toBe(4.8)
    const stale = await vendorsService.getPublicVendor(STALE)
    expect(stale.google).toBeNull()
    const unlinked = await vendorsService.getPublicVendor(UNLINKED)
    expect(unlinked.google).toBeNull()
  })
})
