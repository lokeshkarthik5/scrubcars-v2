/**
 * Vendor administration.
 *
 * Verification is the gate between a garage existing and a customer being able
 * to find it, so each state change here is checked on the customer's side too
 * rather than only in the admin list.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
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

  test('a garage that has bookings cannot be deleted @p0', async ({ page }) => {
    // CAPACITY has a paid booking. Deleting it would cascade through that
    // booking and its payment, so the server refuses and says what to do.
    const response = await page.request.delete(
      `${API}/api/v1/admin/vendors/${VENDORS.capacity.id}`
    )
    expect(response.status()).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      message: 'This garage has bookings. Archive it instead.',
      code: 'VENDOR_HAS_BOOKINGS',
    })

    await page.goto('/vendors')
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: `Delete ${VENDORS.capacity.name}` }).click()
    await expect(page.getByText('This garage has bookings. Archive it instead.')).toBeVisible()

    const [row] = await sql<{ n: string }[]>`
      select count(*)::text as n from vendors where id = ${VENDORS.capacity.id}
    `
    expect(Number(row.n)).toBe(1)
  })

  test('saving another field leaves the per-day hours as they were @p0', async ({ page }) => {
    // OPS_EDIT closes at 13:00 on Saturdays and 18:00 otherwise. The form used
    // to send one schedule for the whole week with every save.
    // Its own name back first, in case an earlier attempt stopped mid-rename.
    await sql`
      update vendors set business_name = ${VENDORS.opsEdit.name} where id = ${VENDORS.opsEdit.id}
    `
    await page.goto(`/vendors/${VENDORS.opsEdit.id}/edit`)

    const businessName = page.getByLabel('Business name')
    await expect(businessName).toHaveValue(VENDORS.opsEdit.name)

    await page.getByRole('tab', { name: 'Operations' }).click()
    await expect(page.getByLabel('Sat closing time')).toHaveValue('13:00')
    await expect(page.getByLabel('Mon closing time')).toHaveValue('18:00')

    await page.getByRole('tab', { name: 'Details' }).click()
    await businessName.fill(`${VENDORS.opsEdit.name} Renamed`)
    await page.getByRole('button', { name: /Save|Update/i }).first().click()

    await expect
      .poll(async () => {
        const rows = await sql<{ business_name: string }[]>`
          select business_name from vendors where id = ${VENDORS.opsEdit.id}
        `
        return rows[0]?.business_name
      })
      .toBe(`${VENDORS.opsEdit.name} Renamed`)

    const hours = await sql<{ day_of_week: number; close_time: string }[]>`
      select day_of_week, close_time from vendor_working_hours
       where vendor_id = ${VENDORS.opsEdit.id} order by day_of_week
    `
    expect(hours.find((h) => h.day_of_week === 6)?.close_time).toBe('13:00:00')
    expect(hours.filter((h) => h.close_time === '18:00:00')).toHaveLength(6)

    await sql`
      update vendors set business_name = ${VENDORS.opsEdit.name} where id = ${VENDORS.opsEdit.id}
    `
  })

  test('ops can pause a garage and resume it @p0', async ({ page }) => {
    // Running, whatever an earlier attempt left it as.
    await sql`
      update vendors set bookings_paused_at = null, bookings_paused_reason = null
       where id = ${VENDORS.opsEdit.id}
    `
    await page.goto(`/vendors/${VENDORS.opsEdit.id}/edit`)
    await page.getByRole('tab', { name: 'Operations' }).click()

    const paused = async () => {
      const [row] = await sql<{ paused: boolean }[]>`
        select bookings_paused_at is not null as paused from vendors where id = ${VENDORS.opsEdit.id}
      `
      return row.paused
    }

    await page.getByRole('button', { name: 'Pause new bookings' }).click()
    await expect(page.getByText(/Paused since/)).toBeVisible()
    await expect.poll(paused).toBe(true)

    await page.getByRole('button', { name: 'Resume bookings' }).click()
    await expect(page.getByRole('button', { name: 'Pause new bookings' })).toBeVisible()
    await expect.poll(paused).toBe(false)
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
