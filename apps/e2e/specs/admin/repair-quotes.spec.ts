/**
 * Repair & bodywork quotes (0076) for the team: Requests gets a second tab,
 * Repair quotes, listing each request with the customer's phone masked,
 * where it stands, each garage's answer (Call for one still waiting) and
 * "Video & photos"; the garage editor's Hours & booking gets "Takes repair &
 * bodywork quotes", which saves on tap and needs a free inspection service.
 *
 * Uses REPAIR_QUOTES' garages and a request of its own (id 7641), put back
 * after; the switch is flipped on `switchGarage`, which no request reaches. The journey sends its own requests at the same time, so
 * cards are found by their reference.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { REPAIR_QUOTES } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const Q = REPAIR_QUOTES
const REQUEST = 'e2e00000-0000-4000-8000-000000007641'

const seed = async () => {
  await sql`delete from repair_quote_requests where id = ${REQUEST}`
  await sql`
    insert into repair_quote_requests (id, user_id, vehicle_id, vehicle_label, vehicle_type, lat, lng, area, note, brief,
      damage_area, brief_source, photos, status, closes_at, created_at)
    values (${REQUEST}, ${Q.customer.id}, ${Q.customer.vehicleId}, 'Maruti Swift', 'hatchback',
      ${Q.point.lat}, ${Q.point.lng}, 'Mahabalipuram', 'Reversed into a pole', 'Rear bumper: cracked corner.',
      'Rear bumper', 'ai',
      ${sql.json([{ key: 'repair-quotes/00000000000000000000000000000000/00000000-0000-4000-8000-000000000002.jpg', kind: 'photo' }])},
      'open', now() + interval '40 hours', now() - interval '1 hour')
  `
  await sql`
    insert into repair_quotes (request_id, vendor_id, distance_km, respond_by, status, price_from, price_to, days,
      needs_inspection, answered_at)
    values (${REQUEST}, ${Q.garage.id}, 2.0, now() + interval '3 hours', 'quoted', 3000, 4200, 1, false, now())
  `
  await sql`
    insert into repair_quotes (request_id, vendor_id, distance_km, respond_by)
    values (${REQUEST}, ${Q.second.id}, 3.5, now() + interval '3 hours')
  `
}

test.describe.serial('Repair quotes for the team @p0', () => {
  test.beforeAll(seed)
  test.afterAll(async () => {
    await sql`delete from repair_quote_requests where id = ${REQUEST}`
    await sql`update vendors set repair_quotes_enabled = true where id = ${Q.switchGarage.id}`
  })

  test('Requests has a Repair quotes tab: Open, the phone masked, each answer', async ({ page }) => {
    await page.goto('/requests')
    const tabs = page.getByRole('navigation', { name: 'Requests sections' })
    await expect(tabs.getByRole('link', { name: 'Visit requests' })).toHaveAttribute('aria-current', 'page')
    await tabs.getByRole('link', { name: 'Repair quotes' }).click()
    await expect(page).toHaveURL(/\/requests\/repair-quotes$/)
    await expect(page.getByRole('heading', { name: 'Repair quotes', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Open \d+$/ })).toHaveAttribute('aria-pressed', 'true')

    const card = page.getByRole('article', { name: 'Repair request: Rear bumper, Maruti Swift' })
    await expect(card).toBeVisible()
    await expect(card.getByText('1 quote in')).toBeVisible()
    await expect(card).toContainText(Q.customer.name)
    // Only the last four digits of the customer's phone.
    await expect(card).not.toContainText(Q.customer.phone)
    await expect(card).toContainText(Q.customer.phone.slice(-4))
    await expect(card.getByText(Q.garage.name)).toBeVisible()
    await expect(card.getByText('₹3,000–4,200 · 1 day')).toBeVisible()
    await expect(card.getByRole('link', { name: `Call ${Q.second.name}` })).toHaveAttribute('href', `tel:+91${Q.secondOwner.phone}`)

    await card.getByRole('button', { name: 'Video & photos' }).click()
    const dialog = page.getByRole('dialog', { name: 'Video and photos' })
    await expect(dialog.getByText('Rear bumper: cracked corner.')).toBeVisible()
    await expect(dialog.getByText('Customer wrote: “Reversed into a pole”')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('the chips filter: Booked holds nothing of this one, All holds it', async ({ page }) => {
    await page.goto('/requests/repair-quotes')
    await page.getByRole('button', { name: /^Booked/ }).click()
    await expect(page).toHaveURL(/filter=booked/)
    await expect(page.getByRole('article', { name: 'Repair request: Rear bumper, Maruti Swift' })).toHaveCount(0)
    await page.getByRole('button', { name: /^All/ }).click()
    await expect(page.getByRole('article', { name: 'Repair request: Rear bumper, Maruti Swift' })).toBeVisible()
  })

  test('the garage editor: the switch saves on tap; it needs a free inspection service', async ({ page }) => {
    // Far from every request, so flipping it never changes who the journey asks.
    await page.goto(`/vendors/${Q.switchGarage.id}/edit?tab=operations`)
    const card = page.getByRole('region', { name: 'Repair & bodywork quotes' })
    await expect(card).toBeVisible()
    await expect(card.getByText('Saves on tap')).toBeVisible()
    await expect(card.getByText('Asked, last 30 days')).toBeVisible()
    const toggle = card.getByRole('switch', { name: 'Takes repair & bodywork quotes' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(card.getByText('Saved')).toBeVisible()
    await expect
      .poll(async () => (await sql<{ on: boolean }[]>`select repair_quotes_enabled as on from vendors where id = ${Q.switchGarage.id}`)[0]?.on)
      .toBe(false)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    await page.goto(`/vendors/${Q.noInspection.id}/edit?tab=operations`)
    const other = page.getByRole('region', { name: 'Repair & bodywork quotes' })
    await expect(other.getByRole('switch', { name: 'Takes repair & bodywork quotes' })).toBeDisabled()
    await expect(other.getByText('Add a free inspection service first (Price on inspection, no fee): customers book their visit as that.')).toBeVisible()
  })
})
