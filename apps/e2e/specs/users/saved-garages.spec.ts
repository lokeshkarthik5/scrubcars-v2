/**
 * Saved garages: the heart on a garage, and Profile → Saved garages.
 *
 * CUSTOMERS.favourites saves VENDORS.main from its page, finds it under
 * Saved garages, and unsaves it there. The API is idempotent both ways and
 * only ever touches the signed-in customer's own saves. The cap, a garage
 * that left the app and the paused line are unit-tested
 * (apps/server/src/modules/favourites/favourites.rules.test.ts,
 * vendors.predicates.test.ts).
 *
 * Its own customer, read by no other spec; each test starts from no saves.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { CUSTOMERS, VENDORS } from '../../support/seed-ids'

const FAVOURITES = `${API}/api/v1/users/me/favourites`

test.use({ storageState: asRole('customer-favourites') })

test.describe.configure({ mode: 'serial' })

test.beforeEach(async () => {
  await sql`delete from user_favourite_vendors where user_id = ${CUSTOMERS.favourites.id}`
})

test.describe('saved garages @p0', () => {
  test('a customer hearts a garage and sees it under Saved garages', async ({ page }) => {
    await page.goto(`/garage/${VENDORS.main.id}`)
    const heart = page.getByRole('button', { name: `Save ${VENDORS.main.name}` })
    await expect(heart).toHaveAttribute('aria-pressed', 'false')
    await heart.click()

    const saved = page.getByRole('button', { name: `Remove ${VENDORS.main.name} from saved garages` })
    await expect(saved).toHaveAttribute('aria-pressed', 'true')
    // Kept on the account, not just on screen.
    await expect
      .poll(async () => {
        const rows = await sql<{ vendor_id: string }[]>`
          select vendor_id from user_favourite_vendors where user_id = ${CUSTOMERS.favourites.id}
        `
        return rows.map((row) => row.vendor_id)
      })
      .toEqual([VENDORS.main.id])

    await page.goto('/profile')
    await page.getByRole('link', { name: 'Saved garages' }).click()
    await expect(page).toHaveURL(/\/profile\/saved-garages$/)
    const list = page.getByRole('list', { name: 'Saved garages, newest first' })
    await expect(list.getByRole('link').filter({ hasText: VENDORS.main.name })).toBeVisible()

    // The heart there unsaves it.
    await list.getByRole('button', { name: `Remove ${VENDORS.main.name} from saved garages` }).click()
    await expect(page.getByText('No saved garages yet')).toBeVisible()
  })

  test('saving and unsaving are idempotent, and only ever the customer’s own', async ({ page }) => {
    const put = `${FAVOURITES}/${VENDORS.main.id}`
    for (let i = 0; i < 2; i++) {
      const response = await page.request.put(put)
      expect(response.status()).toBe(200)
      expect((await response.json()).data).toEqual({ vendorId: VENDORS.main.id, saved: true })
    }
    const listed = await (await page.request.get(FAVOURITES)).json()
    expect(listed.data.items.map((item: { id: string }) => item.id)).toEqual([VENDORS.main.id])
    expect(listed.data.max).toBe(50)

    for (let i = 0; i < 2; i++) {
      const response = await page.request.delete(put)
      expect(response.status()).toBe(200)
      expect((await response.json()).data).toEqual({ vendorId: VENDORS.main.id, saved: false })
    }
    expect((await (await page.request.get(FAVOURITES)).json()).data.items).toEqual([])

    // No garage that does not exist, and no way to name another customer.
    const missing = await page.request.put(`${FAVOURITES}/e2e00000-0000-4000-8000-000000009999`)
    expect(missing.status()).toBe(404)
    const notAnId = await page.request.put(`${FAVOURITES}/main`)
    expect(notAnId.status()).toBe(400)
  })
})
