/**
 * A garage going from "created by ops" to "booked by a customer".
 *
 * The chain that matters: an unverified garage is invisible, verifying it puts
 * it in the listings, and a service added on the vendor side is what a
 * customer can actually buy. Three apps, one row.
 */
import { test, expect, statePath } from '../../support/fixtures'
import { blockThirdParties, dismissLocationPrompt, stubRazorpay } from '../../support/network'
import { bookingsForUser, getBooking, sql } from '../../support/db'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { CUSTOMERS, STAFF } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

test('a garage is verified by ops, lists a service, and takes a booking', async ({ browser }) => {
  const name = `E2E Journey Garage ${Date.now().toString().slice(-5)}`

  // Created directly and owned by the vendor account that already has a
  // session, so the journey starts at the interesting part rather than
  // repeating the onboarding wizard covered in specs/vendors.
  const [garage] = await sql<{ id: string }[]>`
    insert into vendors (owner_id, business_name, phone, address, city, pincode,
                         lat, lng, geo_source, is_verified, dropin_enabled,
                         slot_interval_mins, status)
    values (${STAFF.owner.id}, ${name}, '9000008888', '7, Journey Lane', 'Chennai',
            '600001', 13.06, 80.26, 'map_pin', false, true, 30, 'active')
    returning id
  `
  await sql`
    insert into vendor_working_hours (vendor_id, day_of_week, open_time, close_time, is_closed)
    select ${garage.id}, generate_series(0, 6), '06:00:00', '22:00:00', false
  `
  await sql`
    insert into user_member_mapping (vendor_id, user_id, role, status)
    values (${garage.id}, ${STAFF.owner.id}, 'vendor_admin', 'active')
  `

  const contexts = await Promise.all(
    [
      { role: 'customer-journey', base: 'http://localhost:3000' },
      { role: 'vendor-owner', base: 'http://localhost:3001' },
      { role: 'admin', base: 'http://localhost:3002' },
    ].map(async ({ role, base }) => {
      const ctx = await browser.newContext({ storageState: statePath(role), baseURL: base })
      await stubRazorpay(ctx)
      await dismissLocationPrompt(ctx)
      await blockThirdParties(ctx)
      return ctx
    })
  )
  const [customerCtx, vendorCtx, adminCtx] = contexts
  await vendorCtx.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    ['detlio.activeVendorId', garage.id] as const
  )

  const customer = await customerCtx.newPage()
  const vendor = await vendorCtx.newPage()
  const admin = await adminCtx.newPage()

  // ── 1. unverified means invisible ────────────────────────────────────────
  await customer.goto('/search')
  await customer.getByRole('searchbox', { name: 'Search garages or services' }).fill(name)
  await expect(customer.getByText(name)).toHaveCount(0)

  // ── 2. ops lets it in ────────────────────────────────────────────────────
  await admin.goto('/vendors')
  await admin.getByRole('button', { name: `Verify ${name}` }).click()
  await expect
    .poll(async () => {
      const rows = await sql<{ is_verified: boolean }[]>`
        select is_verified from vendors where id = ${garage.id}
      `
      return rows[0]?.is_verified
    })
    .toBe(true)

  // ── 3. the garage lists something to sell ────────────────────────────────
  await vendor.goto('/services')
  await vendor.getByLabel('Service name').fill('Journey Wash')
  await vendor.getByLabel('Price (₹)').fill('550')
  await vendor.getByRole('button', { name: 'Add service' }).click()

  const findService = async () => {
    const rows = await sql<{ id: string }[]>`
      select id from services where vendor_id = ${garage.id} and name = 'Journey Wash'
    `
    return rows[0]?.id
  }
  await expect.poll(findService).toBeTruthy()
  const serviceId = (await findService())!

  // ── 4. a customer finds it and books it ──────────────────────────────────
  await customer.goto('/search')
  await customer.getByRole('searchbox', { name: 'Search garages or services' }).fill(name)
  await expect(customer.getByText(name).first()).toBeVisible()

  const garagePage = new GaragePage(customer)
  await garagePage.goto(garage.id)
  await expect(customer.getByText('Journey Wash').first()).toBeVisible()

  const checkout = new CheckoutPage(customer)
  await checkout.goto(garage.id, [serviceId])
  await checkout.pickTomorrowSlot()
  await checkout.pickVehicle(/Hyundai i20/)
  await expect(checkout.cta()).toHaveText('Pay ₹550')
  await checkout.pay()
  await customer.waitForURL(/\/bookings\/[0-9a-f-]+/)

  const [booking] = await bookingsForUser(CUSTOMERS.journey.id)
  expect(booking.amount).toBe('550.00')

  // ── 5. and the garage sees it ────────────────────────────────────────────
  await vendor.goto('/bookings')
  await vendor
    .getByRole('button', { name: `Accept booking for ${CUSTOMERS.journey.name}` })
    .first()
    .click()
  await expect.poll(async () => (await getBooking(booking.id))?.status).toBe('confirmed')

  await Promise.all(contexts.map((c) => c.close()))

  // Deliberately not deleted. The garage is now referenced by a booking, its
  // items and the intent that created it, so tearing it down means unpicking
  // four tables in order — and the database is dropped and reseeded on every
  // run anyway. Its name carries a timestamp, so it cannot collide with
  // anything another spec looks up.
})
