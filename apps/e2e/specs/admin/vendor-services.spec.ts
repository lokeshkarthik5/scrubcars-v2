/**
 * Services in the admin garage editor.
 *
 * The editor used to leave out of a save any row with a name but no complete
 * price, and the save — the garage's full list — then hid that service from
 * customers with no message. These pin the fix: such a row is flagged and
 * holds the save, and a hidden service can be found and shown again.
 *
 * Everything here is on VENDORS.adminServices, which no other file reads or
 * books (see VENDORS.adminServices for its four services). Each test puts the
 * seeded state back first, so a retry starts where the first attempt did.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const GARAGE = VENDORS.adminServices

async function resetServices() {
  await sql`
    update services set is_active = true, price_suv = null
     where id = ${SERVICES.adminTiered.id}
  `
  await sql`
    update services set is_active = true, pricing_type = 'flat', price = ${SERVICES.adminFlat.price}
     where id = ${SERVICES.adminFlat.id}
  `
  await sql`update services set is_active = false where id = ${SERVICES.adminHidden.id}`
}

async function service(id: string) {
  const [row] = await sql<{ is_active: boolean; price_suv: string | null }[]>`
    select is_active, price_suv from services where id = ${id}
  `
  return row
}

const servicesUrl = `${API}/api/v1/admin/vendors/${GARAGE.id}/services`

test.describe('admin garage services', () => {
  test('a service missing a price holds the save instead of being hidden @p0', async ({ page }) => {
    await resetServices()
    await page.goto(`/vendors/${GARAGE.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()

    // Seeded with no SUV price: the row the old editor dropped on save.
    await expect(page.getByText('Add the SUV price')).toBeVisible()
    const suv = page.getByLabel(/SUV price in rupees/)
    await expect(suv).toHaveAttribute('aria-invalid', 'true')

    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    await expect(page.getByText('1 service needs a price — see the Services tab.')).toBeVisible()

    // Switching Flat to Per vehicle fills each size with the flat price, and
    // back again takes the cheapest — nothing to retype either way. Services
    // load sorted by name, so the foam wash is the first row.
    await page.getByLabel('Service 1 pricing').selectOption('per_vehicle')
    await expect(page.getByLabel('Service 1 hatchback price in rupees')).toHaveValue('450')
    await expect(page.getByLabel('Service 1 sedan price in rupees')).toHaveValue('450')
    await expect(page.getByLabel('Service 1 SUV price in rupees')).toHaveValue('450')
    await page.getByLabel('Service 1 sedan price in rupees').fill('400')
    await page.getByLabel('Service 1 pricing').selectOption('flat')
    await expect(page.getByLabel('Service 1 price in rupees')).toHaveValue('400')
    await page.getByLabel('Service 1 price in rupees').fill('450')

    await page.getByLabel('Service 2 SUV price in rupees').fill('900')
    await expect(page.getByText('Add the SUV price')).toHaveCount(0)
    await expect(save).toBeEnabled()
    await save.click()

    // Saved, and still on sale.
    await expect
      .poll(() => service(SERVICES.adminTiered.id))
      .toEqual({ is_active: true, price_suv: '900.00' })
    expect((await service(SERVICES.adminFlat.id)).is_active).toBe(true)

    await resetServices()
  })

  test('the hidden-services API lists only hidden plain services and guards packages @p0', async ({ page }) => {
    await resetServices()

    const list = await page.request.get(`${servicesUrl}/hidden`)
    expect(list.status()).toBe(200)
    const body = (await list.json()) as {
      success: boolean
      data: Array<{ id: string; name: string; isActive: boolean }>
    }
    expect(body.success).toBe(true)
    expect(body.data.map((s) => [s.id, s.isActive])).toEqual([
      [SERVICES.adminHidden.id, false],
    ])

    // Inside a package: the package would still list it, so it stays.
    const inPackage = await page.request.patch(
      `${servicesUrl}/${SERVICES.adminFlat.id}/active`,
      { data: { isActive: false } }
    )
    expect(inPackage.status()).toBe(409)
    expect(await inPackage.json()).toEqual({
      success: false,
      message: `This service is part of the package "${SERVICES.adminPackage.name}". Take it out of that package in the garage app first, then hide it.`,
      code: 'SERVICE_IN_PACKAGE',
    })
    expect((await service(SERVICES.adminFlat.id)).is_active).toBe(true)

    // A package itself, and another garage's service, are unknown here.
    for (const id of [SERVICES.adminPackage.id, SERVICES.wash.id]) {
      const unknown = await page.request.patch(`${servicesUrl}/${id}/active`, {
        data: { isActive: true },
      })
      expect(unknown.status()).toBe(404)
      expect(await unknown.json()).toEqual({
        success: false,
        message: 'Service not found',
        code: 'SERVICE_NOT_FOUND',
      })
    }

    // Only the switch: anything else in the body is refused.
    const extra = await page.request.patch(
      `${servicesUrl}/${SERVICES.adminHidden.id}/active`,
      { data: { isActive: true, price: 1 } }
    )
    expect(extra.status()).toBe(400)
    expect((await service(SERVICES.adminHidden.id)).is_active).toBe(false)
  })

  test('a hidden service can be shown again, and hidden again after a confirm @p0', async ({ page }) => {
    await resetServices()
    await page.goto(`/vendors/${GARAGE.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()

    // Collapsed until asked for, with what it costs.
    await page.getByRole('button', { name: 'Hidden services (1)' }).click()
    await expect(page.getByText('₹2000–₹3000 by car size')).toBeVisible()

    await page.getByRole('button', { name: `Show ${SERVICES.adminHidden.name} again` }).click()
    await expect.poll(async () => (await service(SERVICES.adminHidden.id)).is_active).toBe(true)
    // Back in the editor too, so the next save keeps it on sale.
    const hideRestored = page.getByRole('button', { name: `Hide ${SERVICES.adminHidden.name}` })
    await expect(hideRestored).toBeVisible()
    // Focus follows it to its new row (it is priced for every size, so onto
    // its Hide button), and the change is said, not only seen.
    await expect(hideRestored).toBeFocused()
    await expect(page.getByRole('status').filter({ hasText: 'is back on the garage page' }))
      .toHaveText(`“${SERVICES.adminHidden.name}” is back on the garage page.`)
    await expect(page.getByRole('button', { name: /^Hidden services/ })).toHaveCount(0)

    // Inside a package: refused, and said on that row. Scoped to the row's
    // group: page-wide, getByRole('alert') also finds Next's route announcer.
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: `Hide ${SERVICES.adminFlat.name}` }).click()
    const flatRow = page.getByRole('group', { name: SERVICES.adminFlat.name, exact: true })
    await expect(flatRow.getByRole('alert')).toContainText(
      `part of the package "${SERVICES.adminPackage.name}"`
    )
    expect((await service(SERVICES.adminFlat.id)).is_active).toBe(true)

    // Hiding asks first, then takes it off the garage page straight away.
    let asked = ''
    page.once('dialog', (dialog) => {
      asked = dialog.message()
      void dialog.accept()
    })
    await hideRestored.click()
    await expect.poll(async () => (await service(SERVICES.adminHidden.id)).is_active).toBe(false)
    expect(asked).toContain("Customers won't see it; you can show it again from Hidden services.")
    // Its row is gone, so focus lands on where it went.
    await expect(page.getByRole('button', { name: 'Hidden services (1)' })).toBeFocused()
    await expect(page.getByText(`Hidden “${SERVICES.adminHidden.name}”. It’s under Hidden services.`))
      .toBeVisible()
  })
})
