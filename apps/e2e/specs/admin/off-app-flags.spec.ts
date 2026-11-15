/**
 * Off-app payment flags (0075, docs/off-app-flags.md): Detlio's own entries
 * in admin's Bypass reports. OFF_APP_FLAGS_ENABLED is on in E2E (.env.e2e).
 *
 * The page keeps New / Confirmed / Dismissed and adds a second row, All /
 * Customer reports / Flagged by Detlio (?from=). A flag shows the "Flagged
 * by Detlio" tag, "Reward: None (Detlio flag)" and an Evidence block with the
 * number masked (never the full one); Dismiss asks why, as for a report;
 * Confirm says a Detlio flag has no reward; Check now runs the checks.
 *
 * Works on OFF_APP_FLAGS (ids 7700–7749): two New flags about a garage
 * deleted forever (no strike moves for any other fixture), put back before
 * and after. The rules are unit-tested in apps/server/src/lib/off-app-flags.test.ts,
 * the routes in bypass-reports.routes.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { CUSTOMERS, OFF_APP_FLAGS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const F = OFF_APP_FLAGS

const putBack = async () => {
  await sql`update bypass_reports set status = 'new', confirmed_at = null, confirmed_by = null,
    dismissed_at = null, dismissed_by = null, dismissed_reason = null, reward_status = 'none'
    where id in (${F.note}, ${F.regulars})`
}

/** A flag's card on the list, by what happened. */
const flagCard = (page: Page, what: string) =>
  page
    .getByRole('listitem')
    .filter({ hasText: F.garageName })
    .filter({ hasText: what })

test.describe.serial('Off-app payment flags @p1', () => {
  test.beforeAll(putBack)
  test.afterAll(putBack)

  test('the second row filters to Detlio’s flags, with the tag and masked evidence', async ({ page }) => {
    await page.goto('/bypass-reports')
    await expect(page.getByRole('heading', { name: 'Bypass reports', exact: true })).toBeVisible()
    const who = page.getByRole('group', { name: 'Who raised it' })
    await expect(who.getByRole('button', { name: /^All \d+$/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('A Detlio flag has no customer, so no credit.')).toBeVisible()

    await who.getByRole('button', { name: /^Flagged by Detlio \d+$/ }).click()
    await expect(page).toHaveURL(/\/bypass-reports\?from=detlio$/)
    await expect(who.getByRole('button', { name: /^Flagged by Detlio \d+$/ })).toHaveAttribute('aria-pressed', 'true')

    const note = flagCard(page, 'Phone number or UPI ID in a note')
    await expect(note.getByText('Flagged by Detlio')).toBeVisible()
    await expect(note.getByText('None (Detlio flag)')).toBeVisible()
    const evidence = note.locator('[data-evidence]')
    await expect(evidence.getByText('Evidence')).toBeVisible()
    await expect(evidence).toContainText(F.maskedNumber)
    await expect(evidence).toContainText('Found by Detlio’s checks: a phone number and a UPI ID in a note the customer can see.')
    await expect(evidence).not.toContainText('9840014210')

    const regulars = flagCard(page, 'Regular customers went quiet')
    await expect(regulars.locator('[data-evidence]')).toContainText(
      '6 of 14 regular customers stopped booking this garage in the last 30 days. 2 of them still book other garages on Detlio.'
    )
    await expect(regulars.getByText('6 customers')).toBeVisible()

    // Customer reports only: no flag.
    await who.getByRole('button', { name: /^Customer reports \d+$/ }).click()
    await expect(page).toHaveURL(/\/bypass-reports\?from=customer$/)
    await expect(page.locator('[data-evidence]')).toHaveCount(0)
  })

  test('Dismiss asks why, and the flag moves to Dismissed', async ({ page }) => {
    await page.goto('/bypass-reports?from=detlio')
    const note = flagCard(page, 'Phone number or UPI ID in a note')
    await note.getByRole('button', { name: 'Dismiss', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Dismiss report' })
    await expect(dialog.getByText('No strike. The reason stays with the team; the garage is never told.')).toBeVisible()
    await dialog.getByLabel('Why').fill('The garage’s own landline, shared on the day')
    await dialog.getByRole('button', { name: 'Dismiss report' }).click()
    await expect(page.getByText('Report dismissed')).toBeVisible()

    await page.goto('/bypass-reports?show=dismissed&from=detlio')
    await expect(flagCard(page, 'Phone number or UPI ID in a note')).toBeVisible()
    const [row] = await sql<{ status: string; reward_status: string }[]>`
      select status, reward_status from bypass_reports where id = ${F.note}`
    expect(row).toEqual({ status: 'dismissed', reward_status: 'none' })
  })

  test('Confirm says there is no reward, and none is given', async ({ page }) => {
    await page.goto('/bypass-reports?from=detlio')
    const regulars = flagCard(page, 'Regular customers went quiet')
    await regulars.getByRole('button', { name: 'Confirm', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirm report' })
    await expect(dialog.getByText('No reward: a Detlio flag has no customer who reported it.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm report' }).click()
    await expect(page.getByText('Confirmed — a strike for the garage (a Detlio flag has no reward)')).toBeVisible()
    const [row] = await sql<{ status: string; reward_status: string; user_id: string | null }[]>`
      select status, reward_status, user_id from bypass_reports where id = ${F.regulars}`
    expect(row).toEqual({ status: 'confirmed', reward_status: 'none', user_id: null })
  })

  test('Check now runs Detlio’s checks and says what it found', async ({ page }) => {
    await page.goto('/bypass-reports?from=detlio')
    await page.getByRole('button', { name: 'Check now' }).click()
    await expect(page.getByText(/^Checked: (nothing new|\d+ new flags?)$/)).toBeVisible()
  })

  test('the API: ?from=detlio lists flags only, and a customer can never reach it', async ({ page }) => {
    const list = await page.request.get(`${API}/api/v1/admin/bypass-reports?show=new&from=detlio`)
    expect(list.ok()).toBe(true)
    const { data } = await list.json()
    expect(data.flags).toMatchObject({ enabled: true, from: 'detlio' })
    for (const report of data.reports) expect(report.source).toBe('detlio')
    expect(JSON.stringify(data)).not.toContain('9840014210')

    const customer = await loginViaApi(CUSTOMERS.notAccepted.phone)
    expect((await customer.get(`${API}/api/v1/admin/bypass-reports?from=detlio`)).status()).toBeGreaterThanOrEqual(401)
    expect((await customer.post(`${API}/api/v1/admin/bypass-reports/flags/check`)).status()).toBeGreaterThanOrEqual(401)
    await customer.dispose()
  })
})
