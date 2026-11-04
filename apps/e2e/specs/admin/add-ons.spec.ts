/**
 * Add-ons in admin (0068): the garage editor's own table (frame H), saved at
 * once row by row, and an add-on marked on the booking's page.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { ADD_ONS } from '../../support/seed-ids'

const A = ADD_ONS

test.use({ storageState: asRole('admin') })

const row = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-add-on-row="${name}"]`)

test.describe('add-ons in the garage editor @p0', () => {
  test('its own table lists them, and the service list stays services', async ({
    page,
  }) => {
    await page.goto(`/vendors/${A.editGarage.id}/edit?tab=services`)
    const table = page.locator('[data-admin-add-ons]')
    await expect(table.getByRole('heading', { name: /Add-ons/ })).toBeVisible()
    await expect(
      table.getByLabel(`${A.editGarage.addOnName} SUV price in rupees`)
    ).toHaveValue('199')
    await expect(
      table.getByLabel(`${A.editGarage.addOnName} sedan price in rupees`)
    ).toHaveValue('149')
    await expect(
      table.getByLabel(`${A.editGarage.addOnName} extra minutes`)
    ).toHaveValue('20')
    // The services table above doesn't carry them, or a save would hide them.
    await expect(
      page.getByLabel(`More for ${A.editGarage.addOnName}`)
    ).toHaveCount(0)
  })

  test('Add add-on adds a row; Save creates it, the switch and Delete save at once', async ({
    page,
  }) => {
    const name = `E2E Wiper fluid ${Date.now().toString().slice(-5)}`
    await page.goto(`/vendors/${A.editGarage.id}/edit?tab=services`)
    await page.getByRole('button', { name: 'Add add-on' }).click()

    const blank = row(page, 'New add-on')
    await blank.getByLabel('New add-on name').fill(name)
    const added = row(page, name)
    await added.getByLabel(`${name} hatchback price in rupees`).fill('60')
    await added.getByLabel(`${name} sedan price in rupees`).fill('70')
    await added.getByLabel(`${name} SUV price in rupees`).fill('80')
    await added.getByLabel(`${name} extra minutes`).fill('5')
    await added.getByRole('button', { name: 'Save' }).click()
    await expect(added.getByRole('button', { name: 'Save' })).toHaveCount(0)

    const read = async () =>
      (
        await sql<
          {
            pricing_type: string
            price_suv: string
            duration_mins: number
            is_active: boolean
            is_addon: boolean
          }[]
        >`
          select pricing_type, price_suv, duration_mins, is_active, is_addon from services
           where vendor_id = ${A.editGarage.id} and name = ${name}
        `
      )[0]
    expect(await read()).toEqual({
      pricing_type: 'per_vehicle',
      price_suv: '80.00',
      duration_mins: 5,
      is_active: true,
      is_addon: true,
    })

    await added
      .getByRole('switch', { name: `${name} offered to customers` })
      .click()
    await expect.poll(async () => (await read())?.is_active).toBe(false)

    await added.getByRole('button', { name: `Delete ${name}` }).click()
    await page.getByRole('button', { name: 'Delete add-on' }).click()
    await expect(added).toHaveCount(0)
    await expect.poll(read).toBeUndefined()
  })

  test('the Services save leaves add-ons as they are', async ({ page }) => {
    await page.goto(`/vendors/${A.editGarage.id}/edit?tab=services`)
    await page
      .getByLabel(/duration$/)
      .first()
      .selectOption('90')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect
      .poll(
        async () =>
          (
            await sql<
              { duration_mins: number }[]
            >`select duration_mins from services where id = ${A.editGarage.serviceId}`
          )[0]?.duration_mins
      )
      .toBe(90)
    const [addOn] = await sql<
      { is_active: boolean }[]
    >`select is_active from services where id = ${A.editGarage.addOnId}`
    expect(addOn).toEqual({ is_active: true })
  })

  test('the booking page marks each add-on', async ({ page }) => {
    await page.goto(`/bookings/${A.done}`)
    await expect(page.getByText(A.helmet.name)).toBeVisible()
    await expect(page.getByText('Add-on', { exact: true })).toHaveCount(2)
  })
})
