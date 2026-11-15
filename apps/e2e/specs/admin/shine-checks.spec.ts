/**
 * Issues → Shine checks (0075): finished bookings whose after-photos scored
 * under 60, for a person to look at. As the owner ('admin'): the tab sits in
 * Issues; New lists SHINE's two seeded low scores with the after score, the
 * before, the lowest area, the booking, the customer, the after photos and
 * what was noticed; Looks fine moves one to its chip, Follow up the other.
 * Nothing about the garage changes (no strike, no pause): the page only
 * records who looked.
 *
 * SHINE_SCORE_ENABLED=on in .env.e2e. Both checks are put back to New first,
 * so a retry finds them there. Fixture ids 7600–7699 only (seedShineRows).
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { SHINE } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const ref = (bookingId: string) => `#${bookingId.slice(0, 8).toUpperCase()}`

test.beforeEach(async () => {
  await sql`
    update shine_job_scores
       set review_status = 'new', reviewed_at = null, reviewed_by = null
     where id in (${SHINE.scores.lowFine}, ${SHINE.scores.lowFollow})
  `
})

test.describe('Shine checks', () => {
  test('Issues has a Shine checks tab that opens the list', async ({ page }) => {
    await page.goto('/complaints')
    const sections = page.getByRole('navigation', { name: 'Issues sections' })
    await sections.getByRole('link', { name: 'Shine checks' }).click()
    await expect(page).toHaveURL(/\/shine-checks$/)
    await expect(page.getByRole('heading', { name: 'Shine checks' })).toBeVisible()
    await expect(sections.getByRole('link', { name: 'Shine checks' })).toHaveAttribute('aria-current', 'page')
  })

  test('New lists the low after-scores; Looks fine and Follow up each move one @p0', async ({ page }) => {
    await page.goto('/shine-checks')
    const list = page.getByRole('list', { name: 'New Shine checks' })
    const fine = list.getByRole('listitem').filter({ hasText: ref(SHINE.bookings.lowFine) })
    const follow = list.getByRole('listitem').filter({ hasText: ref(SHINE.bookings.lowFollow) })

    await expect(fine).toContainText(SHINE.garage.name)
    await expect(fine).toContainText('After score')
    await expect(fine).toContainText('48')
    await expect(fine).toContainText('(before 44)')
    await expect(fine).toContainText('Lowest area')
    await expect(fine).toContainText('Seats & floor')
    await expect(fine).toContainText(SHINE.customer.name)
    await expect(fine).toContainText('Detlio noticed: mats still muddy, dust left on the dashboard.')
    await expect(fine.getByRole('list', { name: 'After photos' }).getByRole('listitem')).toHaveCount(2)
    await expect(fine.getByRole('link', { name: ref(SHINE.bookings.lowFine) })).toHaveAttribute(
      'href',
      `/bookings/${SHINE.bookings.lowFine}`
    )
    await expect(follow).toContainText('57')

    await fine.getByRole('button', { name: 'Looks fine' }).click()
    await expect(page.getByText('Marked as looks fine')).toBeVisible()
    await expect(fine).toHaveCount(0)

    await follow.getByRole('button', { name: 'Follow up' }).click()
    await expect(page.getByText('Marked as followed up')).toBeVisible()
    await expect(follow).toHaveCount(0)

    // Each under its own chip, with who marked it.
    await page.getByRole('button', { name: /^Looks fine \d+$/ }).click()
    await expect(page).toHaveURL(/\/shine-checks\?show=looks_fine$/)
    const fineList = page.getByRole('list', { name: 'Looks fine Shine checks' })
    await expect(fineList.getByRole('listitem').filter({ hasText: ref(SHINE.bookings.lowFine) })).toContainText(/Looks fine · .+ by /)

    await page.getByRole('button', { name: /^Followed up \d+$/ }).click()
    await expect(page).toHaveURL(/\/shine-checks\?show=followed_up$/)
    await expect(
      page.getByRole('list', { name: 'Followed up Shine checks' }).getByRole('listitem').filter({ hasText: ref(SHINE.bookings.lowFollow) })
    ).toBeVisible()
  })

  test('the API refuses a second mark', async ({ page }) => {
    const { API } = await import('../../support/auth')
    const first = await page.request.post(`${API}/api/v1/admin/shine-checks/${SHINE.scores.lowFine}/review`, {
      data: { outcome: 'looks_fine', actorName: 'admin' },
    })
    expect(first.status()).toBe(200)
    const again = await page.request.post(`${API}/api/v1/admin/shine-checks/${SHINE.scores.lowFine}/review`, {
      data: { outcome: 'followed_up', actorName: 'admin' },
    })
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('SHINE_CHECK_REVIEWED')
  })
})
