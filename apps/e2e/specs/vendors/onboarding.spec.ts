/**
 * A garage signing up.
 *
 * The only flow in the app that creates a vendor from nothing, and the only
 * one gated on a map pin. Runs signed out, so it does not use a storageState.
 */
import { test, expect } from '../../support/fixtures'
import { latestOtp, sql } from '../../support/db'
import { UNREGISTERED_VENDOR_PHONE } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

test('a new owner signs up and their garage is created', async ({ page }) => {
  const phone = UNREGISTERED_VENDOR_PHONE

  // Repeatable: a previous run would have made this a returning owner.
  await sql`delete from vendors where owner_id in (select id from users where phone = ${phone})`
  await sql`delete from users where phone = ${phone}`

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

  // Step 2 is where the garage is actually written, and creating it ends the
  // wizard: app-provider sends anyone who already has a garage away from
  // /onboarding (app-provider.tsx:106), so the app lands on /home from here.
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
})

/**
 * Marked `fail` on purpose: this is a bug the suite found, not a spec that has
 * not been written yet.
 *
 * Steps 3 and 4 collect working hours and the first service, but the garage is
 * created at step 2 — and from that moment app-provider redirects every
 * /onboarding route to /home. So a garage onboarded through the real UI is
 * saved with **no working hours at all**, and validateSlotAvailability rejects
 * any day it has no hours for. The garage therefore cannot take a booking even
 * after an admin verifies it.
 *
 * There is more than one reasonable fix — create the vendor at step 4, or
 * exempt an in-progress wizard from the guard — so this documents the gap
 * rather than choosing one. When it is fixed this test will start passing and
 * Playwright will report the `fail` annotation as stale, which is the prompt to
 * delete this comment.
 */
test('onboarding should collect working hours before finishing', async () => {
  test.fail()

  const [vendor] = await sql<{ id: string }[]>`
    select v.id from vendors v join users u on u.id = v.owner_id
     where u.phone = ${UNREGISTERED_VENDOR_PHONE}
  `
  const [{ n }] = await sql<{ n: string }[]>`
    select count(*)::text as n from vendor_working_hours where vendor_id = ${vendor.id}
  `

  // A garage with no hours can never be booked.
  expect(Number(n)).toBeGreaterThan(0)
})
