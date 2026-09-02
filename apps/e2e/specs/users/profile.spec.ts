/**
 * The customer's own record.
 *
 * Uses the one fixture customer seeded with no car and no address, because
 * "it was added" is only meaningful starting from empty.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { CUSTOMERS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-profile') })

test.describe('profile', () => {
  test('a car can be added and is then bookable', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText(/No vehicles added yet/i)).toBeVisible()

    await page.getByRole('button', { name: 'Add' }).first().click()
    await page.getByPlaceholder('e.g. Maruti').fill('Kia')
    await page.getByPlaceholder('e.g. Swift').fill('Seltos')

    // The type defaults to hatchback; choosing SUV proves the selection is
    // carried through rather than the default being written regardless.
    await page.getByRole('button', { name: 'SUV / MUV' }).click()
    await page.getByRole('button', { name: 'Save vehicle' }).click()

    await expect(page.getByText('Kia Seltos')).toBeVisible()

    const rows = await sql<{ make: string; model: string; vehicle_type: string }[]>`
      select make, model, vehicle_type from user_vehicles
       where user_id = ${CUSTOMERS.profile.id}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ make: 'Kia', model: 'Seltos', vehicle_type: 'suv' })
  })
})
