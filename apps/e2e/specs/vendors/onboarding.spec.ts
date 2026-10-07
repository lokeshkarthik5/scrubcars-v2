/**
 * A garage signing up.
 *
 * The only flow in the app that creates a vendor from nothing, and the only
 * one gated on a map pin. Runs signed out, so it does not use a storageState.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { forgetOtps, latestOtp, sql } from '../../support/db'
import { UNREGISTERED_VENDOR_PHONE } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

test('a new owner signs up and is taken through all four steps', async ({ page }) => {
  const phone = UNREGISTERED_VENDOR_PHONE

  // Repeatable: a previous run would have made this a returning owner.
  await sql`delete from vendors where owner_id in (select id from users where phone = ${phone})`
  await sql`delete from users where phone = ${phone}`
  // And a run within the last 30 seconds would have this number waiting.
  await forgetOtps(phone)

  await page.goto('/login')
  await page.locator('#sc-phone').fill(phone)
  await page.getByRole('button', { name: /Send OTP/i }).click()

  await page.waitForURL(/\/verify-otp/)
  const boxes = page.locator('input[maxlength="1"][inputmode="numeric"]')
  await boxes.first().click()
  await page.keyboard.type(await latestOtp(phone), { delay: 50 })
  await page.getByRole('button', { name: /^Verify/i }).click()

  // A vendor with no garage lands in the wizard rather than the dashboard.
  await expect(page).toHaveURL(/\/onboarding\/step-1/)

  // ── step 1: who you are ─────────────────────────────────────────────────
  await page.getByLabel('Business name').fill('E2E New Garage')
  await page.getByLabel('Owner name').fill('New Owner')
  await page.getByLabel('City').fill('Chennai')
  await page.getByRole('button', { name: /Continue/i }).click()

  // ── step 2: where you are ───────────────────────────────────────────────
  await expect(page).toHaveURL(/\/onboarding\/step-2/)

  const continueStep2 = page.getByRole('button', { name: /Continue/i })
  // The pin is the gate: coordinates are how customers find the garage, so the
  // step cannot be completed on text alone.
  await expect(continueStep2).toBeDisabled()

  // Geolocation is granted with fixed Chennai coordinates by the fixture, so
  // this needs neither map tiles nor the geocoder — both of which are blocked.
  await page.getByRole('button', { name: /Use my current location/i }).click()

  await page.getByLabel('Full address').fill('9, Onboarding Road, Adyar')
  await page.getByLabel('Pincode').fill('600020')
  await expect(continueStep2).toBeEnabled()
  await continueStep2.click()

  // ── step 3: when you work ───────────────────────────────────────────────
  // Reachable only because the route guard is scoped to the two steps that
  // create the garage; guarding all four sent the vendor home from here.
  await expect(page).toHaveURL(/\/onboarding\/step-3/)
  await page.getByRole('button', { name: /Continue/i }).click()

  // ── step 4: what you sell ───────────────────────────────────────────────
  await expect(page).toHaveURL(/\/onboarding\/step-4/)
  await page.getByLabel('Service name').fill('Onboarding Wash')
  await page.getByLabel(/^Price/).first().fill('450')
  await page.getByRole('button', { name: /^Add service/ }).click()
  // The step reports a count rather than listing what was added.
  await expect(page.getByText('1 service added.')).toBeVisible()

  await page.getByRole('button', { name: /Finish|Done|Go to dashboard/i }).click()
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByText(/under review/i)).toBeVisible()

  const [vendor] = await sql<{ id: string; is_verified: boolean; lat: number | null }[]>`
    select v.id, v.is_verified, v.lat from vendors v
      join users u on u.id = v.owner_id
     where u.phone = ${phone}
  `
  expect(vendor).toBeTruthy()
  expect(vendor.lat).not.toBeNull()
  // Unverified: an admin still has to let it into customer listings.
  expect(vendor.is_verified).toBe(false)

  // The point of steps 3 and 4. A garage with no working hours reads as closed
  // every day to the slot check, so it could never take a booking however many
  // times an admin verified it.
  const [{ n: hours }] = await sql<{ n: string }[]>`
    select count(*)::text as n from vendor_working_hours where vendor_id = ${vendor.id}
  `
  expect(Number(hours)).toBe(7)

  const services = await sql<{ name: string }[]>`
    select name from services where vendor_id = ${vendor.id}
  `
  expect(services.map((s) => s.name)).toContain('Onboarding Wash')
})

test.describe('an owner who already has a garage', () => {
  test.use({ storageState: asRole('vendor-owner') })

  test('cannot re-enter the creation steps', async ({ page }) => {
    // The guard still does its original job: an owner with a garage has no
    // business on the steps that make one. Additional garages come from the
    // admin panel.
    await page.goto('/onboarding/step-1')
    await expect(page).toHaveURL(/\/home/)

    await page.goto('/onboarding/step-2')
    await expect(page).toHaveURL(/\/home/)
  })
})
