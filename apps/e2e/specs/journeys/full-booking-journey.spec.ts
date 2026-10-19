/**
 * One job, end to end, across all three apps.
 *
 * Every other spec exercises one surface. This one exists because the seams
 * between them are where state actually goes wrong: a customer books on
 * :3000, the garage works it on :3001, and both talk to the same API with
 * different sessions and a tenant header in between. The closing assertions
 * are on the database, because that is the only place all three agree.
 */
import { test, expect, statePath } from '../../support/fixtures'
import { blockThirdParties, dismissLocationPrompt, stubRazorpay } from '../../support/network'
import {
  bookingsForUser,
  countRedemptions,
  getBooking,
  getBookingItems,
  getPayment,
  sql,
} from '../../support/db'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { CUSTOMERS, DISCOUNTS, SERVICES, VENDORS } from '../../support/seed-ids'

const USERS = 'http://localhost:3000'
const VENDORS_APP = 'http://localhost:3001'

test.describe.configure({ mode: 'serial' })

test('a booking is made, worked, completed and reviewed @p0', async ({ browser }) => {
  // Three sessions, because three different people are involved. A single
  // context would let one app's cookies stand in for another's.
  const customerCtx = await browser.newContext({
    storageState: statePath('customer-journey'),
    baseURL: USERS,
  })
  const vendorCtx = await browser.newContext({
    storageState: statePath('vendor-owner'),
    baseURL: VENDORS_APP,
  })

  for (const ctx of [customerCtx, vendorCtx]) {
    await stubRazorpay(ctx)
    await dismissLocationPrompt(ctx)
    await blockThirdParties(ctx)
  }
  await vendorCtx.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    ['detlio.activeVendorId', VENDORS.main.id] as const
  )

  const customer = await customerCtx.newPage()
  const vendor = await vendorCtx.newPage()

  // ── 1. the customer picks two services and a package ─────────────────────
  const garage = new GaragePage(customer)
  await garage.goto(VENDORS.main.id)
  await garage.add(SERVICES.wash.name)
  await garage.add(SERVICES.tiered.name)
  await expect(customer.getByText(/2 services · /)).toBeVisible()
  await garage.book()

  const checkout = new CheckoutPage(customer)
  await checkout.pickTomorrowSlot()
  await checkout.pickVehicle(/Hyundai i20/)

  // 499 + 599 (the hatchback tier) = 1098. 20% of that is 219.60, which the
  // code caps at 200 — so the customer pays 898, not 878.40.
  await expect(checkout.cta()).toHaveText('Pay ₹1,098')
  await checkout.applyPromo(DISCOUNTS.percentCapped.code)
  await checkout.closePromo()
  await expect(checkout.cta()).toHaveText('Pay ₹898')

  await checkout.pay()
  await customer.waitForURL(/\/bookings\/[0-9a-f-]+/)

  const [created] = await bookingsForUser(CUSTOMERS.journey.id)
  expect(created.status).toBe('pending')

  // Paid, but not yet accepted: the customer is told it is a request, and
  // nothing on the page claims a confirmation the garage has not given — the
  // post-payment moment included, which used to say "Booking confirmed".
  await expect(customer.getByText('Waiting for garage')).toBeVisible()
  await expect(customer.getByText(/Confirmed/i)).toHaveCount(0)

  // ── 2. the garage sees it, accepts, works it, finishes it ────────────────
  await vendor.goto('/bookings')
  const acceptLabel = `Accept booking for ${CUSTOMERS.journey.name}`
  await expect(vendor.getByRole('button', { name: acceptLabel }).first()).toBeVisible()
  await vendor.getByRole('button', { name: acceptLabel }).first().click()
  await expect.poll(async () => (await getBooking(created.id))?.status).toBe('confirmed')

  // The customer's page polls every 5s, so the change reaches them without a
  // reload — which is the actual promise the status stepper makes.
  await expect(customer.getByText('Your slot is reserved')).toBeVisible({ timeout: 15_000 })

  await vendor.getByRole('radio', { name: /^Upcoming/ }).click()
  await vendor
    .getByRole('button', { name: `Mark booking for ${CUSTOMERS.journey.name} in progress` })
    .click()
  await expect.poll(async () => (await getBooking(created.id))?.status).toBe('in_progress')

  await vendor
    .getByRole('button', { name: `Mark booking for ${CUSTOMERS.journey.name} completed` })
    .click()
  await expect.poll(async () => (await getBooking(created.id))?.status).toBe('completed')

  // ── 3. the customer reviews the completed job ────────────────────────────
  await customer.reload()
  await customer.getByRole('button', { name: 'Rate 5 stars' }).click()
  await customer.getByPlaceholder('Tell us about your experience').fill('Spotless, thank you.')
  await customer.getByRole('button', { name: /Submit/i }).click()

  await expect
    .poll(async () => {
      const rows = await sql<{ rating: number }[]>`
        select rating from reviews where booking_id = ${created.id}
      `
      return rows[0]?.rating
    })
    .toBe(5)

  // ── 4. what the three apps left behind agrees ────────────────────────────
  const final = await getBooking(created.id)
  expect(final?.subtotal_amount).toBe('1098.00')
  expect(final?.discount_amount).toBe('200.00')
  expect(final?.amount).toBe('898.00')
  expect(final?.discount_code).toBe(DISCOUNTS.percentCapped.code)

  const items = await getBookingItems(created.id)
  expect(items.map((i) => i.service_id)).toEqual([SERVICES.wash.id, SERVICES.tiered.id])
  // The tiered line is charged at the hatchback rate the customer's car earns.
  expect(items.map((i) => i.amount)).toEqual(['499.00', '599.00'])

  const payment = await getPayment(created.id)
  expect(payment?.status).toBe('paid')
  expect(payment?.amount).toBe('898.00')

  expect(await countRedemptions(created.id)).toBe(1)

  await customerCtx.close()
  await vendorCtx.close()
})
