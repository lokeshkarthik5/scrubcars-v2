/**
 * The pickup fee in admin (0079, admin mockups 1–5): Settings → Pickup fee
 * (Detlio's formula, the limits, the convenience fee at ₹0), Issues → Pickup
 * fees (Approve, and Keep Detlio's fee with a reason), the garage editor's
 * pickup card (the change log and Lock to Detlio's fee).
 *
 * Works on PICKUP_FEE (ids 7750–7799): Kumar's ₹20 a km and AutoKraft's
 * fixed ₹250 wait for the check; Velan is on Detlio's numbers. Everything is
 * put back before and after, so the customer journey reads the same seed.
 * The rules are unit-tested in apps/server/src/lib/pickup-fee.test.ts and
 * packages/core/src/pickup-fee.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { PICKUP_FEE } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const P = PICKUP_FEE

const putBack = async () => {
  await sql`delete from pickup_fee_changes
    where vendor_id in (${P.kumar.garage.id}, ${P.autokraft.garage.id}, ${P.velan.garage.id})
      and id not in (${P.kumar.waitingChange}, ${P.autokraft.waitingChange})
      and by_kind = 'detlio'`
  await sql`update pickup_fee_changes set status = 'waiting', decided_at = null, decided_by = null, decision_reason = null
    where id in (${P.kumar.waitingChange}, ${P.autokraft.waitingChange})`
  await sql`update vendors set pickup_fee_mode = 'distance', pickup_fee_per_km = 20, pickup_fee_fixed = null,
    pickup_fee_waiting_since = now() - interval '2 hours' where id = ${P.kumar.garage.id}`
  await sql`update vendors set pickup_fee_mode = 'fixed', pickup_fee_fixed = 250, pickup_fee_per_km = null,
    pickup_fee_waiting_since = now() - interval '20 hours' where id = ${P.autokraft.garage.id}`
  await sql`update vendors set pickup_fee_locked_at = null, pickup_fee_locked_by = null where id = ${P.velan.garage.id}`
}

/** A garage's card on Issues → Pickup fees. */
const checkCard = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name })

test.describe.serial('Pickup fee in admin @p1', () => {
  test.beforeAll(putBack)
  test.afterAll(putBack)

  test('Settings links to Pickup fee: Detlio’s formula, the limits and the convenience fee at ₹0', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('link', { name: /Pickup fee/ }).click()
    await expect(page).toHaveURL(/\/settings\/pickup-fee$/)
    await expect(page.getByRole('heading', { name: 'Pickup fee', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Free up to, km' })).toHaveValue('3')
    await expect(page.getByRole('textbox', { name: 'Then per km, rupees' })).toHaveValue('15')
    await expect(page.getByRole('textbox', { name: 'Lowest charge, rupees' })).toHaveValue('99')
    await expect(page.getByRole('textbox', { name: 'Highest charge, rupees' })).toHaveValue('399')
    await expect(page.getByRole('textbox', { name: 'Road factor' })).toHaveValue('1.3')
    await expect(page.getByRole('textbox', { name: 'Fixed fee limit, rupees' })).toHaveValue('299')
    await expect(page.getByRole('textbox', { name: 'Ask for pickup, percent' })).toHaveValue('25')
    await expect(page.getByRole('textbox', { name: 'Convenience fee per booking, rupees' })).toHaveValue('0')
    const table = page.getByRole('table', { name: 'What customers pay with Detlio’s fee' })
    await expect(table.getByRole('row', { name: /10 km by road/ })).toContainText('₹110')
    await expect(table.getByRole('row', { name: /30 km by road/ })).toContainText('₹399 (top)')

    // Over the hard cap: said here, never sent.
    const fixed = page.getByRole('textbox', { name: 'Fixed fee limit, rupees' })
    await fixed.fill('350')
    await fixed.press('Enter')
    const capped = page.getByRole('alert').filter({ hasText: 'Fixed fee limit must be ₹1–₹299.' })
    await expect(capped).toBeVisible()
    await fixed.fill('299')
    await fixed.press('Enter')
    await expect(capped).toHaveCount(0)
  })

  test('Issues → Pickup fees: Approve Kumar’s ₹20 a km, keep Detlio’s fee for AutoKraft with a reason', async ({ page }) => {
    await page.goto('/pickup-fees')
    await expect(page.getByRole('heading', { name: 'Pickup fees to check' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Waiting \d+$/ })).toHaveAttribute('aria-pressed', 'true')

    const kumar = checkCard(page, P.kumar.garage.name)
    await expect(kumar).toContainText('By distance · free 3 km · ₹20/km · ₹99–₹399')
    await expect(kumar).toContainText('Free 3 km · ₹15/km · ₹99–₹399')
    await expect(kumar.getByRole('row', { name: /Garage/ })).toContainText('₹140')
    await kumar.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(checkCard(page, P.kumar.garage.name)).toHaveCount(0)

    const autokraft = checkCard(page, P.autokraft.garage.name)
    await expect(autokraft).toContainText('Fixed fee · ₹250 for any pickup')
    await autokraft.getByRole('button', { name: 'Keep Detlio’s fee' }).click()
    await expect(autokraft.getByRole('alert')).toContainText('Write the reason the garage will see.')
    await autokraft.getByRole('textbox', { name: 'Reason, sent to the garage' }).fill('Too high for short trips. Try ₹150, or By distance.')
    await autokraft.getByRole('button', { name: 'Keep Detlio’s fee' }).click()
    await expect(checkCard(page, P.autokraft.garage.name)).toHaveCount(0)

    await page.getByRole('button', { name: /^Kept Detlio’s fee \d+$/ }).click()
    await expect(page).toHaveURL(/\/pickup-fees\?show=kept$/)
    await expect(checkCard(page, P.autokraft.garage.name)).toContainText('Too high for short trips')

    const [row] = await sql<{ mode: string; waiting: Date | null }[]>`
      select pickup_fee_mode as mode, pickup_fee_waiting_since as waiting from vendors where id = ${P.autokraft.garage.id}`
    expect(row).toEqual({ mode: 'distance', waiting: null })
  })

  test('the garage editor’s pickup card: the change log and Lock to Detlio’s fee', async ({ page }) => {
    await page.goto(`/vendors/${P.velan.garage.id}/edit?tab=location`)
    const card = page.getByTestId('pickup-fee-card')
    await expect(card.getByRole('heading', { name: 'Pickup fee' })).toBeVisible()
    await expect(card.getByRole('radio', { name: 'By distance' })).toHaveAttribute('aria-checked', 'true')
    await expect(card.getByRole('listitem').filter({ hasText: 'Free → By distance (Detlio’s fee)' })).toBeVisible()

    const lock = card.getByRole('switch', { name: 'Lock to Detlio’s fee' })
    await lock.click()
    await expect(lock).toHaveAttribute('aria-checked', 'true')
    await expect(card.getByText('Set by Detlio', { exact: true })).toBeVisible()
    await expect(card.getByRole('listitem').filter({ hasText: 'Locked to Detlio’s fee' })).toBeVisible()
    await lock.click()
    await expect(lock).toHaveAttribute('aria-checked', 'false')
  })
})
