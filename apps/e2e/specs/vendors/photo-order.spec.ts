/**
 * Garage photo order on the garage's own Photos page (21 Nov 2026): the
 * owner makes a photo the cover and moves another with the arrows; each
 * move saves at once and is what the page shows after a reload. An
 * operator's seat can't reach it (the server's route tests hold the 403).
 *
 * On PHOTO_ORDER.garage (ids 8000–8049), which only the photo-order specs
 * read. Each test puts the seeded order back first.
 */
import type { Locator } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { PHOTO_ORDER } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-photo-order') })

test.beforeEach(async ({ context }) => {
  await setActiveVendor(context, PHOTO_ORDER.garage.id)
})

const [FRONT, BAY, LOUNGE] = PHOTO_ORDER.photos

async function resetOrder() {
  for (const [sortOrder, photo] of PHOTO_ORDER.photos.entries()) {
    await sql`update vendor_photos set sort_order = ${sortOrder} where id = ${photo.id}`
  }
}

async function storedOrder() {
  const rows = await sql<{ id: string }[]>`
    select id from vendor_photos where vendor_id = ${PHOTO_ORDER.garage.id}
     order by sort_order, created_at
  `
  return rows.map((row) => row.id)
}

/** The tile of the photo shown n-th (1-based), by its numbered alt text. */
function tile(list: Locator, n: number) {
  return list.getByRole('listitem').filter({ has: list.page().getByAltText(`Garage photo ${n}`, { exact: true }) })
}

test.describe('garage photo order', () => {
  test('the owner makes a photo the cover and moves another, and it stays', async ({ page }) => {
    await resetOrder()
    await page.goto('/photos')
    const list = page.getByRole('list', { name: 'Photos' })
    await expect(list.getByRole('img')).toHaveCount(3)

    await expect(tile(list, 1).getByText('Cover', { exact: true })).toBeVisible()
    await expect(tile(list, 1).getByRole('button', { name: 'Move photo left' })).toBeDisabled()
    await expect(page.getByText('The first photo is your cover: customers see it first.', { exact: false })).toBeVisible()

    await tile(list, 2).getByRole('button', { name: 'Make this the cover photo' }).click()
    await expect.poll(storedOrder).toEqual([BAY.id, FRONT.id, LOUNGE.id])
    await expect(tile(list, 1).getByText('Cover', { exact: true })).toBeVisible()
    await expect(list.getByRole('img').first()).toHaveAttribute('src', /Bay/)

    await tile(list, 3).getByRole('button', { name: 'Move photo left' }).click()
    await expect.poll(storedOrder).toEqual([BAY.id, LOUNGE.id, FRONT.id])

    await page.reload()
    const again = page.getByRole('list', { name: 'Photos' })
    await expect(again.getByRole('img').first()).toHaveAttribute('src', /Bay/)
    await expect(again.getByRole('img').last()).toHaveAttribute('src', /Front/)
  })
})
