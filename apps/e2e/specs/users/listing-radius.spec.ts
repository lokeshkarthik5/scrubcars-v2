/**
 * How far the garage list reaches (owner decision, 2026-10-16): every garage
 * within 50 km of the customer, nearest first, on the list, Home and the map;
 * no radius for a typed search; doorstep bounded by each garage's own reach,
 * which is 10 km for a garage that left it empty, at checkout as in the list.
 *
 * Distances from ORIGIN in the seed: MAIN 0, the fillers 7.8–24.8 km (Filler
 * 12 the furthest), the scheduling garages 32–37 km, INSPECT 42.2 km, REFUNDS
 * 52.6 km and HOME_PROMO (Vellore) 124.7 km. Admin specs verify garages near
 * Chennai mid-run, so lists are checked with toContain and by order, never by
 * count.
 *
 * Read-only, apart from one unpinned garage made and removed in its own test.
 */
import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import {
  ADDRESSES,
  CUSTOMERS,
  ORIGIN,
  SERVICES,
  STAFF,
  UNSET_RADIUS_COVERED,
  UNSET_RADIUS_OUTSIDE,
  VENDORS,
  fillerVendorId,
} from '../../support/seed-ids'

type Listed = { id: string; distanceKm: number | null }
type ListBody = {
  items: Listed[]
  nextCursor: string | null
  radiusKm: number | null
  appliedRadiusKm: number | null
}

async function list(
  request: APIRequestContext,
  params: Record<string, string | number>
): Promise<ListBody> {
  const response = await request.get(`${API}/api/v1/vendors`, { params })
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.success).toBe(true)
  return body.data as ListBody
}

/** Every page of a list, following its cursor to the end. */
async function allPages(
  request: APIRequestContext,
  params: Record<string, string | number>
): Promise<Listed[]> {
  const items: Listed[] = []
  let cursor: string | null = null
  for (let page = 0; page < 50; page++) {
    const body: ListBody = await list(request, cursor ? { ...params, cursor } : params)
    expect(body.radiusKm).toBe(50)
    items.push(...body.items)
    cursor = body.nextCursor
    if (!cursor) break
  }
  expect(cursor).toBeNull()
  return items
}

const FROM_ORIGIN = { lat: ORIGIN.lat, lng: ORIGIN.lng }
/** Madurai: 350 km from the nearest seeded garage. */
const MADURAI = { lat: 9.925, lng: 78.12 }
const ids = (items: Listed[]) => items.map((item) => item.id)

/**
 * Seeded garages nothing pauses, hides or moves mid-run, nearest first from
 * ORIGIN; enough to span several pages of four. Not LastBay: refund-on-refusal
 * pauses it for most of that file, which can run alongside this one, and a
 * paused garage drops out of every list. Capacity and Holiday still cover the
 * 32–37 km band, and Inspect 42.2 km.
 */
const STEADY = [
  VENDORS.main.id,
  VENDORS.second.id,
  VENDORS.narrow.id,
  ...Array.from({ length: 12 }, (_, i) => fillerVendorId(i)),
  VENDORS.capacity.id,
  VENDORS.holiday.id,
  VENDORS.inspect.id,
]

test.describe('the 50 km list @p0', () => {
  test('lists every garage within 50 km of the customer, nearest first', async ({ request }) => {
    const body = await list(request, { ...FROM_ORIGIN, bookingType: 'dropin', limit: 50 })
    const listed = ids(body.items)

    // Not just the nearest ring: 24.8 km and 42.2 km are both in.
    expect(listed).toContain(VENDORS.main.id)
    expect(listed).toContain(fillerVendorId(11))
    expect(listed).toContain(VENDORS.inspect.id)
    // 52.6 km and 124.7 km are not.
    expect(listed).not.toContain(VENDORS.refunds.id)
    expect(listed).not.toContain(VENDORS.homePromo.id)

    // Nearest first, and garages with no pin (if any) only after every one
    // with a distance.
    const located = body.items.filter((item) => item.distanceKm !== null)
    const distances = located.map((item) => item.distanceKm as number)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
    expect(Math.max(...distances)).toBeLessThanOrEqual(50)
    expect(body.items.slice(0, located.length).every((item) => item.distanceKm !== null)).toBe(true)

    // The bound searched, and nothing in the old field: bundles from the
    // ladder days print "Nothing within 10 km" for any value over 10.
    expect(body.radiusKm).toBe(50)
    expect(body.appliedRadiusKm).toBeNull()
  })

  test('the radius is the same on every page: pages of 4 add up to one page of 50', async ({
    request,
  }) => {
    // Retried as a whole: a garage an admin spec verifies between two page
    // reads shifts the offsets, which is a race of the run, not of the list.
    await expect(async () => {
      const whole = await list(request, { ...FROM_ORIGIN, bookingType: 'dropin', limit: 50 })
      const paged = await allPages(request, { ...FROM_ORIGIN, bookingType: 'dropin', limit: 4 })

      expect(new Set(ids(paged)).size).toBe(paged.length)
      const steady = (items: Listed[]) => ids(items).filter((id) => STEADY.includes(id))
      expect(steady(paged)).toEqual(steady(whole.items))
      // Including the far side of the old 10 km ring, which page 2 used to skip.
      expect(steady(paged)).toEqual(STEADY)
    }).toPass({ timeout: 15_000 })
  })

  test('nothing within 50 km: the bound is still said, with an empty list', async ({ request }) => {
    const body = await list(request, {
      ...MADURAI,
      bookingType: 'dropin',
      includeUnlocated: 'false',
    })
    expect(body.items).toEqual([])
    expect(body.radiusKm).toBe(50)
    expect(body.appliedRadiusKm).toBeNull()
  })

  test('a typed search has no radius: a garage is found by its name wherever it is', async ({
    request,
  }) => {
    const body = await list(request, { ...FROM_ORIGIN, q: VENDORS.homePromo.name })
    expect(ids(body.items)).toContain(VENDORS.homePromo.id)
    expect(body.items.find((item) => item.id === VENDORS.homePromo.id)?.distanceKm).toBeGreaterThan(100)
    expect(body.radiusKm).toBeNull()
  })

  test('without a location there is no radius and no distance', async ({ request }) => {
    const body = await list(request, { bookingType: 'dropin', limit: 50 })
    expect(body.radiusKm).toBeNull()
    expect(body.items.every((item) => item.distanceKm === null)).toBe(true)
  })
})

test.describe('doorstep reach @p0', () => {
  // No saved session: the lists are public, and checkout below logs in fresh.
  test('a garage with no radius set covers 10 km, in the list and at checkout alike', async ({
    request,
  }) => {
    // The list: an address ~7 km away is covered, one ~14 km away is not.
    const near = await list(request, {
      ...UNSET_RADIUS_COVERED,
      bookingType: 'doorstep',
      limit: 50,
    })
    expect(ids(near.items)).toContain(VENDORS.unsetRadius.id)
    // Doorstep is bounded by each garage's reach, not by the list's 50 km.
    expect(near.radiusKm).toBeNull()

    const far = await list(request, {
      ...UNSET_RADIUS_OUTSIDE,
      bookingType: 'doorstep',
      limit: 50,
    })
    expect(ids(far.items)).not.toContain(VENDORS.unsetRadius.id)

    // Checkout, at a time off the garage's half-hour grid tomorrow, so no
    // payment order is ever made. The coverage check runs before the slot
    // check: the covered address gets as far as the time, the other does not.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    })
    // A fresh login rather than a saved state: those access tokens live 15
    // minutes from global setup, this file runs well into the users project,
    // and a bare request context has no app to refresh them, so a slow run or
    // a CI retry would get a 401 instead of the answer under test.
    // CUSTOMERS.doorstepReach belongs to this file alone, so clearing its
    // codes to log in cannot race another spec.
    const customer = await loginViaApi(CUSTOMERS.doorstepReach.phone)
    try {
      const attempt = (addressId: string) =>
        customer.post(`${API}/api/v1/booking-intents`, {
          data: {
            vendorId: VENDORS.unsetRadius.id,
            serviceIds: [SERVICES.unsetRadiusWash.id],
            vehicleId: CUSTOMERS.doorstepReach.vehicleId,
            bookingType: 'doorstep',
            addressId,
            scheduledAt: new Date(`${tomorrow}T10:07:00+05:30`).toISOString(),
          },
        })

      const covered = await attempt(ADDRESSES.reachCovered)
      expect(covered.status()).toBe(400)
      expect((await covered.json()).code).toBe('SLOT_UNAVAILABLE')

      const outside = await attempt(ADDRESSES.reachOutside)
      expect(outside.status()).toBe(400)
      expect(await outside.json()).toEqual({
        success: false,
        message: 'This garage does not travel to that address',
        code: 'OUTSIDE_DOORSTEP_RADIUS',
      })
    } finally {
      await customer.dispose()
    }
  })

  test('a doorstep garage with no pin is not listed: it could never be booked', async ({
    request,
  }) => {
    const name = `E2E Unpinned Doorstep ${Date.now().toString().slice(-5)}`
    const [row] = await sql<{ id: string }[]>`
      insert into vendors (owner_id, business_name, phone, address, city, pincode,
                           geo_source, is_verified, doorstep_enabled, dropin_enabled, status)
      values (${STAFF.narrowOwner.id}, ${name}, '9000007778', '2, No Pin Street',
              'Chennai', '600001', 'unset', true, true, false, 'active')
      returning id
    `
    try {
      // Listed where a garage with no pin can be used: a browse by name.
      expect(ids((await list(request, { q: name })).items)).toContain(row.id)

      // Never on the Doorstep tab, with or without a location.
      for (const params of [{ bookingType: 'doorstep' }, { ...FROM_ORIGIN, bookingType: 'doorstep' }]) {
        expect(ids((await list(request, { ...params, q: name })).items)).not.toContain(row.id)
      }
    } finally {
      await sql`delete from vendors where id = ${row.id}`
    }
  })
})

test.describe('public garage page @p0', () => {
  test("never carries the admin's internal notes", async ({ request }) => {
    for (const id of [VENDORS.unsetRadius.id, VENDORS.main.id]) {
      const response = await request.get(`${API}/api/v1/vendors/${id}`)
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).not.toHaveProperty('notes')
      expect(JSON.stringify(body)).not.toContain(VENDORS.unsetRadius.notes)
    }
  })
})

/** A browsing location, as the location store keeps it. ORIGIN unless said. */
async function standAt(page: Page, point: { lat: number; lng: number } = FROM_ORIGIN) {
  await page.context().setGeolocation({ latitude: point.lat, longitude: point.lng })
  // Registered after the fixture's own init script, so it is the one that stands.
  await page.context().addInitScript((at) => {
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: {
          location: { ...at, label: 'Home', source: 'gps', updatedAt: Date.now() },
          promptDismissedAt: Date.now(),
        },
        version: 0,
      })
    )
  }, point)
}

test.describe('the 50 km list on screen @p0', () => {
  test.use({ storageState: asRole('customer-browse') })

  test('the garage list says how far it reaches and goes past 10 km', async ({ page }) => {
    await standAt(page)
    await page.goto('/garages')

    // The heading the other specs look for stays.
    await expect(page.getByRole('heading', { name: 'Nearby Garages' })).toBeVisible()
    await expect(page.getByText('Garages within 50 km of you, nearest first')).toBeVisible()
    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
    // 24.8 km out, which the old ladder never reached from here.
    await expect(page.getByText('Filler Garage 12').first()).toBeAttached()
    await expect(page.getByText(/Nothing within 10 km/)).toHaveCount(0)
  })

  test("the map lists the customer's whole 50 km without waiting to be moved", async ({ page }) => {
    await standAt(page)
    await page.goto('/map')

    // The cards come from the nearby list, which needs no map bounds.
    await expect(page.getByRole('link', { name: /Filler Garage 12/ })).toBeAttached()
    await expect(page.getByRole('link', { name: new RegExp(VENDORS.inspect.name) })).toBeAttached()
    await expect(page.getByRole('link', { name: new RegExp(VENDORS.refunds.name) })).toHaveCount(0)
  })

  test('nothing within 50 km: the list says so plainly', async ({ page }) => {
    await standAt(page, MADURAI)
    await page.goto('/garages')

    await expect(page.getByRole('heading', { name: 'Nearby Garages' })).toBeVisible()
    // Either above the not-yet-pinned garages or as the empty list: the same
    // words, and never a far garage passed off as near.
    await expect(page.getByText('No garages within 50 km of you yet.').first()).toBeVisible()
    await expect(page.getByText(VENDORS.main.name)).toHaveCount(0)
  })

  test('nothing within 50 km: the map says so and leads to every garage', async ({ page }) => {
    await standAt(page, MADURAI)
    await page.goto('/map')

    await expect(page.getByText('No garages within 50 km of you yet.')).toBeVisible()
    const all = page.getByRole('link', { name: 'See all garages' })
    await expect(all).toBeVisible()
    await expect(all).toHaveAttribute('href', '/garages')
  })
})
