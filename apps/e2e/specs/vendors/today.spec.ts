/**
 * The garage's Today view, its job page, and Undo on Start and Complete
 * (UX audit, garage findings 1, 5, 9 and 10), at VENDORS.today (fixtures in
 * the reserved 3900–3999 range, one job in each list whatever the clock:
 * see BOOKINGS.today*).
 *
 * Read-only by design: Start and Complete are each undone inside their five
 * seconds, and the database is checked to say nothing changed. The steps
 * going through for real are bookings.spec.ts and the journeys.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { getBooking } from '../../support/db'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-today') })

test.beforeEach(async ({ context }) => {
  await setActiveVendor(context, VENDORS.today.id)
})

const name = CUSTOMERS.today.name
const statusOf = async (id: string) => (await getBooking(id))?.status
/** Longer than the five seconds a step waits for Undo. */
const PAST_UNDO_MS = 6_500

test.describe('garage Today view and job page @p0', () => {
  test('Bookings opens on Today: the job under way, the day, and new bookings pinned on top', async ({
    page,
  }) => {
    await page.goto('/bookings')
    await expect(page.getByRole('radio', { name: /^Today/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )

    // Now: the job under way, its next step the screen's one main button.
    const working = page.getByRole('region', { name: 'Now' })
    await expect(working.locator(`#job-${BOOKINGS.todayWorking}`)).toBeVisible()
    await expect(
      working.getByRole('button', { name: `Complete job for ${name}` })
    ).toBeVisible()

    // Next: today's accepted job, one short row with its own next step.
    const next = page.getByRole('region', { name: 'Next' })
    await expect(next.locator(`#job-${BOOKINGS.todayLate}`)).toBeVisible()
    await expect(
      next.getByRole('button', { name: `Start job for ${name}` })
    ).toBeVisible()

    // Later and Done jobs are on their own lists, not today's.
    await expect(page.locator(`#job-${BOOKINGS.todayLater}`)).toHaveCount(0)
    await expect(page.locator(`#job-${BOOKINGS.todayDone}`)).toHaveCount(0)

    // The booking waiting for an answer stays pinned on top, and opens New.
    await page.getByRole('button', { name: /^1 booking to answer/ }).click()
    await expect(page.getByRole('radio', { name: /^New/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    const card = page.locator(`#job-${BOOKINGS.todayAnswer}`)
    // Three hours to answer: further off than the window, so "By 1:15 pm".
    await expect(card.getByText(/^By \d{1,2}:\d{2} [ap]m$/)).toBeVisible()
    // The card says what the job is worth.
    await expect(card.getByText('₹700')).toBeVisible()
    await expect(
      card.getByRole('button', { name: `Accept booking for ${name}` })
    ).toBeVisible()

    await page.getByRole('radio', { name: /^Later/ }).click()
    await expect(page.locator(`#job-${BOOKINGS.todayLater}`)).toBeVisible()
    await page.getByRole('radio', { name: /^Done/ }).click()
    await expect(
      page.locator(`#job-${BOOKINGS.todayDone}`).getByText('Done')
    ).toBeVisible()
  })

  test("a job's page: the progress line, the photo step, and Start with Undo", async ({
    page,
  }) => {
    await page.goto('/bookings?tab=today')
    await page.locator(`#job-${BOOKINGS.todayLate}`).getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${BOOKINGS.todayLate}$`))

    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    const progress = page.getByRole('list', { name: 'Job progress' })
    await expect(progress.getByText('Accepted')).toBeVisible()
    await expect(progress.getByText('Done')).toBeVisible()
    // Only the photo step in hand: before photos, as two big tiles.
    await expect(
      page.getByRole('heading', { name: 'Before photos' })
    ).toBeVisible()
    await expect(
      page.getByLabel(`Add front before photo for ${name}`)
    ).toBeAttached()
    await expect(
      page.getByLabel(`Add back before photo for ${name}`)
    ).toBeAttached()

    // Start, then Undo inside the five seconds: nothing reaches the server.
    await page.getByRole('button', { name: `Start job for ${name}` }).click()
    await expect(page.getByText('Job started')).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await page.waitForTimeout(PAST_UNDO_MS)
    expect(await statusOf(BOOKINGS.todayLate)).toBe('confirmed')
    await expect(
      page.getByRole('button', { name: `Start job for ${name}` })
    ).toBeEnabled()
  })

  test('Complete from the Today row, undone', async ({ page }) => {
    await page.goto('/bookings')
    await page
      .getByRole('region', { name: 'Now' })
      .getByRole('button', { name: `Complete job for ${name}` })
      .click()
    await expect(page.getByText('Job completed')).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await page.waitForTimeout(PAST_UNDO_MS)
    expect(await statusOf(BOOKINGS.todayWorking)).toBe('in_progress')
  })

  test('Home leads with the booking to answer, and its Today tile opens Today', async ({
    page,
  }) => {
    await page.goto('/home')
    await expect(
      page.getByRole('heading', { name: /^Waiting for your answer/ })
    ).toBeVisible()
    const card = page.locator(`#job-${BOOKINGS.todayAnswer}`)
    await expect(card.getByText(/^By \d{1,2}:\d{2} [ap]m$/)).toBeVisible()
    await expect(
      card.getByRole('button', { name: `Accept booking for ${name}` })
    ).toBeVisible()

    await page
      .getByRole('link', { name: "Today's jobs: 2. Open Today" })
      .click()
    await expect(page).toHaveURL(/\/bookings\?tab=today$/)
    await expect(page.getByRole('region', { name: 'Now' })).toBeVisible()
  })
})
