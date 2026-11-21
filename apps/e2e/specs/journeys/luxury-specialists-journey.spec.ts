/**
 * Luxury car specialists (0083, owner-approved screens 21 Nov 2026): a
 * Silver garage applies, the team approves it in admin, and a customer with
 * a luxury car sees the badge, "Specialists for your <Make>" and the filter.
 *
 * LUXURY_FIXTURES (ids 8200–8249, far from every other fixture): applicant
 * (Silver, never applied), approved (Silver, badge already approved) and
 * plain (Silver, no badge), and a customer whose car is a "Mercedes Benz".
 * The applicant sends its application through the API: the photos are
 * uploads, and E2E has no bucket to put them in (the API checks only that
 * each is the garage's own luxury key). Everything after that is on screen.
 * The rules are unit-tested in apps/server/src/lib/luxury.test.ts and
 * packages/core/src/luxury.test.ts, and every route's who-may-do-what in
 * modules/luxury/luxury.routes.test.ts.
 *
 * The applicant's application and badge are put back as seeded before and
 * after, so the file can run again.
 */
import type { Browser, Page } from '@playwright/test'
import { answerCookieQuestion } from '../../support/consent'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi, setActiveVendor, statePath } from '../../support/auth'
import { sql } from '../../support/db'
import { USERS_ORIGIN, VENDORS_ORIGIN } from '../../support/journey'
import { blockThirdParties, dismissLocationPrompt } from '../../support/network'
import { LUXURY_FIXTURES as L } from '../../support/seed-ids'

const ADMIN_ORIGIN = 'http://localhost:3002'
const R2 = process.env.R2_PUBLIC_BASE_URL ?? 'http://localhost:9000/detlio-e2e'
const photoUrl = (n: number) => `${R2}/vendors/${L.applicant.id}/luxury/00000000-0000-4000-8000-0000000082${40 + n}.jpg`

/** Where the customer is, as the location store keeps a phone fix. */
async function standAt(page: Page, point: { lat: number; lng: number }) {
  await page.context().addInitScript((at) => {
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: {
          location: { ...at, label: 'Luxury Lane', source: 'gps', updatedAt: Date.now() },
          promptDismissedAt: Date.now(),
        },
        version: 0,
      })
    )
  }, { lat: point.lat, lng: point.lng })
}

async function openAdmin(browser: Browser) {
  const ctx = await browser.newContext({
    storageState: statePath('admin'),
    baseURL: ADMIN_ORIGIN,
    viewport: { width: 1280, height: 900 },
  })
  await answerCookieQuestion(ctx)
  await blockThirdParties(ctx)
  return { ctx, page: await ctx.newPage() }
}

async function openGarage(browser: Browser) {
  const api = await loginViaApi(L.owners.applicant.phone, 'vendor')
  const ctx = await browser.newContext({
    storageState: await api.storageState(),
    baseURL: VENDORS_ORIGIN,
    viewport: { width: 412, height: 915 },
    isMobile: true,
  })
  await answerCookieQuestion(ctx)
  await setActiveVendor(ctx, L.applicant.id)
  await blockThirdParties(ctx)
  return { api, ctx, page: await ctx.newPage() }
}

/** The customer, signed in, on a phone, standing at the fixtures' pin. */
async function openCustomer(browser: Browser) {
  const api = await loginViaApi(L.customer.phone, 'customer')
  const ctx = await browser.newContext({
    storageState: await api.storageState(),
    baseURL: USERS_ORIGIN,
    viewport: { width: 412, height: 915 },
    isMobile: true,
  })
  await api.dispose()
  await answerCookieQuestion(ctx)
  await dismissLocationPrompt(ctx)
  await blockThirdParties(ctx)
  const page = await ctx.newPage()
  await standAt(page, L.pin)
  return { ctx, page }
}

/** A garage's card in the list, found by where its link goes. */
const card = (scope: Page | ReturnType<Page['locator']>, garage: { id: string }) =>
  scope.locator(`a[href^="/garage/${garage.id}"]`)

async function resetApplicant() {
  await sql`delete from luxury_applications where vendor_id = ${L.applicant.id}`
  // The applicant, and the plain garage's badge the customer test gives it for a while.
  await sql`update vendors set luxury_approved_at = null, luxury_approved_by = null, luxury_brands = null
             where id in (${L.applicant.id}, ${L.plain.id})`
}

test.describe.serial('luxury car specialists @p0', () => {
  test.beforeAll(resetApplicant)
  test.afterAll(resetApplicant)

  test('a Silver garage applies and sees its application under review', async ({ browser }) => {
    const { api, ctx, page } = await openGarage(browser)
    try {
      // Settings → Profile: the new row, then the form, open to a Silver garage.
      await page.goto('/settings')
      await expect(page.getByRole('link', { name: /Luxury car specialist/ })).toBeVisible()
      await page.goto('/settings/luxury')
      await expect(page.getByText('Apply for the badge')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Send for review' })).toBeDisabled()

      // Sent with its brands, 3 photos and the bay (the photos as uploaded keys).
      const sent = await api.put(`${API}/api/v1/vendors/me/luxury`, {
        headers: { 'X-Vendor-Id': L.applicant.id },
        data: {
          brands: ['Mini', 'BMW', 'Mercedes-Benz'],
          photos: [1, 2, 3].map((n) => ({ url: photoUrl(n), caption: n === 1 ? 'BMW 5 Series' : null })),
          coveredBay: true,
          products: 'Gtechniq Crystal Serum',
          staff: '2 detailers, trained by Gtechniq',
        },
      })
      expect(sent.status()).toBe(200)
      expect((await sent.json()).data.application).toMatchObject({ status: 'review', brands: ['BMW', 'Mercedes-Benz', 'Mini'] })

      await page.reload()
      await expect(page.getByText('Under review', { exact: true })).toBeVisible()
      await expect(page.getByText('What you sent')).toBeVisible()
      await expect(page.getByText('Gtechniq Crystal Serum')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Edit application' })).toBeVisible()
    } finally {
      await api.dispose()
      await ctx.close()
    }
  })

  test('admin finds it under Luxury applications and approves it', async ({ browser }) => {
    const { ctx, page } = await openAdmin(browser)
    try {
      await page.goto('/vendors?show=luxury')
      await expect(page.getByRole('button', { name: /^More filters/ })).toHaveAttribute('aria-expanded', 'true')
      const chip = page.getByRole('group', { name: 'More filters' }).getByRole('button', { name: /^Luxury applications \d+$/ })
      await expect(chip).toHaveAttribute('aria-pressed', 'true')

      const row = page.getByRole('row', { name: L.applicant.name, exact: true })
      await expect(row).toBeVisible()
      // The approved and plain garages are not waiting.
      await expect(page.getByRole('row', { name: L.approved.name, exact: true })).toHaveCount(0)
      await expect(page.getByRole('row', { name: L.plain.name, exact: true })).toHaveCount(0)

      await row.getByRole('button', { name: L.applicant.name, exact: true }).click()
      const details = page.getByRole('complementary', { name: 'Garage details' })
      await expect(details).toBeVisible()
      await expect(details.getByText(/first time/)).toBeVisible()
      await expect(details.getByRole('list', { name: 'Brands' }).first()).toContainText('BMW')
      await expect(details.getByText('Gtechniq Crystal Serum')).toBeVisible()
      // Ask for more and Decline wait for a note; Approve does not.
      await expect(details.getByRole('button', { name: 'Decline' })).toBeDisabled()
      await details.getByRole('button', { name: /Approve$/ }).click()
      await expect(details.getByText(/shown to customers/)).toBeVisible()
      await expect(details.getByRole('button', { name: 'Remove badge' })).toBeVisible()

      const audit = await sql<{ action: string; actor_name: string }[]>`
        select action, actor_name from admin_audit_log
         where action = 'luxury_approved' and summary->>'vendorId' = ${L.applicant.id}
         order by created_at desc limit 1
      `
      expect(audit[0]).toEqual({ action: 'luxury_approved', actor_name: 'E2E Admin' })

      // Under Luxury specialists now, with the seeded one.
      await page.goto('/vendors?show=specialists')
      await expect(page.getByRole('row', { name: L.applicant.name, exact: true })).toBeVisible()
      await expect(page.getByRole('row', { name: L.approved.name, exact: true })).toBeVisible()
      await expect(page.getByRole('row', { name: L.plain.name, exact: true })).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('the API: the filter keeps the two specialists, and a card says only the brands', async ({ request }) => {
    const params = { lat: String(L.pin.lat), lng: String(L.pin.lng), bookingType: 'dropin', limit: '50' }
    const all = (await (await request.get(`${API}/api/v1/vendors`, { params })).json()).data.items as Array<{
      id: string
      luxury: { brands: string[] } | null
    }>
    expect(all.find((v) => v.id === L.plain.id)?.luxury).toBeNull()
    expect(all.find((v) => v.id === L.applicant.id)?.luxury).toEqual({ brands: ['BMW', 'Mercedes-Benz', 'Mini'] })

    const only = (await (await request.get(`${API}/api/v1/vendors`, { params: { ...params, luxury: '1' } })).json()).data
      .items as Array<{ id: string }>
    const ours = only.map((v) => v.id).filter((id) => [L.applicant.id, L.approved.id, L.plain.id].includes(id as never))
    expect(ours.sort()).toEqual([L.applicant.id, L.approved.id].sort())

    // luxuryMake: only the specialists approved for that make.
    const forMake = async (make: string) =>
      ((await (await request.get(`${API}/api/v1/vendors`, { params: { ...params, luxuryMake: make } })).json()).data
        .items as Array<{ id: string }>)
        .map((v) => v.id)
        .filter((id) => [L.applicant.id, L.approved.id, L.plain.id].includes(id as never))
        .sort()
    expect(await forMake('Mercedes-Benz')).toEqual([L.applicant.id, L.approved.id].sort())
    expect(await forMake('Audi')).toEqual([L.approved.id])
    expect(await forMake('Porsche')).toEqual([])
    expect((await request.get(`${API}/api/v1/vendors`, { params: { ...params, luxuryMake: 'benz' } })).status()).toBe(400)

    const page = (await (await request.get(`${API}/api/v1/vendors/${L.approved.id}`)).json()).data as Record<string, unknown>
    expect(page.luxury).toEqual({ brands: [...L.approved.brands] })
    for (const key of ['luxuryApprovedAt', 'luxuryApprovedBy', 'luxuryBrands']) expect(page).not.toHaveProperty(key)
  })

  test('the customer sees "Specialists for your Mercedes-Benz", the filter and the badge', async ({ browser }) => {
    // The plain garage is a specialist for a while, but for Porsche only: never in
    // "Specialists for your Mercedes-Benz", though the plain chip finds it.
    await sql`update vendors set luxury_approved_at = now(), luxury_approved_by = 'E2E', luxury_brands = ${['Porsche']}
               where id = ${L.plain.id}`
    const { ctx, page } = await openCustomer(browser)
    try {
      await page.goto('/garages')
      const row = page.getByRole('region', { name: 'Specialists for your Mercedes-Benz' })
      await expect(row).toBeVisible()
      await expect(row.getByText('Approved by Detlio for luxury cars')).toBeVisible()
      await expect(card(row, L.applicant)).toBeVisible()
      await expect(card(row, L.approved)).toBeVisible()
      await expect(card(row, L.plain)).toHaveCount(0)
      await expect(card(row, L.approved).getByText('Luxury specialist', { exact: true })).toBeVisible()

      // "See all 2" turns on the row's own filter: Mercedes-Benz specialists only.
      const filter = page.getByRole('button', { name: 'Luxury specialists' })
      await expect(filter).toHaveAttribute('aria-pressed', 'false')
      const asked = page.waitForRequest(
        (r) => r.url().includes('/api/v1/vendors?') && r.url().includes('luxury=1') && r.url().includes('luxuryMake=Mercedes-Benz')
      )
      await row.getByRole('button', { name: /^See all 2$/ }).click()
      await asked
      await expect(filter).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('heading', { level: 2, name: 'Specialists for your Mercedes-Benz' })).toBeVisible()
      await expect(row).toHaveCount(0)
      await expect(card(page, L.plain)).toHaveCount(0)
      await expect(card(page, L.applicant)).toBeVisible()

      // The map peek opens the map with the filter still on.
      const peek = page.locator('a.map-peek')
      await expect(peek).toHaveAttribute('href', /[?&]luxury=1(&|$)/)
      await expect(peek).toHaveAttribute('href', /[?&]luxuryMake=Mercedes-Benz(&|$)/)
      await expect(peek).toHaveAccessibleName(/specialists near you/)

      // Off again: every garage, and the row back.
      await filter.click()
      await expect(filter).toHaveAttribute('aria-pressed', 'false')
      await expect(card(page, L.plain)).toBeVisible()
      await expect(row).toBeVisible()

      // The chip itself: every specialist, the Porsche one too.
      await filter.click()
      await expect(page.getByRole('heading', { level: 2, name: 'Luxury specialists' })).toBeVisible()
      await expect(card(page, L.plain)).toBeVisible()
      await expect(card(page, L.applicant)).toBeVisible()
      await filter.click()

      // The garage page: the badge, the brands with hers in white, and "What this means".
      await page.goto(`/garage/${L.approved.id}`)
      const block = page.locator('[data-luxury-block]')
      await expect(block.getByText('Luxury specialist', { exact: true })).toBeVisible()
      await expect(block).toContainText('Handles BMW · Mercedes-Benz · Audi')
      await block.getByRole('button', { name: 'What this means' }).click()
      const sheet = page.getByRole('dialog', { name: 'Luxury car specialist: what this means' })
      await expect(sheet).toBeVisible()
      await expect(sheet.getByText('Is a Silver or Gold garage on Detlio.')).toBeVisible()
      await expect(sheet.getByRole('region', { name: 'Brands it handles' })).toContainText('Mercedes-Benz')
      await expect(sheet.getByText(/Prices are the same for everyone/)).toBeVisible()
      // On <body>, so the section's leftover animation transform can't pin it inside the section.
      expect(await sheet.evaluate((el) => el.parentElement === document.body)).toBe(true)
      await page.keyboard.press('Escape')
      await expect(sheet).toHaveCount(0)
      // The medal's own "What this means" sheet (before the badge on the page) goes the same way.
      await page.getByRole('button', { name: 'What this means' }).first().click()
      const medal = page.getByRole('dialog', { name: 'Silver garage: what this means' })
      await expect(medal).toBeVisible()
      expect(await medal.evaluate((el) => el.parentElement === document.body)).toBe(true)
      await page.keyboard.press('Escape')

      // The map, opened with the filter on (as the peek links it), counts specialists only.
      await page.goto('/map?bookingType=dropin&luxury=1&luxuryMake=Mercedes-Benz')
      await expect(page.getByRole('button', { name: /^2 specialists near you/ })).toBeVisible()
      await page.goto('/map?bookingType=dropin&luxury=1')
      await expect(page.getByRole('button', { name: /^3 specialists near you/ })).toBeVisible()
    } finally {
      await ctx.close()
      await sql`update vendors set luxury_approved_at = null, luxury_approved_by = null, luxury_brands = null where id = ${L.plain.id}`
    }
  })

  test('below Silver the badge hides, and comes back with Silver', async ({ request }) => {
    await sql`update vendor_tier_standings set silver_at = null where vendor_id = ${L.approved.id}`
    try {
      const hidden = (await (await request.get(`${API}/api/v1/vendors/${L.approved.id}`)).json()).data
      expect(hidden.luxury).toBeNull()
    } finally {
      await sql`update vendor_tier_standings set silver_at = now() - interval '30 days' where vendor_id = ${L.approved.id}`
    }
    const back = (await (await request.get(`${API}/api/v1/vendors/${L.approved.id}`)).json()).data
    expect(back.luxury).toEqual({ brands: [...L.approved.brands] })
  })
})
