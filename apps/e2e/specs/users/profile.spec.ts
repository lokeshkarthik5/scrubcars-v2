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

  /**
   * The default is what the booking page preselects. It was unreachable: the
   * endpoint existed but nothing called it, so the only way to change it was
   * to delete the current default — which 500'd for any car that had been
   * booked.
   */
  test('the default car can be changed', async ({ page }) => {
    await page.goto('/profile')

    // Tests in a file run in order and share this customer, so the Kia the
    // previous test added is already here and already the default — adding it
    // again would put two identical cards on the page.
    await expect(page.getByText('Kia Seltos')).toBeVisible()

    // The first car added becomes the default, so a second one is what makes
    // "change it" mean anything.
    await page.getByRole('button', { name: 'Add' }).first().click()
    await page.getByPlaceholder('e.g. Maruti').fill('Honda')
    await page.getByPlaceholder('e.g. Swift').fill('City')
    await page.getByRole('button', { name: 'Save vehicle' }).click()
    await expect(page.getByText('Honda City')).toBeVisible()

    await page
      .getByRole('button', { name: 'Make Honda City the default vehicle' })
      .click()

    // Promoting one demotes the other — the badge moving is the whole point.
    await expect(
      page.getByRole('button', { name: 'Make Kia Seltos the default vehicle' })
    ).toBeVisible()

    const rows = await sql<{ make: string; is_default: boolean }[]>`
      select make, is_default from user_vehicles
       where user_id = ${CUSTOMERS.profile.id}
    `
    expect(rows.filter((r) => r.is_default).map((r) => r.make)).toEqual(['Honda'])
  })

  /**
   * Addresses, which had no coverage at all and no way to change the default
   * — the same gap the vehicle list had.
   *
   * Deleting one is safe in a way deleting a car is not: nothing references
   * `user_addresses`, because a booking snapshots the address as text rather
   * than pointing at the row. That is asserted here so the snapshot is not
   * quietly turned into a foreign key later.
   */
  test('an address can be added, promoted and removed', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText(/No addresses added yet/i)).toBeVisible()

    // Asserted via each row's remove button rather than its label text: the
    // bottom nav also says "Home", so a bare text match would be ambiguous.
    // The aria-labels are unique per row and already shipped for a11y.
    const addressRow = (label: string) =>
      page.getByRole('button', { name: `Remove ${label} address` })

    const addAddress = async (label: string, street: string, pincode: string) => {
      await page.getByRole('button', { name: 'Add' }).last().click()
      await page.getByPlaceholder('e.g. Home, Work').fill(label)
      await page.getByPlaceholder('Street, area').fill(street)
      await page.getByPlaceholder('e.g. Chennai').fill('Chennai')
      await page.getByPlaceholder('600001').fill(pincode)
      await page.getByRole('button', { name: 'Save address' }).click()
      await expect(addressRow(label)).toBeVisible()
    }

    // The first address becomes the default; the second is what makes
    // promoting one mean anything.
    await addAddress('Home', '14, Gandhi Nagar, Adyar', '600020')
    await addAddress('Office', '9, Mount Road, Guindy', '600032')

    await page.getByRole('button', { name: 'Make Office the default address' }).click()
    await expect(
      page.getByRole('button', { name: 'Make Home the default address' })
    ).toBeVisible()

    const promoted = await sql<{ label: string; is_default: boolean }[]>`
      select label, is_default from user_addresses
       where user_id = ${CUSTOMERS.profile.id}
    `
    expect(promoted.filter((r) => r.is_default).map((r) => r.label)).toEqual(['Office'])

    // Removing the default hands it to whatever is left, so the customer is
    // never in a state with addresses but no default.
    await addressRow('Office').click()
    await expect(addressRow('Office')).toBeHidden()

    const remaining = await sql<{ label: string; is_default: boolean }[]>`
      select label, is_default from user_addresses
       where user_id = ${CUSTOMERS.profile.id}
    `
    expect(remaining).toEqual([{ label: 'Home', is_default: true }])
  })
})
