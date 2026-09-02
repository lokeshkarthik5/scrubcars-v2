/**
 * What the garage sells.
 *
 * The assertion that matters is not that a service saves, but that the change
 * reaches a customer: the vendor app and the customer app are separate
 * deployments, and a price that updates in one and not the other is the
 * failure worth catching.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-owner') })

test.beforeEach(async ({ context }) => {
  await setActiveVendor(context, VENDORS.main.id)
})

test.describe('vendor services', () => {
  test('the active catalogue is listed, and withdrawn work is marked as such', async ({ page }) => {
    await page.goto('/services')

    await expect(page.getByText(SERVICES.wash.name).first()).toBeVisible()
    await expect(page.getByText(SERVICES.detail.name).first()).toBeVisible()
    // Unlike the customer's garage page, the vendor still sees what they have
    // withdrawn — they are the ones who would put it back.
    await expect(page.getByText(SERVICES.inactive.name).first()).toBeVisible()
  })

  test('a new service is created and appears to customers', async ({ page }) => {
    const name = `E2E Rinse ${Date.now().toString().slice(-5)}`

    await page.goto('/services')

    // The form is always on the page rather than behind a trigger, and the
    // submit stays disabled until a name and a valid price exist.
    const add = page.getByRole('button', { name: 'Add service' })
    await expect(add).toBeDisabled()

    await page.getByLabel('Service name').fill(name)
    await page.getByLabel('Price (₹)').fill('349')

    await expect(add).toBeEnabled()
    await add.click()

    await expect
      .poll(async () => {
        const rows = await sql<{ price: string }[]>`
          select price from services
           where vendor_id = ${VENDORS.main.id} and name = ${name}
        `
        return rows[0]?.price
      })
      .toBe('349.00')

    // The customer-facing garage page is a different app reading the same API.
    const customer = await page.context().newPage()
    await customer.goto(`http://localhost:3000/garage/${VENDORS.main.id}`)
    await expect(customer.getByText(name).first()).toBeVisible()
    await customer.close()

    await sql`delete from services where vendor_id = ${VENDORS.main.id} and name = ${name}`
  })
})
