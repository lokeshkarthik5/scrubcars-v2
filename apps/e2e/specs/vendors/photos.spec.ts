/**
 * Logo and gallery upload.
 *
 * The reason MinIO is in the compose file. lib/storage.ts is plain
 * S3-compatible SDK usage, so a local MinIO exercises the real presigned-PUT
 * round trip: the browser asks the API for a URL, uploads straight to storage,
 * then tells the API where it went. Without it these specs could only assert a
 * STORAGE_NOT_CONFIGURED 503.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { VENDORS } from '../../support/seed-ids'

const PIXEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/pixel.png')

test.use({ storageState: asRole('vendor-owner') })

test.beforeEach(async ({ context }) => {
  await setActiveVendor(context, VENDORS.main.id)
})

test.describe('vendor photos', () => {
  test('a gallery photo is uploaded and can be deleted', async ({ page }) => {
    const before = await sql<{ n: string }[]>`
      select count(*)::text as n from vendor_photos where vendor_id = ${VENDORS.main.id}
    `

    await page.goto('/photos')

    // The file input is hidden behind a styled button, so set the files on it
    // directly rather than trying to click through to a native dialog.
    await page.locator('input[type="file"]').last().setInputFiles(PIXEL)

    await expect
      .poll(async () => {
        const rows = await sql<{ n: string }[]>`
          select count(*)::text as n from vendor_photos where vendor_id = ${VENDORS.main.id}
        `
        return Number(rows[0].n)
      })
      .toBe(Number(before[0].n) + 1)

    // The URL must point at storage and be fetchable — a row written with a
    // key the browser cannot resolve is worse than no row.
    const [latest] = await sql<{ url: string; storage_key: string }[]>`
      select url, storage_key from vendor_photos
       where vendor_id = ${VENDORS.main.id} order by created_at desc limit 1
    `
    expect(latest.storage_key).toBeTruthy()
    const fetched = await page.request.get(latest.url)
    expect(fetched.status()).toBe(200)

    await page.getByRole('button', { name: 'Delete photo' }).last().click()

    await expect
      .poll(async () => {
        const rows = await sql<{ n: string }[]>`
          select count(*)::text as n from vendor_photos where vendor_id = ${VENDORS.main.id}
        `
        return Number(rows[0].n)
      })
      .toBe(Number(before[0].n))
  })

  test('a logo is uploaded and shown to customers', async ({ page, context }) => {
    await page.goto('/photos')
    await page.locator('input[type="file"]').first().setInputFiles(PIXEL)

    await expect
      .poll(async () => {
        const rows = await sql<{ logo_url: string | null }[]>`
          select logo_url from vendors where id = ${VENDORS.main.id}
        `
        return rows[0]?.logo_url
      })
      .not.toBeNull()

    const [vendor] = await sql<{ logo_url: string }[]>`
      select logo_url from vendors where id = ${VENDORS.main.id}
    `
    const fetched = await page.request.get(vendor.logo_url)
    expect(fetched.status()).toBe(200)

    await page.getByRole('button', { name: /Remove logo/i }).click()
    await expect
      .poll(async () => {
        const rows = await sql<{ logo_url: string | null }[]>`
          select logo_url from vendors where id = ${VENDORS.main.id}
        `
        return rows[0]?.logo_url
      })
      .toBeNull()

    void context
  })
})
