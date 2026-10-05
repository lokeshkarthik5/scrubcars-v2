/**
 * Reviewing a finished job.
 *
 * reviews.booking_id is unique, so the interesting case is the second attempt:
 * the form has to disappear once a review exists, or the customer is invited
 * to do something the database will refuse.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-review') })

test.describe('reviews', () => {
  test('a completed job can be rated and commented on', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.reviewable}`)

    await page.getByRole('button', { name: 'Rate 4 stars' }).click()
    await page.getByPlaceholder('Tell us about your experience').fill('Quick and careful.')
    await page.getByRole('button', { name: /Submit/i }).click()

    await expect
      .poll(async () => {
        const rows = await sql<{ rating: number; comment: string }[]>`
          select rating, comment from reviews where booking_id = ${BOOKINGS.reviewable}
        `
        return rows[0]
      })
      .toEqual({ rating: 4, comment: 'Quick and careful.' })
  })

  test('a job that already has a review does not offer the form again', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.alreadyReviewed}`)

    // The seeded review is shown instead of an empty rating control.
    await expect(page.getByText('Solid work, seeded.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rate 5 stars' })).toHaveCount(0)
  })

  test('the public review feed names the reviewer, and nothing that reaches them @p0', async ({ page }) => {
    // No sign-in needed for this feed, so it must carry nothing private. Asked
    // of the API itself: the apps call it directly here, not via their proxy.
    const response = await page.request.get(`${API}/api/v1/reviews/vendors/${VENDORS.main.id}`)
    expect(response.ok()).toBe(true)
    const body = await response.text()

    expect(body).not.toContain(CUSTOMERS.review.phone)
    expect(body).not.toContain(CUSTOMERS.review.id)
    expect(body).not.toContain(BOOKINGS.alreadyReviewed)
    expect(body).not.toContain('phone')

    const seeded = (JSON.parse(body).data as { comment: string; user: { name: string } | null }[])
      .find((review) => review.comment === 'Solid work, seeded.')
    // "Reviewing Ravi" in the seed: first name and an initial.
    expect(seeded?.user).toEqual({ name: 'Reviewing R.' })
  })

  test('the review reaches the garage page', async ({ page }) => {
    await page.goto(`/garage/${VENDORS.main.id}`)
    await page.getByRole('tab', { name: 'Reviews' }).click()

    await expect(page.getByText('Solid work, seeded.')).toBeVisible()
  })
})
