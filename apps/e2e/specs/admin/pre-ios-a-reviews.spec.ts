/**
 * Pre-iOS, part A (0065): a garage's Reviews tab in admin (mockup frame F).
 * Every review, with whether it counts: Show again on a hidden one, Hide…
 * with a reason on one that counts, and Delete booking on a Test booking's,
 * which opens Delete test booking and takes the review with it.
 *
 * Only PRE_IOS.adminGarage's three reviews are changed; nothing else reads
 * them.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { PRE_IOS } from '../../support/seed-ids'

const reference = (id: string) => id.slice(0, 8).toUpperCase()
const hiddenAt = async (id: string) =>
  (await sql<{ hidden_at: Date | null }[]>`select hidden_at from reviews where id = ${id}`)[0]?.hidden_at ?? null

test.use({ storageState: asRole('admin') })

test.describe('a garage’s Reviews tab @p0', () => {
  test('Show again, Hide… with a reason, and Delete booking on a Test booking’s review', async ({ page }) => {
    await page.goto(`/vendors/${PRE_IOS.adminGarage.id}/edit?tab=reviews`)
    await expect(page.getByRole('tab', { name: 'Reviews' })).toHaveAttribute('aria-selected', 'true')
    const list = page.getByRole('list', { name: 'Reviews', exact: true })
    const row = (text: string) => list.getByRole('listitem').filter({ hasText: text })
    const toHide = row('Rude staff, seeded.')
    const hidden = row('Seeded abusive words.')
    const testOne = row('Admin test review, seeded.')

    // One counted review: no score for customers yet.
    await expect(page.getByText('New on Detlio', { exact: true })).toBeVisible()
    await expect(toHide.getByText('Counts', { exact: true })).toBeVisible()
    await expect(testOne.getByText('Test: never counts')).toBeVisible()
    await expect(hidden.getByText('Hidden', { exact: true })).toBeVisible()
    await expect(hidden.getByText('Abusive language · hidden by E2E seed', { exact: false })).toBeVisible()
    await expect(hidden.getByText('Reported by the garage: Not our customer, seeded.')).toBeVisible()

    // Show again: back in every count.
    await hidden.getByRole('button', { name: 'Show again' }).click()
    await expect(hidden.getByText('Counts', { exact: true })).toBeVisible()
    expect(await hiddenAt(PRE_IOS.reviews.hidden)).toBeNull()

    // Hide…: asks why, then leaves every count; kept in the record.
    // Go back changes nothing.
    await toHide.getByRole('button', { name: 'Hide the review by Reporting Ramesh' }).click()
    const dialog = page.getByRole('dialog', { name: 'Hide this review' })
    await dialog.getByRole('button', { name: 'Go back' }).click()
    await expect(dialog).toBeHidden()
    await expect(toHide.getByText('Counts', { exact: true })).toBeVisible()
    await toHide.getByRole('button', { name: 'Hide the review by Reporting Ramesh' }).click()
    const hide = dialog.getByRole('button', { name: 'Hide review' })
    await expect(hide).toBeDisabled()
    await dialog.getByLabel('Why is it hidden?').fill('Abusive language, E2E')
    await hide.click()
    await expect(dialog).toBeHidden()
    await expect(toHide.getByText('Hidden', { exact: true })).toBeVisible()
    await expect(toHide.getByText('Abusive language, E2E · hidden by E2E Admin', { exact: false })).toBeVisible()
    expect(await hiddenAt(PRE_IOS.reviews.toHide)).not.toBeNull()
    const audits = await sql<{ action: string; actor_name: string }[]>`
      select action, actor_name from admin_audit_log
       where summary->>'reviewId' in (${PRE_IOS.reviews.toHide}, ${PRE_IOS.reviews.hidden})
       order by created_at
    `
    expect(audits).toEqual([
      { action: 'review_shown', actor_name: 'E2E Admin' },
      { action: 'review_hidden', actor_name: 'E2E Admin' },
    ])

    // Delete booking: the booking's own Delete test booking, from here.
    const ref = reference(PRE_IOS.bookings.adminTest)
    await testOne.getByRole('button', { name: 'Delete booking' }).click()
    const del = page.getByRole('dialog', { name: `Delete test booking #${ref}` })
    await expect(del.getByText('1 review', { exact: true })).toBeVisible()
    await del.getByLabel('Type DELETE 1 BOOKING to confirm').fill('DELETE 1 BOOKING')
    await del.getByRole('button', { name: 'Delete 1 booking' }).click()
    await expect(del.getByText('Done. Deleted by E2E Admin.')).toBeVisible()
    await del.getByRole('button', { name: 'Done' }).click()
    await expect(testOne).toHaveCount(0)
    expect((await sql`select 1 from reviews where id = ${PRE_IOS.reviews.adminTest}`).length).toBe(0)
  })
})
