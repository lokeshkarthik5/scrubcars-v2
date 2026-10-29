/**
 * Pre-iOS, part A (0065): the rating customers see. A garage with fewer
 * than 3 counted reviews reads "New on Detlio" instead of stars (a Test
 * booking's review never counts, and is never listed); one with 3 shows its
 * score. A review can be reported to the team from the garage page; signed
 * out, Report asks to sign in first. The garage's public reply shows under
 * its review.
 *
 * Only PRE_IOS.garage and ratedGarage are read, and only PRE_IOS.reviews.damp
 * is reported (by PRE_IOS.reporter, whose session global-setup mints).
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { PRE_IOS } from '../../support/seed-ids'

const P = PRE_IOS

test.describe('ratings on the garage page @p0', () => {
  test.use({ storageState: asRole('customer-preios-reporter') })

  test('two counted reviews: New on Detlio, no stars; a Test booking’s review is not listed', async ({
    page,
  }) => {
    await page.goto(`/garage/${P.garage.id}`)
    await expect(
      page.getByRole('heading', { name: P.garage.name })
    ).toBeVisible()
    await expect(
      page.getByText('New on Detlio', { exact: true }).first()
    ).toBeVisible()

    await page.getByRole('tab', { name: 'Reviews' }).click()
    const panel = page.getByRole('tabpanel')
    await expect(
      panel.getByText('New on Detlio', { exact: true })
    ).toBeVisible()
    await expect(panel.getByText('2 reviews so far')).toBeVisible()
    await expect(panel.getByText('Spotless finish, seeded.')).toBeVisible()
    await expect(panel.getByText('test test, seeded')).toHaveCount(0)
    // The garage's one public reply, under its review.
    const damp = page
      .locator('#garage-tab-panel > div')
      .filter({ hasText: 'Seats were still damp, seeded.' })
    await expect(damp.getByText(`Reply from ${P.garage.name}`)).toBeVisible()
    await expect(
      damp.getByText('Sorry, we have fixed our drying step.')
    ).toBeVisible()
  })

  test('three counted reviews show the score', async ({ page }) => {
    await page.goto(`/garage/${P.ratedGarage.id}`)
    await expect(
      page.getByRole('heading', { name: P.ratedGarage.name })
    ).toBeVisible()
    await expect(page.getByText('4.7', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('(3 reviews)')).toBeVisible()
    await expect(page.getByText('New on Detlio', { exact: true })).toHaveCount(
      0
    )
  })

  test('Report a review: a reason, sent to the team once', async ({ page }) => {
    await page.goto(`/garage/${P.garage.id}`)
    await page.getByRole('tab', { name: 'Reviews' }).click()
    const damp = page
      .locator('#garage-tab-panel > div')
      .filter({ hasText: 'Seats were still damp, seeded.' })
    await damp.getByRole('button', { name: /^Report .+'s review$/ }).click()

    const sheet = page.getByRole('dialog', { name: 'Report this review' })
    const send = sheet.getByRole('button', { name: 'Send report' })
    await expect(send).toBeDisabled()
    await sheet
      .getByLabel("What's wrong with it?")
      .fill('This looks fake to me')
    await send.click()
    await expect(sheet.getByRole('status')).toContainText(
      "Thanks, we've got it"
    )
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()

    const reports = await sql<
      { reporter: string; user_id: string; reason: string }[]
    >`
      select reporter, user_id, reason from review_reports where review_id = ${P.reviews.damp}
    `
    expect(reports).toEqual([
      {
        reporter: 'customer',
        user_id: P.reporter.id,
        reason: 'This looks fake to me',
      },
    ])

    // Again: the team has it already.
    await damp.getByRole('button', { name: /^Report .+'s review$/ }).click()
    await sheet.getByLabel("What's wrong with it?").fill('Still fake')
    await sheet.getByRole('button', { name: 'Send report' }).click()
    await expect(sheet.getByRole('alert')).toHaveText(
      'You have already reported this review. The team will look at it.'
    )
  })
})

test.describe('Report signed out', () => {
  test('asks to sign in first, and brings the customer back to the garage', async ({
    page,
  }) => {
    await page.goto(`/garage/${P.garage.id}`)
    await page.getByRole('tab', { name: 'Reviews' }).click()
    const spotless = page
      .locator('#garage-tab-panel > div')
      .filter({ hasText: 'Spotless finish, seeded.' })
    await spotless.getByRole('button', { name: /^Report .+'s review$/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Report this review' })
    await expect(sheet.getByText('Sign in to report a review')).toBeVisible()
    await expect(sheet.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`/garage/${P.garage.id}`)}`
    )
    await sheet.getByRole('button', { name: 'Not now' }).click()
    await expect(sheet).toBeHidden()
  })
})
