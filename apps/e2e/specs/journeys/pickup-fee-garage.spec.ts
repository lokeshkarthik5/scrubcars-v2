/**
 * The pickup fee in the garage portal (0079): Settings → Hours → Pickup &
 * drop → Pickup fee, at PICKUP_FEE's garages (ids 7750–7799).
 *
 *  1. `settings` (Free, as today) picks By distance: the boxes start on
 *     Detlio's numbers with the limits under each; ₹31 a km is refused in
 *     the box; ₹20 a km saves, waits for Detlio ("Above Detlio's
 *     suggestion", Detlio vs Yours) and the next change is 7 days out. The
 *     row says waiting; customers keep Detlio's fee.
 *  2. `locked`: "Set by Detlio", Detlio's table, nothing to save; the API
 *     refuses a change (409 PICKUP_FEE_LOCKED).
 *
 * The first test changes `settings`' fee once: the 7-day rule means a rerun
 * against the same database starts from a fresh seed.
 */
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi, setActiveVendor } from '../../support/auth'
import { answerCookieQuestion } from '../../support/consent'
import { sql } from '../../support/db'
import { VENDORS_ORIGIN } from '../../support/journey'
import { blockThirdParties } from '../../support/network'
import { PICKUP_FEE } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

const P = PICKUP_FEE

/** The garage portal signed in as this owner, on this garage. */
async function openGarage(browser: Browser, phone: string, vendorId: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const api = await loginViaApi(phone, 'vendor')
  const storageState = await api.storageState()
  await api.dispose()
  const ctx = await browser.newContext({ storageState, baseURL: VENDORS_ORIGIN })
  await answerCookieQuestion(ctx)
  await blockThirdParties(ctx)
  await setActiveVendor(ctx, vendorId)
  return { ctx, page: await ctx.newPage() }
}

async function openPickupFee(page: Page) {
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Hours' }).click()
  const part = page.getByRole('group', { name: 'Pickup fee' })
  await expect(part).toBeVisible()
  return part
}

test.describe('the garage’s pickup fee @p1', () => {
  test('By distance on Detlio’s numbers; ₹20 a km waits for Detlio, then the 7 days', async ({ browser }) => {
    const { ctx, page } = await openGarage(browser, P.settings.owner.phone, P.settings.garage.id)
    const part = await openPickupFee(page)
    const modes = part.getByRole('radiogroup', { name: 'Pickup fee' })

    // Free, as today.
    await expect(modes.getByRole('radio', { name: 'Free' })).toHaveAttribute('aria-checked', 'true')
    await expect(part.getByText('Customers see Free pickup. This is how it works today.')).toBeVisible()

    // By distance starts on Detlio's numbers, the limits under each box.
    await modes.getByRole('radio', { name: 'By distance' }).click()
    await expect(part.getByLabel('Free up to (km)')).toHaveValue('3')
    await expect(part.getByLabel('Then per km (₹)')).toHaveValue('15')
    await expect(part.getByLabel('Lowest charge (₹)')).toHaveValue('99')
    await expect(part.getByLabel('Highest charge (₹)')).toHaveValue('399')
    await expect(part.getByText('0–5 km')).toBeVisible()
    await expect(part.getByText('₹5–₹30')).toBeVisible()
    await expect(part.getByText('₹49–₹149')).toBeVisible()
    await expect(part.getByText('Up to ₹599')).toBeVisible()
    await expect(part.getByText('These are Detlio’s numbers.')).toBeVisible()
    // The approved preview: 2 km Free · 5 km ₹99 · 10 km ₹110 · … · 30 km ₹399 (top).
    const table = part.locator('[data-fee-table]')
    await expect(table.getByRole('row', { name: /10 km by road/ })).toContainText('₹110')
    await expect(table.getByRole('row', { name: /30 km by road/ })).toContainText('₹399 (top)')

    // Over the limit: refused in the box, nothing to save.
    await part.getByLabel('Then per km (₹)').fill('31')
    await expect(part.getByRole('alert').filter({ hasText: '₹5–₹30' })).toBeVisible()
    await expect(part.getByRole('button', { name: 'Save pickup fee' })).toBeDisabled()

    // ₹20 a km: above Detlio's ₹15, so it waits for Detlio.
    await part.getByLabel('Then per km (₹)').fill('20')
    await expect(part.getByText('Above Detlio’s suggestion')).toBeVisible()
    await expect(table.getByRole('row', { name: /10 km by road/ })).toContainText('₹110')
    await expect(table.getByRole('row', { name: /10 km by road/ })).toContainText('₹140')
    await part.getByRole('button', { name: 'Save pickup fee' }).click()
    await expect(page.getByText('Saved successfully')).toBeVisible()
    await expect(part.getByText(/^Sent to Detlio .+ Your next change: from \d{1,2} [A-Z][a-z]{2}\.$/)).toBeVisible()
    await expect(part.getByText('Above Detlio’s suggestion')).toBeVisible()

    const [row] = await sql<{ mode: string; per_km: string | null; waiting: boolean }[]>`
      select pickup_fee_mode as mode, pickup_fee_per_km::text as per_km,
             pickup_fee_waiting_since is not null as waiting
        from vendors where id = ${P.settings.garage.id}
    `
    expect(row).toEqual({ mode: 'distance', per_km: '20.00', waiting: true })
    const [change] = await sql<{ status: string; by_kind: string }[]>`
      select status, by_kind from pickup_fee_changes where vendor_id = ${P.settings.garage.id} order by created_at desc limit 1
    `
    expect(change).toEqual({ status: 'waiting', by_kind: 'garage' })

    // A second change inside the 7 days: Save stays off; the API says why.
    await part.getByLabel('Then per km (₹)').fill('10')
    await expect(part.getByRole('button', { name: 'Save pickup fee' })).toBeDisabled()
    const api = await loginViaApi(P.settings.owner.phone, 'vendor')
    const again = await api.put(`${API}/api/v1/vendors/me/pickup-fee`, {
      headers: { 'X-Vendor-Id': P.settings.garage.id },
      data: { mode: 'distance', perKm: 10 },
    })
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('PICKUP_FEE_TOO_SOON')
    await api.dispose()
    await ctx.close()
  })

  test('locked to Detlio’s fee: "Set by Detlio", nothing to change', async ({ browser }) => {
    const { ctx, page } = await openGarage(browser, P.locked.owner.phone, P.locked.garage.id)
    const part = await openPickupFee(page)
    await expect(part.getByText('Set by Detlio')).toBeVisible()
    await expect(
      part.getByText('Detlio’s fee: free up to 3 km, then ₹15 a km, ₹99–₹399. To change it, call Detlio support.')
    ).toBeVisible()
    for (const name of ['Free', 'Fixed fee', 'By distance']) {
      await expect(part.getByRole('radiogroup', { name: 'Pickup fee' }).getByRole('radio', { name })).toBeDisabled()
    }
    await expect(part.getByRole('button', { name: 'Save pickup fee' })).toHaveCount(0)
    await expect(part.locator('[data-fee-table]').getByRole('row', { name: /15 km by road/ })).toContainText('₹180')
    await expect(part.getByText('You keep the whole fee. Detlio takes no commission on it.')).toBeVisible()

    const api = await loginViaApi(P.locked.owner.phone, 'vendor')
    const refused = await api.put(`${API}/api/v1/vendors/me/pickup-fee`, {
      headers: { 'X-Vendor-Id': P.locked.garage.id },
      data: { mode: 'free' },
    })
    expect(refused.status()).toBe(409)
    expect((await refused.json()).code).toBe('PICKUP_FEE_LOCKED')
    await api.dispose()
    await ctx.close()
  })
})
