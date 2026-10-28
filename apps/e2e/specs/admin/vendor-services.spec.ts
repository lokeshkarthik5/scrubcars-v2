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
import { CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

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

// Delete's own services, made by its test and removed after: one nobody has
// booked, and one a failed checkout names, which makes it booked.
const FRESH = 'E2E Delete Never Booked'
const BOOKED = 'E2E Delete Once Booked'
const DELETE_ORDER = 'order_e2e_delete_booked'

async function removeDeleteRows() {
  await sql`delete from booking_intents where gateway_txn_id = ${DELETE_ORDER}`
  await sql`
    delete from services
     where vendor_id = ${GARAGE.id} and name in (${FRESH}, ${BOOKED})
  `
}

test.describe('admin garage services', () => {
  test('a service missing a price holds the save instead of being hidden @p0', async ({
    page,
  }) => {
    await resetServices()
    await page.goto(`/vendors/${GARAGE.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()

    // Seeded with no SUV price: the row the old editor dropped on save.
    await expect(page.getByText('Add the SUV price')).toBeVisible()
    const suv = page.getByLabel(/SUV price in rupees/)
    await expect(suv).toHaveAttribute('aria-invalid', 'true')

    // Nothing changed yet, so there is no save bar; the row itself says
    // what it needs.
    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toHaveCount(0)

    // Switching Flat to Per vehicle fills each size with the flat price, and
    // back again takes the cheapest — nothing to retype either way. The foam
    // wash is the first row (Wash and standard comes before Detailing), and
    // its pricing is behind its ⋯.
    await page
      .getByRole('button', { name: `More for ${SERVICES.adminFlat.name}` })
      .click()
    await page.getByLabel('Service 1 pricing').selectOption('per_vehicle')
    await expect(
      page.getByLabel('Service 1 hatchback price in rupees')
    ).toHaveValue('450')
    await expect(
      page.getByLabel('Service 1 sedan price in rupees')
    ).toHaveValue('450')
    await expect(page.getByLabel('Service 1 SUV price in rupees')).toHaveValue(
      '450'
    )

    // A change to save, and a row that holds it: the bar says why.
    await expect(save).toBeDisabled()
    await expect(
      page.getByRole('status').filter({ hasText: 'needs a price' })
    ).toHaveText('1 service needs a price (Services)')

    await page.getByLabel('Service 1 sedan price in rupees').fill('400')
    await page.getByLabel('Service 1 pricing').selectOption('flat')
    await expect(page.getByLabel('Service 1 price in rupees')).toHaveValue(
      '400'
    )
    await page.getByLabel('Service 1 price in rupees').fill('450')

    await page.getByLabel('Service 2 SUV price in rupees').fill('900')
    await expect(page.getByText('Add the SUV price')).toHaveCount(0)
    await expect(save).toBeEnabled()
    await save.click()

    // Saved, still on sale, and still on this page.
    await expect
      .poll(() => service(SERVICES.adminTiered.id))
      .toEqual({ is_active: true, price_suv: '900.00' })
    await expect(save).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Services' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect((await service(SERVICES.adminFlat.id)).is_active).toBe(true)

    await resetServices()
  })

  test('the hidden-services API lists only hidden plain services and guards packages @p0', async ({
    page,
  }) => {
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

  test('a hidden service can be shown again, hidden again at once, and Undo shows it again @p0', async ({
    page,
  }) => {
    await resetServices()
    await page.goto(`/vendors/${GARAGE.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()

    // Collapsed until asked for, with what it costs.
    await page.getByRole('button', { name: 'Hidden services (1)' }).click()
    await expect(page.getByText('₹2000–₹3000 by car size')).toBeVisible()

    await page
      .getByRole('button', { name: `Show ${SERVICES.adminHidden.name} again` })
      .click()
    await expect
      .poll(async () => (await service(SERVICES.adminHidden.id)).is_active)
      .toBe(true)
    // Back in the editor too, so the next save keeps it on sale.
    const hideRestored = page.getByRole('button', {
      name: `Hide ${SERVICES.adminHidden.name}`,
    })
    await expect(hideRestored).toBeVisible()
    // Focus follows it to its new row, opened (it is priced for every size,
    // so onto its Hide button), and the change is said, not only seen.
    await expect(hideRestored).toBeFocused()
    await expect(
      page.getByRole('status').filter({ hasText: 'is back on the garage page' })
    ).toHaveText(`“${SERVICES.adminHidden.name}” is back on the garage page.`)
    await expect(
      page.getByRole('button', { name: /^Hidden services/ })
    ).toHaveCount(0)

    // Inside a package: refused, and said on that row. Scoped to the row's
    // group: page-wide, getByRole('alert') also finds Next's route announcer.
    // Hide is behind the row's ⋯.
    await page
      .getByRole('button', { name: `More for ${SERVICES.adminFlat.name}` })
      .click()
    await page
      .getByRole('button', { name: `Hide ${SERVICES.adminFlat.name}` })
      .click()
    const flatRow = page.getByRole('group', {
      name: SERVICES.adminFlat.name,
      exact: true,
    })
    await expect(flatRow.getByRole('alert')).toContainText(
      `part of the package "${SERVICES.adminPackage.name}"`
    )
    expect((await service(SERVICES.adminFlat.id)).is_active).toBe(true)

    // Hiding is easy to take back, so it happens at once, with no browser
    // pop-up, and the toast offers Undo.
    let asked = ''
    page.on('dialog', (dialog) => {
      asked = dialog.message()
      void dialog.dismiss()
    })
    await hideRestored.click()
    await expect
      .poll(async () => (await service(SERVICES.adminHidden.id)).is_active)
      .toBe(false)
    expect(asked).toBe('')
    // Its row is gone, so focus lands on where it went.
    await expect(
      page.getByRole('button', { name: 'Hidden services (1)' })
    ).toBeFocused()
    await expect(
      page.getByText(
        `Hidden “${SERVICES.adminHidden.name}”. It’s under Hidden services.`
      )
    ).toBeVisible()

    // Undo is real: it is Show again, so the service is back on sale.
    const toast = page.getByRole('status').filter({
      hasText: `“${SERVICES.adminHidden.name}” is off the garage page.`,
    })
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect
      .poll(async () => (await service(SERVICES.adminHidden.id)).is_active)
      .toBe(true)
    await expect(
      page.getByRole('button', { name: `Hide ${SERVICES.adminHidden.name}` })
    ).toBeVisible()
  })

  test.describe('delete', () => {
    test.beforeEach(removeDeleteRows)
    test.afterAll(removeDeleteRows)

    test('any service can be deleted: one never booked is gone, a booked one is kept for its bookings and listed nowhere @p0', async ({
      page,
    }) => {
      await resetServices()
      const [fresh] = await sql<{ id: string }[]>`
        insert into services (vendor_id, name, category, price, duration_mins)
        values (${GARAGE.id}, ${FRESH}, 'car_wash', 300, 30)
        returning id
      `
      // Hidden, so it is deleted from the Hidden services list.
      const [booked] = await sql<{ id: string }[]>`
        insert into services (vendor_id, name, category, price, duration_mins, is_active)
        values (${GARAGE.id}, ${BOOKED}, 'car_wash', 400, 30, false)
        returning id
      `
      await sql`
        insert into booking_intents (
          user_id, vendor_id, service_id, vehicle_id, booking_type,
          scheduled_at, service_duration_mins, amount, subtotal_amount,
          payment_method, gateway_txn_id, status, expires_at
        ) values (
          ${CUSTOMERS.intents.id}, ${GARAGE.id}, ${booked.id},
          ${CUSTOMERS.intents.vehicleId}, 'dropin', now() + interval '1 day',
          30, 400, 400, 'online', ${DELETE_ORDER}, 'failed',
          now() - interval '1 hour'
        )
      `

      await page.goto(`/vendors/${GARAGE.id}/edit`)
      await page.getByRole('tab', { name: 'Services' }).click()

      // A live service: Delete is behind its ⋯, next to Hide, and asks first.
      await page.getByRole('button', { name: `More for ${FRESH}` }).click()
      await page.getByRole('button', { name: `Delete ${FRESH}` }).click()
      await page.getByRole('button', { name: 'Delete service' }).click()
      await expect
        .poll(
          async () =>
            (await sql`select 1 from services where id = ${fresh.id}`).length
        )
        .toBe(0)
      await expect(
        page.getByRole('status').filter({ hasText: 'Deleted' })
      ).toHaveText(`Deleted “${FRESH}”.`)
      await expect(
        page.getByRole('button', { name: `More for ${FRESH}` })
      ).toHaveCount(0)

      // A hidden one that a checkout names: kept for it, off and stamped.
      await page.getByRole('button', { name: 'Hidden services (2)' }).click()
      await page.getByRole('button', { name: `Delete ${BOOKED}` }).click()
      await page.getByRole('button', { name: 'Delete service' }).click()
      await expect
        .poll(async () => {
          const [row] = await sql<{ is_active: boolean; deleted: boolean }[]>`
            select is_active, deleted_at is not null as deleted
              from services where id = ${booked.id}
          `
          return row
        })
        .toEqual({ is_active: false, deleted: true })
      await expect(
        page.getByRole('button', { name: 'Hidden services (1)' })
      ).toBeVisible()

      // Listed nowhere, and it can't be shown again.
      const hidden = await page.request.get(`${servicesUrl}/hidden`)
      const names = ((await hidden.json()).data as { name: string }[]).map(
        (s) => s.name
      )
      expect(names).not.toContain(BOOKED)
      const again = await page.request.patch(
        `${servicesUrl}/${booked.id}/active`,
        { data: { isActive: true } }
      )
      expect(again.status()).toBe(404)

      // A tab opened before the delete still lists it. Its save is refused
      // whole, before anything is written, so the deleted service can't come
      // back as a fresh copy.
      const stale = await page.request.patch(
        `${API}/api/v1/admin/vendors/${GARAGE.id}`,
        {
          data: {
            services: [
              { id: booked.id, name: BOOKED, category: 'car_wash', pricingType: 'flat', price: 499 },
            ],
          },
        }
      )
      expect(stale.status()).toBe(409)
      expect((await stale.json()).code).toBe('SERVICE_DELETED')
      const [copies] = await sql<{ n: number }[]>`
        select count(*)::int as n from services
         where vendor_id = ${GARAGE.id} and name = ${BOOKED}
      `
      expect(copies!.n).toBe(1)
    })
  })
})
