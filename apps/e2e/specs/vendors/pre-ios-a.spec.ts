/**
 * Pre-iOS, part A (0065), in the garage portal: the owner seat removes a
 * document it sent that Detlio has not checked yet (back to "Not uploaded"),
 * never an approved required one; and its Reviews screen says "New on
 * Detlio" until three reviews count, as customers see it.
 *
 * PRE_IOS.owner owns PRE_IOS.garage alone. Only its shop photo is removed
 * here; admin's spec removes its GST certificate and owner ID.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { PRE_IOS } from '../../support/seed-ids'

const P = PRE_IOS

test.use({ storageState: asRole('vendor-preios') })

test.describe('remove and the rating in the garage portal @p0', () => {
  test('Documents: Remove its own shop photo before Detlio checks it', async ({ page }) => {
    await page.goto('/settings/documents')
    const shop = page.getByRole('group', { name: 'Shop photo', exact: true })
    await expect(shop.getByText('Waiting for review')).toBeVisible()
    // An approved required one (the owner ID, if admin has not removed it yet) has no Remove.
    await expect(page.getByRole('button', { name: 'Remove Owner ID' })).toHaveCount(0)

    await shop.getByRole('button', { name: 'Remove Shop photo' }).click()
    const ask = page.getByRole('group', { name: 'Remove Shop photo?' })
    await expect(ask).toContainText('It goes back to Not uploaded and its files are deleted.')
    await ask.getByRole('button', { name: 'Remove shop photo' }).click()
    await expect(shop.getByText('Not uploaded')).toBeVisible()
    expect((await sql`select 1 from vendor_documents where id = ${P.documents.shopPhoto}`).length).toBe(0)
    const [audit] = await sql<{ actor_name: string }[]>`
      select actor_name from admin_audit_log
       where action = 'garage_document_removed' and summary->>'documentId' = ${P.documents.shopPhoto}
    `
    expect(audit).toEqual({ actor_name: 'garage' })
  })

  test('Reviews: New on Detlio with two counted reviews; a Test booking’s is not listed', async ({ page }) => {
    await page.goto('/reviews')
    await expect(page.getByText('New on Detlio', { exact: true })).toBeVisible()
    await expect(page.getByText('reviews so far. Customers see your score from', { exact: false })).toBeVisible()
    await expect(page.getByText('Seats were still damp, seeded.')).toBeVisible()
    await expect(page.getByText('Your reply')).toBeVisible()
    await expect(page.getByText('test test, seeded')).toHaveCount(0)
  })
})
