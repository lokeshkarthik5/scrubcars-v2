/**
 * Google rating for new garages (21 Nov 2026), admin: a garage's side panel
 * shows its Google listing (the G, its rating, the words "Google Maps", when
 * it was read, whether customers see it); "No Google listing" finds the
 * garages still to link; "Link to Google listing" searches Google near the
 * garage's pin (PLACES_FAKE: lib/places/fake.ts) and links the one picked,
 * putting it on a lead made for the garage; Unlink takes it off again. Both
 * are written to admin_audit_log, signed by the session.
 *
 * Only GOOGLE_RATINGS.unlinked is changed, and put back (its lead removed).
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { GOOGLE_RATINGS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const G = GOOGLE_RATINGS

const panel = (page: Page) => page.getByRole('complementary', { name: 'Garage details' })
const openRow = (page: Page, name: string) =>
  page.getByRole('row', { name, exact: true }).getByRole('button', { name, exact: true }).click()

async function putBack() {
  await sql`delete from leads where vendor_id = ${G.unlinked.id} or google_place_id = ${G.place.placeId}`
}

test.describe('admin: the garage’s Google listing', () => {
  test.beforeAll(putBack)
  test.afterAll(putBack)

  test('a linked garage’s panel: the listing, its rating with Google Maps, and that customers see it', async ({ page }) => {
    await page.goto(`/vendors?show=all&q=${encodeURIComponent(G.newLinked.name)}`)
    await openRow(page, G.newLinked.name)
    const section = panel(page).locator('section').filter({ hasText: 'Google listing' })
    await expect(section).toContainText(G.newLinked.name)
    await expect(section).toContainText('4.6')
    await expect(section).toContainText('312 reviews')
    await expect(section).toContainText('Google Maps')
    await expect(section).toContainText('Read from Google')
    await expect(section).toContainText('Customers see it while the garage has fewer than 5 Detlio reviews (now 0).')
    await expect(section.getByRole('button', { name: 'Change' })).toBeVisible()
    await expect(section.getByRole('button', { name: 'Unlink' })).toBeVisible()
  })

  test('No Google listing, then Link to Google listing near the pin, then Unlink; each audited', async ({ page }) => {
    await page.goto(`/vendors?show=nogoogle&q=${encodeURIComponent('Gratings')}`)
    await expect(page.getByRole('row', { name: G.unlinked.name, exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: G.newLinked.name, exact: true })).toHaveCount(0)

    // Linking takes it off that list (and its panel with it), so it is
    // opened from All.
    await page.goto(`/vendors?show=all&q=${encodeURIComponent(G.unlinked.name)}`)
    await openRow(page, G.unlinked.name)
    const section = panel(page).locator('section').filter({ hasText: 'Google listing' })
    await expect(section).toContainText('Not linked. Customers see “New” until it has Detlio reviews.')
    await section.getByRole('button', { name: 'Link to Google listing' }).click()

    const dialog = page.getByRole('dialog', { name: `Link ${G.unlinked.name} to Google` })
    await expect(dialog).toBeVisible()
    // The first search runs as it opens, for the garage's name.
    const option = dialog.getByRole('radio', { name: G.place.name })
    await expect(option).toBeVisible()
    await expect(dialog).toContainText('120 m from the pin')
    await expect(dialog).toContainText('Google Maps')
    await option.check()
    await dialog.getByRole('button', { name: 'Link', exact: true }).click()
    await expect(dialog).toBeHidden()

    await expect(section).toContainText(G.place.name)
    await expect(section).toContainText('4.3')
    await expect(section).toContainText('58 reviews')
    await expect(section).toContainText('Customers see it')
    await expect(section).toContainText('Linked by E2E Admin')

    const [lead] = await sql<
      { vendor_id: string; status: string; google_place_id: string; google_rating: string; google_review_count: number; created_by_name: string }[]
    >`
      select vendor_id, status, google_place_id, google_rating::text, google_review_count, created_by_name
        from leads where vendor_id = ${G.unlinked.id}
    `
    expect(lead).toEqual({
      vendor_id: G.unlinked.id,
      status: 'onboarded',
      google_place_id: G.place.placeId,
      google_rating: '4.3',
      google_review_count: 58,
      created_by_name: 'E2E Admin',
    })
    const linked = await sql<{ actor_name: string; detail: { placeId: string; how: string } }[]>`
      select actor_name, detail from admin_audit_log
       where action = 'garage_google_linked' and summary->>'vendorId' = ${G.unlinked.id}
       order by created_at desc limit 1
    `
    expect(linked[0]?.actor_name).toBe('E2E Admin')
    expect(linked[0]?.detail).toMatchObject({ placeId: G.place.placeId, how: 'create' })

    // The customer's page shows it straight away.
    const api = await page.request.get(`${API}/api/v1/vendors/${G.unlinked.id}`)
    expect((await api.json()).data.google).toEqual({ rating: 4.3, reviewCount: 58 })

    await section.getByRole('button', { name: 'Unlink' }).click()
    await expect(section).toContainText('Not linked.')
    const [after] = await sql<{ google_place_id: string | null; google_rating: string | null }[]>`
      select google_place_id, google_rating::text from leads where vendor_id = ${G.unlinked.id}
    `
    expect(after).toEqual({ google_place_id: null, google_rating: null })
    const unlinked = await sql<{ actor_name: string }[]>`
      select actor_name from admin_audit_log
       where action = 'garage_google_unlinked' and summary->>'vendorId' = ${G.unlinked.id}
    `
    expect(unlinked.map((row) => row.actor_name)).toContain('E2E Admin')
  })
})
