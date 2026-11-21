/**
 * The pickup fee in admin (0079, admin mockups 1–5): Settings → Pickup fee
 * (Detlio's formula, the limits, the convenience fee at ₹0), Issues → Pickup
 * fees (Approve, and Keep Detlio's fee with a reason), the garage editor's
 * pickup card (the fee that applies now, "Who sets this garage's fee",
 * Detlio's own fee past the garage limits with no check, this garage's own
 * limits and Reset, and the change log).
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
  await sql`update vendors set pickup_fee_locked_at = null, pickup_fee_locked_by = null, pickup_fee_mode = 'distance',
    pickup_fee_fixed = null, pickup_fee_free_km = null, pickup_fee_per_km = null, pickup_fee_min = null, pickup_fee_max = null,
    pickup_fee_source = 'garage', pickup_fee_waiting_since = null,
    pickup_fee_limit_per_km_min = null, pickup_fee_limit_per_km_max = null, pickup_fee_limit_fixed_max = null,
    pickup_fee_needs_approval = null
    where id = ${P.velan.garage.id}`
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

  test('the garage editor’s pickup card: the fee now, who sets it, Detlio’s own fee and the log', async ({ page }) => {
    await page.goto(`/vendors/${P.velan.garage.id}/edit?tab=location`)
    const card = page.getByTestId('pickup-fee-card')
    await expect(card.getByRole('heading', { name: 'Pickup fee' })).toBeVisible()
    const now = card.getByTestId('pickup-fee-now')
    await expect(now).toContainText('By distance · free 3 km · ₹15/km · ₹99–₹399')
    await expect(now).toContainText(`Set by ${P.velan.garage.name} (owner)`)
    await expect(card.getByRole('radio', { name: 'By distance' })).toHaveAttribute('aria-checked', 'true')
    await expect(card.getByRole('listitem').filter({ hasText: 'Free → By distance (Detlio’s fee)' })).toBeVisible()

    // Who sets this garage's fee: Detlio. The garage's controls grey out.
    const who = card.getByRole('radiogroup', { name: 'Who sets this garage’s fee' })
    await expect(who.getByRole('radio', { name: 'Garage' })).toHaveAttribute('aria-checked', 'true')
    await who.getByRole('radio', { name: 'Detlio' }).click()
    await expect(who.getByRole('radio', { name: 'Detlio' })).toHaveAttribute('aria-checked', 'true')
    await expect(card.getByText('Set by Detlio', { exact: true })).toBeVisible()
    await expect(now).toContainText('Locked: the garage can’t change it')
    await expect(card.getByRole('listitem').filter({ hasText: 'Set by Detlio: the garage can’t change its fee' })).toBeVisible()

    // Detlio's own fee: a fixed ₹280, above Detlio's suggestion, live at once with no check.
    await card.getByRole('radio', { name: 'Fixed fee' }).click()
    const fixed = card.getByRole('textbox', { name: 'Fee for any pickup' })
    await fixed.fill('280')
    await fixed.press('Enter')
    await expect(now).toContainText('Fixed fee · ₹280 for any pickup')
    await expect(card.getByText('Waiting for check', { exact: true })).toHaveCount(0)
    const [row] = await sql<{ mode: string; fixed: string; waiting: Date | null; source: string; changed: boolean }[]>`
      select pickup_fee_mode as mode, pickup_fee_fixed::text as fixed, pickup_fee_waiting_since as waiting,
             pickup_fee_source as source, pickup_fee_changed_at < now() - interval '9 days' as changed
        from vendors where id = ${P.velan.garage.id}`
    // The garage's own last change (10 days ago) is untouched.
    expect(row).toEqual({ mode: 'fixed', fixed: '280.00', waiting: null, source: 'detlio', changed: true })

    // Over the hard cap: said here, never sent.
    await fixed.fill('300')
    await fixed.press('Enter')
    await expect(card.getByRole('alert').filter({ hasText: 'outside the hard caps' })).toBeVisible()

    await who.getByRole('radio', { name: 'Garage' }).click()
    await expect(who.getByRole('radio', { name: 'Garage' })).toHaveAttribute('aria-checked', 'true')
    await expect(card.getByRole('listitem').filter({ hasText: 'Set by the garage: it can change its fee again' })).toBeVisible()
  })

  test('this garage’s own limits: saved, then Reset to Detlio’s defaults', async ({ page }) => {
    await page.goto(`/vendors/${P.velan.garage.id}/edit?tab=location`)
    const limits = page.getByTestId('pickup-fee-limits')
    await expect(limits.getByRole('heading', { name: 'This garage’s limits' })).toBeVisible()
    await expect(limits.getByRole('textbox', { name: 'Per km, lowest rupees' })).toHaveAttribute('placeholder', 'Detlio’s default')
    await expect(limits.getByText('Default ₹5–₹30')).toBeVisible()

    // One end only: said here.
    await limits.getByRole('textbox', { name: 'Per km, lowest rupees' }).fill('5')
    await limits.getByRole('button', { name: 'Save limits' }).click()
    await expect(limits.getByRole('alert')).toContainText('type both ends')

    await limits.getByRole('textbox', { name: 'Per km, highest rupees' }).fill('12')
    await limits.getByRole('textbox', { name: 'Fixed fee limit for this garage, rupees' }).fill('150')
    await limits.getByRole('radio', { name: 'Live at once' }).click()
    await limits.getByRole('button', { name: 'Save limits' }).click()
    const card = page.getByTestId('pickup-fee-card')
    await expect(
      card.getByRole('listitem').filter({ hasText: 'Limits: per km ₹5–₹12, fixed up to ₹150, no approval needed' })
    ).toBeVisible()
    await expect(limits.getByText('Own limits', { exact: true })).toBeVisible()
    const [saved] = await sql<{ min: string; max: string; fixed: string; approval: boolean | null }[]>`
      select pickup_fee_limit_per_km_min::text as min, pickup_fee_limit_per_km_max::text as max,
             pickup_fee_limit_fixed_max::text as fixed, pickup_fee_needs_approval as approval
        from vendors where id = ${P.velan.garage.id}`
    expect(saved).toEqual({ min: '5.00', max: '12.00', fixed: '150.00', approval: false })

    await limits.getByRole('button', { name: 'Reset to Detlio’s defaults' }).click()
    await expect(card.getByRole('listitem').filter({ hasText: 'Limits: back to Detlio’s defaults' })).toBeVisible()
    await expect(limits.getByRole('textbox', { name: 'Per km, lowest rupees' })).toHaveValue('')
    const [reset] = await sql<{ min: string | null; fixed: string | null; approval: boolean | null }[]>`
      select pickup_fee_limit_per_km_min::text as min, pickup_fee_limit_fixed_max::text as fixed,
             pickup_fee_needs_approval as approval
        from vendors where id = ${P.velan.garage.id}`
    expect(reset).toEqual({ min: null, fixed: null, approval: null })
  })
})
