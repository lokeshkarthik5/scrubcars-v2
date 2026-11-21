/**
 * Garage photo order in the admin editor (Details → Logo & photos, 21 Nov
 * 2026): "Make cover" takes a photo to the front, the arrows move it one
 * place, the first has the Cover tag, and each move saves at once. The API
 * refuses a list that isn't the garage's photos now, and the change is in
 * admin_audit_log.
 *
 * Everything here is on PHOTO_ORDER.garage (ids 8000–8049), which only the
 * photo-order specs read. Each test puts the seeded order back first, so a
 * retry starts where the first attempt did.
 */
import type { Locator, Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { PHOTO_ORDER } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const GARAGE = PHOTO_ORDER.garage
const [FRONT, BAY, LOUNGE] = PHOTO_ORDER.photos
const EDIT = `/vendors/${GARAGE.id}/edit?tab=details`
const ORDER_API = `${API}/api/v1/admin/vendors/${GARAGE.id}/photos/order`

async function resetOrder() {
  for (const [sortOrder, photo] of PHOTO_ORDER.photos.entries()) {
    await sql`update vendor_photos set sort_order = ${sortOrder} where id = ${photo.id}`
  }
}

async function storedOrder() {
  const rows = await sql<{ id: string }[]>`
    select id from vendor_photos where vendor_id = ${GARAGE.id}
     order by sort_order, created_at
  `
  return rows.map((row) => row.id)
}

/** The tile of the photo shown n-th (1-based), by its numbered alt text. */
function tile(list: Locator, n: number) {
  return list.getByRole('listitem').filter({ has: list.page().getByAltText(`Garage photo ${n}`, { exact: true }) })
}

async function photoList(page: Page) {
  await page.goto(EDIT)
  const list = page.getByRole('list', { name: 'Garage photos' })
  await expect(list.getByRole('img')).toHaveCount(3)
  return list
}

test.describe('admin garage photo order', () => {
  test('Make cover and the arrows save at once and stay after a reload @p0', async ({ page }) => {
    await resetOrder()
    const list = await photoList(page)

    // The first is the cover: its tag, no Make cover, no left arrow.
    const first = tile(list, 1)
    await expect(first.getByText('Cover', { exact: true })).toBeVisible()
    await expect(first.getByRole('button', { name: 'Make this the cover photo' })).toHaveCount(0)
    await expect(first.getByRole('button', { name: 'Move photo left' })).toBeDisabled()
    await expect(tile(list, 3).getByRole('button', { name: 'Move photo right' })).toBeDisabled()

    // Make the third photo the cover.
    await tile(list, 3).getByRole('button', { name: 'Make this the cover photo' }).click()
    await expect.poll(storedOrder).toEqual([LOUNGE.id, FRONT.id, BAY.id])
    await expect(list.getByRole('img').first()).toHaveAttribute('src', /Lounge/)

    // Move the (now) second photo one place right.
    await tile(list, 2).getByRole('button', { name: 'Move photo right' }).click()
    await expect.poll(storedOrder).toEqual([LOUNGE.id, BAY.id, FRONT.id])

    // And the last one place left.
    await tile(list, 3).getByRole('button', { name: 'Move photo left' }).click()
    await expect.poll(storedOrder).toEqual([LOUNGE.id, FRONT.id, BAY.id])

    await page.reload()
    const again = page.getByRole('list', { name: 'Garage photos' })
    await expect(again.getByRole('img').first()).toHaveAttribute('src', /Lounge/)
    await expect(tile(again, 1).getByText('Cover', { exact: true })).toBeVisible()

    // Audited, signed by the session.
    const [audit] = await sql<{ actor_name: string; detail: { after: string[] } }[]>`
      select actor_name, detail from admin_audit_log
       where action = 'garage_photos_reordered' and summary->>'vendorId' = ${GARAGE.id}
       order by created_at desc limit 1
    `
    expect(audit?.detail.after).toEqual([LOUNGE.id, FRONT.id, BAY.id])
    expect(audit?.actor_name).toBeTruthy()
  })

  test('the API refuses a list that is not the garage photos now', async ({ page }) => {
    await resetOrder()
    const missing = await page.request.put(ORDER_API, { data: { photoIds: [BAY.id, FRONT.id] } })
    expect(missing.status()).toBe(409)
    expect((await missing.json()).code).toBe('PHOTO_ORDER_STALE')

    const duplicate = await page.request.put(ORDER_API, { data: { photoIds: [BAY.id, BAY.id, FRONT.id] } })
    expect(duplicate.status()).toBe(400)
    expect((await duplicate.json()).code).toBe('PHOTO_ORDER_DUPLICATE')

    // Another garage's photo in place of one of its own.
    const foreign = await page.request.put(ORDER_API, {
      data: { photoIds: [BAY.id, FRONT.id, 'e2e00000-0000-4000-8000-000000008049'] },
    })
    expect(foreign.status()).toBe(409)

    expect(await storedOrder()).toEqual([FRONT.id, BAY.id, LOUNGE.id])
  })
})
