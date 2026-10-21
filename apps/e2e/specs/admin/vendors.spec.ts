/**
 * Vendor administration.
 *
 * Verification is the gate between a garage existing and a customer being able
 * to find it, so each state change here is checked on the customer's side too
 * rather than only in the admin list.
 */
import type { Page } from '@playwright/test'
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
    await customer.getByRole('searchbox', { name: 'Search garages or services' }).fill(name)
    await expect(customer.getByText(name)).toHaveCount(0)

    // Active but unverified: not Live, so under the Active chip.
    await page.goto('/vendors?show=active')
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
    await customer.getByRole('searchbox', { name: 'Search garages or services' }).fill(name)
    await expect(customer.getByText(name).first()).toBeVisible()
    await customer.close()

    await sql`delete from vendors where id = ${id}`
  })

  test('archiving takes a garage back out of circulation', async ({ page }) => {
    const name = `E2E Archive ${Date.now().toString().slice(-5)}`
    const id = await makeGarage(name)
    await sql`update vendors set is_verified = true where id = ${id}`

    await page.goto('/vendors?show=all')
    // Archive sits in the card's ⋯, beside Move to Bin.
    const card = page.getByRole('group', { name, exact: true })
    await card.getByRole('button', { name: `More for ${name}` }).click()
    await card.getByRole('button', { name: `Archive ${name}` }).click()

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

  test('a card offers Move to Bin, and no outright delete', async ({ page }) => {
    const name = `E2E Bin Menu ${Date.now().toString().slice(-5)}`
    const id = await makeGarage(name)

    await page.goto('/vendors?show=all')

    // Never booked, so its card says nothing about bookings.
    const card = page.getByRole('group', { name, exact: true })
    await expect(card.getByText(/^Has \d+ bookings?$/)).toHaveCount(0)
    // Deleting is only from the Bin now: the card has no delete of its own.
    await expect(card.getByRole('button', { name: `Delete ${name}` })).toHaveCount(0)

    const more = card.getByRole('button', { name: `More for ${name}` })
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(card.getByRole('button', { name: `Move ${name} to the Bin` })).toBeVisible()
    // Escape closes it, and nothing was done.
    await page.keyboard.press('Escape')
    await expect(more).toHaveAttribute('aria-expanded', 'false')

    await sql`delete from vendors where id = ${id}`
  })

  test('delete forever is only for a garage in the Bin @p0', async ({ page }) => {
    // CAPACITY has a paid booking and is not in the Bin: the server refuses
    // before it looks at anything else, and says what to do.
    const response = await page.request.delete(
      `${API}/api/v1/admin/vendors/${VENDORS.capacity.id}`,
      {
        data: {
          actorName: 'E2E Admin',
          confirmName: VENDORS.capacity.name,
          selectionHash: 'a'.repeat(64),
        },
      }
    )
    expect(response.status()).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Only a garage in the Bin can be deleted forever. Move it to the Bin first.',
      code: 'VENDOR_NOT_IN_BIN',
    })

    // The list still says how many bookings a garage has had.
    const list = await page.request.get(`${API}/api/v1/admin/vendors`)
    expect(list.status()).toBe(200)
    const { data: vendors } = (await list.json()) as {
      data: Array<{ id: string; bookingCount: number; deletedAt: string | null }>
    }
    const capacity = vendors.find((v) => v.id === VENDORS.capacity.id)
    expect(capacity?.bookingCount).toBeGreaterThan(0)
    expect(capacity?.deletedAt).toBeNull()

    await page.goto('/vendors')
    const card = page.getByRole('group', { name: VENDORS.capacity.name, exact: true })
    await expect(card.getByText(/^Has \d+ bookings?$/)).toBeVisible()

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
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()

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
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()

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

test.describe('admin garage list: chips and checklist', () => {
  const LIST = VENDORS.adminList
  /** Every garage card on the page; the chips' row is a group too, but not a garage's. */
  const cards = (page: Page) =>
    page.locator('[role="group"][aria-labelledby^="vendor-"]')
  const chip = (page: Page, label: string) =>
    page.getByRole('group', { name: 'Show' }).getByRole('button', { name: new RegExp(`^${label} \\d+$`) })
  const countOf = async (page: Page, label: string) =>
    Number((await chip(page, label).getAttribute('aria-label'))!.replace(/\D/g, ''))

  /** The checklist garage as seeded: set up but for its services. */
  async function resetListGarage() {
    await sql`update vendors set bays = 2 where id = ${LIST.id}`
  }

  test('the list opens on Live, and each chip shows as many garages as it says @p0', async ({ page }) => {
    await resetListGarage()
    await page.goto('/vendors')

    await expect(chip(page, 'Live')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Live = customers can find it')).toBeVisible()
    await expect(page.getByText('Active = approved by Detlio, even if paused')).toBeVisible()
    // Live is what customers can find: MAIN is, the pending checklist garage isn't.
    await expect(page.getByRole('group', { name: VENDORS.main.name, exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: LIST.name, exact: true })).toHaveCount(0)

    for (const label of ['All', 'Live', 'Active', 'Pending', 'Suspended', 'Archived', 'Bin']) {
      await chip(page, label).click()
      await expect(chip(page, label)).toHaveAttribute('aria-pressed', 'true')
      await expect(cards(page)).toHaveCount(await countOf(page, label))
    }
    await expect(page).toHaveURL(/\/vendors\?show=bin$/)
    await expect(page.getByText('Bin = off the app. Restore it, or delete it forever.')).toBeVisible()

    // All is every garage not in the Bin, so the stages add up to it.
    const stages = await Promise.all(
      ['Active', 'Pending', 'Suspended', 'Archived'].map((label) => countOf(page, label))
    )
    expect(stages.reduce((a, b) => a + b, 0)).toBe(await countOf(page, 'All'))

    await chip(page, 'Pending').click()
    await expect(page).toHaveURL(/\/vendors\?show=pending$/)
    await expect(page.getByText('Pending = added, not shown to customers yet')).toBeVisible()
    await expect(page.getByRole('group', { name: LIST.name, exact: true })).toBeVisible()
  })

  test('the list API says what is live and what each garage still needs @p0', async ({ page }) => {
    await resetListGarage()
    const response = await page.request.get(`${API}/api/v1/admin/vendors`)
    expect(response.status()).toBe(200)
    const body = (await response.json()) as {
      success: boolean
      data: Array<{
        id: string
        live: boolean
        readiness: Array<{ key: string; severity: string; tab: string }>
      }>
    }
    expect(body.success).toBe(true)

    const listGarage = body.data.find((v) => v.id === LIST.id)
    expect(listGarage?.live).toBe(false)
    expect(listGarage?.readiness.map(({ key, severity, tab }) => ({ key, severity, tab }))).toEqual([
      { key: 'no_services', severity: 'blocking', tab: 'services' },
      { key: 'no_logo', severity: 'optional', tab: 'details' },
      { key: 'no_photos', severity: 'optional', tab: 'details' },
    ])
    // The customer lists' own rule: active, verified, not paused.
    expect(body.data.find((v) => v.id === VENDORS.main.id)?.live).toBe(true)
    expect(body.data.find((v) => v.id === VENDORS.paused.id)?.live).toBe(false)
  })

  test('a garage with no services is "1 blocking", and its row opens Services; Back keeps the chip @p0', async ({ page }) => {
    await resetListGarage()
    await page.goto('/vendors?show=pending')

    const card = page.getByRole('group', { name: LIST.name, exact: true })
    const line = card.getByRole('button', { name: /^1 blocking/ })
    // Optional items trail in grey and never count as needing fixing.
    await expect(line).toHaveText('1 blocking · 2 optional')
    await expect(line).toHaveAttribute('aria-expanded', 'false')
    await line.click()
    await expect(line).toHaveAttribute('aria-expanded', 'true')
    await expect(card.getByText('Blocking', { exact: true })).toBeVisible()
    await expect(card.getByText('Optional', { exact: true })).toBeVisible()

    await card.getByRole('link', { name: /No services/ }).click()
    await expect(page).toHaveURL(
      `/vendors/${LIST.id}/edit?tab=services&back=${encodeURIComponent('/vendors?show=pending')}`
    )
    await expect(page.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('link', { name: 'Go back' }).click()
    await expect(page).toHaveURL(/\/vendors\?show=pending$/)
    await expect(chip(page, 'Pending')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: LIST.name, exact: true })).toBeVisible()
  })

  test('after a save, Back shows the list as it is now @p0', async ({ page }) => {
    // Bays not set: one more thing to fix.
    await sql`update vendors set bays = null where id = ${LIST.id}`
    await page.goto('/vendors?show=pending')

    const card = page.getByRole('group', { name: LIST.name, exact: true })
    const line = card.getByRole('button', { name: /^1 blocking/ })
    await expect(line).toHaveText('1 blocking · 1 to fix · 2 optional')
    await line.click()
    await card.getByRole('link', { name: /Bays not set/ }).click()
    await expect(page.getByRole('tab', { name: 'Operations' })).toHaveAttribute('aria-selected', 'true')

    await page.getByLabel('Bays (optional)').fill('2')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect
      .poll(async () => {
        const [row] = await sql<{ bays: number | null }[]>`
          select bays from vendors where id = ${LIST.id}
        `
        return row.bays
      })
      .toBe(2)

    // The list was loaded seconds ago, well inside its cache time: only the
    // save marking it stale makes Back show the bays as set.
    await page.getByRole('link', { name: 'Go back' }).click()
    await expect(page).toHaveURL(/\/vendors\?show=pending$/)
    await expect(
      page.getByRole('group', { name: LIST.name, exact: true }).getByRole('button', { name: /^1 blocking/ })
    ).toHaveText('1 blocking · 2 optional')

    await resetListGarage()
  })
})
