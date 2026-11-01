/**
 * Add-ons in the garage portal (0068): Services → Add-ons, the form's sheet,
 * and each add-on as its own marked line on the new booking card and job page.
 *
 * ADD_ONS.owner owns ADD_ONS.garage alone.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { ADD_ONS } from '../../support/seed-ids'

const A = ADD_ONS

test.use({ storageState: asRole('vendor-add-ons') })

test.describe('add-ons in the garage portal @p0', () => {
  test('the section lists them apart from services, off ones included', async ({
    page,
  }) => {
    await page.goto('/services')
    const section = page.locator('[data-add-ons-section]')
    await expect(
      section.getByText(
        "Small extras that go with any of your services. Customers can't book them alone."
      )
    ).toBeVisible()
    await expect(
      section.getByText(A.helmet.name, { exact: true })
    ).toBeVisible()
    await expect(section.getByText('₹99 · +10 min')).toBeVisible()
    await expect(section.getByText('No extra time')).toBeVisible()
    await expect(
      section.getByText(A.retired.name, { exact: true })
    ).toBeVisible()
    await expect(section.getByText(A.foam.name)).toHaveCount(0)
    // No photo editor on an add-on: the only photo words are the service's.
    await expect(section.getByText('Add photo')).toHaveCount(0)
  })

  test('Add add-on opens the sheet, and a flat one saves and reaches customers', async ({
    page,
  }) => {
    const name = `E2E Tyre shine ${Date.now().toString().slice(-5)}`
    await page.goto('/services')
    // The one on the "Add a service" heading.
    await page.getByRole('button', { name: 'Add add-on' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Add an add-on' })
    await expect(
      sheet.getByText("Added to the job's time. Leave empty if it adds none.")
    ).toBeVisible()
    // No category, no description, no On inspection.
    await expect(sheet.getByText('Category')).toHaveCount(0)
    await expect(sheet.getByText('On inspection')).toHaveCount(0)

    const save = sheet.getByRole('button', { name: 'Add add-on' })
    await expect(save).toBeDisabled()
    await sheet.getByLabel('Add-on name').fill(name)
    await sheet.getByLabel('Price (₹)').fill('129')
    await expect(save).toBeEnabled()
    await save.click()

    await expect(
      page.locator('[data-add-ons-section]').getByText(name)
    ).toBeVisible()
    const [row] = await sql<
      { is_addon: boolean; category: string; duration_mins: number }[]
    >`
      select is_addon, category, duration_mins from services where vendor_id = ${A.garage.id} and name = ${name}
    `
    // Blank minutes is no time, and the category is never shown.
    expect(row).toEqual({
      is_addon: true,
      category: 'others',
      duration_mins: 0,
    })

    const customer = await page.context().newPage()
    await customer.goto(`http://localhost:3000/garage/${A.garage.id}`)
    await expect(
      customer.locator('[data-garage-add-ons]').getByText(name)
    ).toBeVisible()
    await customer.close()

    await sql`delete from services where vendor_id = ${A.garage.id} and name = ${name}`
  })

  test('per vehicle needs all three prices; Edit, Disable and Delete work', async ({
    page,
  }) => {
    const name = `E2E Engine bay ${Date.now().toString().slice(-5)}`
    await page.goto('/services')
    await page
      .locator('[data-add-ons-section]')
      .getByRole('button', { name: 'Add add-on' })
      .click()
    const sheet = page.getByRole('dialog', { name: 'Add an add-on' })
    await sheet.getByLabel('Add-on name').fill(name)
    await sheet.getByRole('button', { name: 'Per vehicle' }).click()
    await sheet.getByLabel('Hatchback (₹)').fill('300')
    await sheet.getByLabel('Sedan (₹)').fill('400')
    const save = sheet.getByRole('button', { name: 'Add add-on' })
    await expect(save).toBeDisabled()
    await sheet.getByLabel('SUV (₹)').fill('500')
    await sheet.getByLabel('Extra minutes (optional)').fill('25')
    await save.click()

    const section = page.locator('[data-add-ons-section]')
    const card = section
      .locator('div', { hasText: name })
      .filter({ has: page.getByRole('button', { name: 'Delete' }) })
      .last()
    await expect(card.getByText('+25 min')).toBeVisible()

    await card.getByRole('button', { name: 'Edit' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit add-on' })
    await edit.getByLabel('Extra minutes (optional)').fill('')
    await edit.getByRole('button', { name: 'Update add-on' }).click()
    await expect(card.getByText('No extra time')).toBeVisible()

    await card.getByRole('button', { name: 'Disable' }).click()
    await expect(card.getByText('Inactive')).toBeVisible()
    await expect
      .poll(
        async () =>
          (
            await sql<
              { is_active: boolean }[]
            >`select is_active from services where vendor_id = ${A.garage.id} and name = ${name}`
          )[0]?.is_active
      )
      .toBe(false)

    await card.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete add-on' }).click()
    await expect(section.getByText(name)).toHaveCount(0)
    await expect
      .poll(
        async () =>
          (
            await sql`select 1 from services where vendor_id = ${A.garage.id} and name = ${name}`
          ).length
      )
      .toBe(0)
  })

  test('the service routes never see an add-on', async ({ page }) => {
    const response = await page.request.get(`${API}/api/v1/vendors/me/services`)
    expect(response.ok()).toBe(true)
    const body = (await response.json()) as { data: Array<{ id: string }> }
    expect(body.data.map((service) => service.id)).toEqual([A.foam.id])
    const addOns = (await (
      await page.request.get(`${API}/api/v1/vendors/me/add-ons`)
    ).json()) as {
      data: Array<{ id: string }>
    }
    expect(addOns.data.map((addOn) => addOn.id)).toContain(A.retired.id)
    // An old PATCH on the service route can't reshape one.
    const patchOld = await page.request.patch(
      `${API}/api/v1/vendors/me/services/${A.helmet.id}`,
      {
        data: { name: 'Not an add-on any more' },
      }
    )
    expect(patchOld.status()).toBe(404)
  })

  test('the new booking card and job page mark each add-on on its own line', async ({
    page,
  }) => {
    await page.goto('/bookings?tab=new')
    const card = page
      .getByRole('article', { name: `New booking from ${A.customer.name}` })
      .first()
    await expect(card.getByText(A.foam.name, { exact: true })).toBeVisible()
    await expect(card.getByText(A.helmet.name)).toBeVisible()
    await expect(card.getByText('Add-on', { exact: true })).toHaveCount(2)
    // ₹599 + ₹99 + ₹49: the total includes them.
    await expect(card.getByText('₹747')).toBeVisible()

    await page.goto(`/bookings/${A.pending}`)
    await expect(page.getByText(A.helmet.name)).toBeVisible()
    await expect(page.getByText('Add-on', { exact: true })).toHaveCount(2)
  })
})
