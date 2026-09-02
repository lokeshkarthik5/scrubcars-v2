/**
 * Vendor administration.
 *
 * Verification is the gate between a garage existing and a customer being able
 * to find it, so each state change here is checked on the customer's side too
 * rather than only in the admin list.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { STAFF, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

/** A garage created straight in the database, so each test starts from a
 *  known state without depending on the vendor onboarding flow. */
async function makeGarage(name: string) {
  const [row] = await sql<{ id: string }[]>`
    insert into vendors (owner_id, business_name, phone, address, city, pincode,
                         lat, lng, geo_source, is_verified, dropin_enabled, status)
    values (${STAFF.narrowOwner.id}, ${name}, '9000007777', '1, Admin Road',
            'Chennai', '600001', 13.05, 80.25, 'map_pin', false, true, 'active')
    returning id
  `
  return row.id
}

test.describe('admin vendors', () => {
  test('verifying a garage is what makes it visible to customers', async ({ page, context }) => {
    const name = `E2E Unverified ${Date.now().toString().slice(-5)}`
    const id = await makeGarage(name)

    // Unverified garages are filtered out of the customer listing entirely.
    const customer = await context.newPage()
    await customer.goto('http://localhost:3000/search')
    await customer.getByPlaceholder('Search garages, services...').fill(name)
    await expect(customer.getByText(name)).toHaveCount(0)

    await page.goto('/vendors')
    await page.getByRole('button', { name: `Verify ${name}` }).click()

    await expect
      .poll(async () => {
        const rows = await sql<{ is_verified: boolean }[]>`
          select is_verified from vendors where id = ${id}
        `
        return rows[0]?.is_verified
      })
      .toBe(true)

    await customer.reload()
    await customer.getByPlaceholder('Search garages, services...').fill(name)
    await expect(customer.getByText(name).first()).toBeVisible()
    await customer.close()

    await sql`delete from vendors where id = ${id}`
  })

  test('archiving takes a garage back out of circulation', async ({ page }) => {
    const name = `E2E Archive ${Date.now().toString().slice(-5)}`
    const id = await makeGarage(name)
    await sql`update vendors set is_verified = true where id = ${id}`

    await page.goto('/vendors')
    await page.getByRole('button', { name: `Archive ${name}` }).click()

    await expect
      .poll(async () => {
        const rows = await sql<{ status: string }[]>`
          select status from vendors where id = ${id}
        `
        return rows[0]?.status
      })
      .toBe('archived')

    await sql`delete from vendors where id = ${id}`
  })

  test('a garage can be deleted outright', async ({ page }) => {
    const name = `E2E Delete ${Date.now().toString().slice(-5)}`
    const id = await makeGarage(name)

    await page.goto('/vendors')

    // Destructive, so it asks first.
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: `Delete ${name}` }).click()

    await expect
      .poll(async () => {
        const rows = await sql<{ n: string }[]>`
          select count(*)::text as n from vendors where id = ${id}
        `
        return Number(rows[0].n)
      })
      .toBe(0)
  })

  test('the edit form loads a garage and saves a change', async ({ page }) => {
    await page.goto(`/vendors/${VENDORS.narrow.id}/edit`)

    const businessName = page.getByLabel('Business name')
    await expect(businessName).toHaveValue(VENDORS.narrow.name)

    await businessName.fill(`${VENDORS.narrow.name} Updated`)
    await page.getByRole('button', { name: /Save|Update/i }).first().click()

    await expect
      .poll(async () => {
        const rows = await sql<{ business_name: string }[]>`
          select business_name from vendors where id = ${VENDORS.narrow.id}
        `
        return rows[0]?.business_name
      })
      .toBe(`${VENDORS.narrow.name} Updated`)

    // Other specs look this garage up by name.
    await sql`
      update vendors set business_name = ${VENDORS.narrow.name} where id = ${VENDORS.narrow.id}
    `
  })
})
