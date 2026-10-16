/**
 * The admin garage editor: "How customers book" above the tabs, the save bar,
 * links that open a tab, ready-made services and Write with AI.
 *
 * Everything here is on VENDORS.adminEditor, which no other file reads or
 * books. Each test puts the seeded state back first, so a retry starts where
 * the first attempt did. Write with AI runs against the API's fake (AI_FAKE=1
 * in .env.e2e): nothing leaves the machine.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const GARAGE = VENDORS.adminEditor
const EDIT = `/vendors/${GARAGE.id}/edit`
// FAKE_AI_TEXT in apps/server/src/lib/ai.ts.
const FAKE_DESCRIPTION =
  'Exterior washed by hand and dried with microfibre, with the wheels and glass cleaned.'

async function resetGarage() {
  await sql`
    update vendors
       set business_name = ${GARAGE.name}, dropin_enabled = true,
           doorstep_enabled = false, doorstep_radius_km = null
     where id = ${GARAGE.id}
  `
  await sql`
    update services set description = null, is_active = true
     where id in (${SERVICES.editorFoam.id}, ${SERVICES.editorPolish.id})
  `
  // Rows an earlier attempt may have saved from a template.
  await sql`
    delete from services
     where vendor_id = ${GARAGE.id}
       and id not in (${SERVICES.editorFoam.id}, ${SERVICES.editorPolish.id})
  `
}

async function bookingColumns() {
  const [row] = await sql<
    { dropin_enabled: boolean; doorstep_enabled: boolean; doorstep_radius_km: number | null }[]
  >`
    select dropin_enabled, doorstep_enabled, doorstep_radius_km from vendors where id = ${GARAGE.id}
  `
  return row
}

async function description(id: string) {
  const [row] = await sql<{ description: string | null }[]>`
    select description from services where id = ${id}
  `
  return row?.description ?? null
}

test.describe('admin garage editor', () => {
  test('how customers book saves on tap and is still there after a reload @p0', async ({ page }) => {
    await resetGarage()
    await page.goto(EDIT)

    const card = page.getByRole('region', { name: 'How customers book' })
    await expect(card.getByRole('radio', { name: 'At the garage' })).toHaveAttribute('aria-checked', 'true')
    await expect(card).not.toContainText('Doorstep within')
    // The fixture garage is Pending and unverified: the card must not read
    // as though customers could already book it.
    await expect(card).toContainText('When live, customers can book')
    await expect(card).toContainText(
      'Not live yet: customers can’t see this garage until it’s Active and verified (Details).'
    )

    // Saved the moment it is tapped, with a quiet tick: no Save changes.
    await card.getByRole('radio', { name: 'Both' }).click()
    await expect(card.getByRole('status')).toHaveText('Saved')
    await expect
      .poll(bookingColumns)
      .toEqual({ dropin_enabled: true, doorstep_enabled: true, doorstep_radius_km: null })
    await expect(card).toContainText('At the garage · Doorstep within 10 km (default)')
    await expect(card).toContainText('Optional. Empty means 10 km.')

    // The radius saves when the box is left.
    const km = card.getByLabel('Travels up to')
    await km.fill('8')
    await km.press('Tab')
    await expect.poll(async () => (await bookingColumns()).doorstep_radius_km).toBe(8)
    await expect(card).toContainText('At the garage · Doorstep within 8 km')

    // Out of range is said, and not sent.
    await km.fill('45')
    await km.press('Tab')
    await expect(card).toContainText('Enter a distance from 1 to 30 km, or leave it empty.')
    expect((await bookingColumns()).doorstep_radius_km).toBe(8)

    // Switching to "At the garage" takes the box and what was said about it
    // away together; back on Both, the box shows what is saved.
    await card.getByRole('radio', { name: 'At the garage' }).click()
    await expect(card).not.toContainText('Enter a distance')
    await expect
      .poll(bookingColumns)
      .toEqual({ dropin_enabled: true, doorstep_enabled: false, doorstep_radius_km: 8 })
    await card.getByRole('radio', { name: 'Both' }).click()
    await expect(card.getByLabel('Travels up to')).toHaveValue('8')
    await expect.poll(async () => (await bookingColumns()).doorstep_enabled).toBe(true)

    // Nothing here waits for the save bar.
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)

    await page.reload()
    await expect(card.getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true')
    await expect(card.getByLabel('Travels up to')).toHaveValue('8')

    await card.getByRole('radio', { name: 'Doorstep' }).click()
    await expect
      .poll(bookingColumns)
      .toEqual({ dropin_enabled: false, doorstep_enabled: true, doorstep_radius_km: 8 })
    await expect(card).toContainText('Doorstep within 8 km')
    await expect(card).not.toContainText('At the garage ·')

    await resetGarage()
  })

  test('the save bar says what is unsaved, Discard puts it back, and Save stays on the page @p0', async ({ page }) => {
    await resetGarage()
    await page.goto(EDIT)

    const businessName = page.getByLabel('Business name')
    await expect(businessName).toHaveValue(GARAGE.name)
    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toHaveCount(0)

    await businessName.fill(`${GARAGE.name} Renamed`)
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toHaveText(
      'Unsaved changes in Details'
    )
    await expect(page.getByRole('tab', { name: 'Details, unsaved changes', exact: true })).toBeVisible()
    await expect(save).toBeEnabled()

    // Typed back to what it was: nothing to save, so no bar.
    await businessName.fill(GARAGE.name)
    await expect(save).toHaveCount(0)

    await businessName.fill(`${GARAGE.name} Renamed`)
    await page.getByRole('button', { name: 'Discard' }).click()
    await expect(businessName).toHaveValue(GARAGE.name)
    await expect(save).toHaveCount(0)

    // A field Save needs, emptied: the bar says which and where, and Save waits.
    await page.getByLabel('Owner phone').fill('98765')
    await expect(page.getByRole('status').filter({ hasText: 'Owner phone' })).toHaveText(
      'Owner phone must be 10 digits (Details)'
    )
    await expect(save).toBeDisabled()
    await page.getByRole('button', { name: 'Discard' }).click()

    await businessName.fill(`${GARAGE.name} Renamed`)
    await save.click()
    await expect(page.locator('.Toastify').getByText('Saved')).toBeVisible()
    await expect(save).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/vendors/${GARAGE.id}/edit`))
    await expect
      .poll(async () => {
        const [row] = await sql<{ business_name: string }[]>`
          select business_name from vendors where id = ${GARAGE.id}
        `
        return row.business_name
      })
      .toBe(`${GARAGE.name} Renamed`)

    await resetGarage()
  })

  test('?tab= opens that tab, and the open tab is kept in the address @p0', async ({ page }) => {
    await resetGarage()
    await page.goto(`${EDIT}?tab=services`)
    await expect(page.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: /^Services/ })).toBeVisible()

    await page.getByRole('tab', { name: 'Operations' }).click()
    await expect(page).toHaveURL(/[?&]tab=operations/)
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Operations' })).toHaveAttribute('aria-selected', 'true')

    // Anything else opens Details; the back arrow never leaves the panel.
    await page.goto(`${EDIT}?tab=nonsense&back=${encodeURIComponent('https://example.com')}`)
    await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('link', { name: 'Go back' })).toHaveAttribute('href', '/vendors')
    await page.goto(`${EDIT}?back=${encodeURIComponent('/vendors?q=foam')}`)
    await expect(page.getByRole('link', { name: 'Go back' })).toHaveAttribute('href', '/vendors?q=foam')
  })

  test('a template adds a ready-made row that asks for its prices @p0', async ({ page }) => {
    await resetGarage()
    await page.goto(`${EDIT}?tab=services`)

    const templates = page.getByRole('group', { name: 'Add from template' })
    // The garage already has a Foam wash, so that one is not offered.
    // Exact: "Underbody wash" is offered too, and a plain name matches it.
    await expect(templates.getByRole('button', { name: 'Body wash', exact: true })).toBeVisible()
    await expect(templates.getByRole('button', { name: 'Foam wash', exact: true })).toHaveCount(0)

    await templates.getByRole('button', { name: 'Body wash', exact: true }).click()
    const row = page.getByRole('group', { name: 'Body wash', exact: true })
    await expect(row).toContainText('Add the hatchback, sedan and SUV prices')
    await expect(templates.getByRole('button', { name: 'Body wash', exact: true })).toHaveCount(0)

    // Its prices are the garage's own, so it holds the save until they are in.
    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    await expect(page.getByRole('status').filter({ hasText: 'needs a price' })).toHaveText(
      '1 service needs a price (Services)'
    )
    await expect(page.getByRole('tab', { name: 'Services, unsaved changes', exact: true })).toBeVisible()

    await row.getByLabel(/hatchback price in rupees/).fill('299')
    await row.getByLabel(/sedan price in rupees/).fill('349')
    await row.getByLabel(/SUV price in rupees/).fill('399')
    await expect(save).toBeEnabled()
    await save.click()

    await expect
      .poll(async () => {
        const rows = await sql<{ category: string; price_suv: string; duration_mins: number; description: string }[]>`
          select category, price_suv, duration_mins, description from services
           where vendor_id = ${GARAGE.id} and name = 'Body wash' and is_active
        `
        return rows.map((r) => [r.category, r.price_suv, r.duration_mins, r.description.length > 0])
      })
      .toEqual([['car_wash', '399.00', 30, true]])

    await resetGarage()
  })

  test('Write with AI fills a description, and Save keeps it @p0', async ({ page }) => {
    await resetGarage()

    // The API side first: on in this stack (AI_FAKE), facts in, text out.
    const config = await page.request.get(`${API}/api/v1/admin/ai/config`)
    expect(config.status()).toBe(200)
    expect(await config.json()).toEqual({ success: true, data: { describe: true, pictures: true } })

    const described = await page.request.post(`${API}/api/v1/admin/services/describe`, {
      data: { name: 'Foam wash', category: 'car_wash', pricingType: 'per_vehicle', garageName: GARAGE.name },
    })
    expect(described.status()).toBe(200)
    expect(await described.json()).toEqual({ success: true, data: { description: FAKE_DESCRIPTION } })

    // Only the service's facts: anything else is refused, never forwarded.
    const extra = await page.request.post(`${API}/api/v1/admin/services/describe`, {
      data: { name: 'Foam wash', category: 'car_wash', pricingType: 'flat', ownerPhone: '9000000000' },
    })
    expect(extra.status()).toBe(400)

    await page.goto(`${EDIT}?tab=services`)
    const row = page.getByRole('group', { name: SERVICES.editorPolish.name, exact: true })
    await row.getByRole('button', { name: `More for ${SERVICES.editorPolish.name}` }).click()
    await row.getByRole('button', { name: 'Write with AI' }).click()
    await expect(row.getByLabel(/description$/)).toHaveValue(FAKE_DESCRIPTION)

    // Only a draft until saved, like typed text.
    expect(await description(SERVICES.editorPolish.id)).toBeNull()
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toHaveText(
      'Unsaved changes in Services'
    )
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => description(SERVICES.editorPolish.id)).toBe(FAKE_DESCRIPTION)

    // The rest in one go, one row at a time.
    await page.getByRole('button', { name: 'Fill all empty descriptions' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Filled' })).toHaveText(
      'Filled 1 description. Read it under the service’s ⋯ before saving.'
    )
    await expect(page.getByRole('button', { name: 'Fill all empty descriptions' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Discard' }).click()
    expect(await description(SERVICES.editorFoam.id)).toBeNull()
    // Discard empties the descriptions again, and the note about them goes.
    await expect(page.getByRole('button', { name: 'Fill all empty descriptions' })).toBeVisible()
    await expect(page.getByText('Filled 1 description')).toHaveCount(0)

    await resetGarage()
  })
})
