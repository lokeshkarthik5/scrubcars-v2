/**
 * Multi-tenant isolation and role gating.
 *
 * The failure mode here is one garage seeing another's bookings, so these
 * assertions are deliberately negative: not "the right rows appear" but "the
 * wrong rows do not". The tenant is carried in an X-Vendor-Id header derived
 * from localStorage, and the whole subtree is re-keyed on switch
 * (vendor-scope.tsx), which is exactly the kind of thing that regresses
 * silently.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

test.describe('tenant isolation @p0', () => {
  test.use({ storageState: asRole('vendor-owner') })

  test('each garage shows only its own bookings', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.main.id)
    await page.goto('/bookings')
    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()

    // Booking Bhavana has a job at MAIN (pending) and another at SECOND.
    // Under MAIN the SECOND job must not be reachable through any tab.
    await page.getByRole('radio', { name: /^Upcoming/ }).click()
    await expect(page.getByText(SERVICES.secondOnly.name)).toHaveCount(0)
  })

  test('switching company swaps the data rather than merging it', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.second.id)
    await page.goto('/bookings')

    await expect(page.getByText(VENDORS.second.name).first()).toBeVisible()
    await page.getByRole('radio', { name: /^Upcoming/ }).click()

    // SECOND's only job is the one service that lives there.
    await expect(page.getByText(SERVICES.secondOnly.name)).toBeVisible()
    // And none of MAIN's customers come with it.
    await expect(page.getByText(CUSTOMERS.cancel.name)).toHaveCount(0)
    await expect(page.getByText(CUSTOMERS.reschedule.name)).toHaveCount(0)
  })

  test('services are scoped to the active garage', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.main.id)
    await page.goto('/services')

    await expect(page.getByText(SERVICES.wash.name).first()).toBeVisible()
    await expect(page.getByText(SERVICES.secondOnly.name)).toHaveCount(0)
  })
})

test.describe('operator role gating @p0', () => {
  test.use({ storageState: asRole('vendor-operator') })

  test('an operator loses the owner-only sections', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.main.id)
    await page.goto('/bookings')
    await expect(page.getByRole('radio', { name: /^Incoming/ })).toBeVisible()

    // Operators run jobs; they do not see money, price the work, or manage
    // the team. The nav reflects that.
    const nav = page.getByRole('navigation')
    await expect(nav.getByText('Earnings')).toHaveCount(0)
    await expect(nav.getByText('Services')).toHaveCount(0)
    await expect(nav.getByText('Settings')).toHaveCount(0)
    await expect(nav.getByText('Bookings')).toBeVisible()
  })

  test('the gate holds against direct navigation, not just a hidden link', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.main.id)
    await page.goto('/earnings')

    // Hiding the nav item is presentation; the page itself has to refuse, or
    // the URL is the bypass.
    await expect(page.getByText(/₹/).first()).toHaveCount(0)
  })
})
