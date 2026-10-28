/**
 * Bronze / Silver / Gold (0063), from admin's switches to what customers see.
 *
 * TIERS' garages (the 4600–4699 range, far north, read by no other spec):
 * gold is Gold (and holds Silver), silver holds Silver, bronze accepted the
 * agreement only, award meets every Gold standard but Detlio's check. A
 * guest sees each one's medal on its card and page, "Silver & above"
 * narrows the list to Silver and Gold; admin hides one garage's medal and
 * shows it again, switches Gold and then Silver off (the medal steps down,
 * the filter goes) and back on, and records a check and presses Award Gold.
 * The rules are unit-tested in apps/server/src/lib/tiers.test.ts, and every
 * route's who-may-see in modules/tiers/tiers.routes.test.ts.
 *
 * The tier switches are global, so this file is a journey (one worker) and
 * turns every switch back on before it ends, whatever happened.
 */
import type { Browser, Page } from '@playwright/test'
import { answerCookieQuestion } from '../../support/consent'
import { test, expect } from '../../support/fixtures'
import { API, statePath } from '../../support/auth'
import { sql } from '../../support/db'
import { USERS_ORIGIN } from '../../support/journey'
import { blockThirdParties, dismissLocationPrompt } from '../../support/network'
import { TIERS } from '../../support/seed-ids'

const ADMIN_ORIGIN = 'http://localhost:3002'

/** A guest on a phone: medals are for everyone, signed in or not. */
async function openGuest(browser: Browser) {
  const ctx = await browser.newContext({
    baseURL: USERS_ORIGIN,
    viewport: { width: 412, height: 915 },
    isMobile: true,
  })
  await answerCookieQuestion(ctx)
  await dismissLocationPrompt(ctx)
  await blockThirdParties(ctx)
  return { ctx, page: await ctx.newPage() }
}

/** The admin panel is a desktop surface, whatever this project's device is. */
async function openAdmin(browser: Browser) {
  const ctx = await browser.newContext({
    storageState: statePath('admin'),
    baseURL: ADMIN_ORIGIN,
    viewport: { width: 1280, height: 900 },
  })
  await answerCookieQuestion(ctx)
  await blockThirdParties(ctx)
  return { ctx, page: await ctx.newPage() }
}

/** The garage page's medal ("Gold garage"), or none. */
async function expectMedal(page: Page, garageId: string, name: string | null) {
  await page.goto(`/garage/${garageId}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  for (const medal of ['Bronze garage', 'Silver garage', 'Gold garage']) {
    const seal = page.getByText(medal, { exact: true })
    if (medal === name) await expect(seal).toBeVisible()
    else await expect(seal).toHaveCount(0)
  }
}

/**
 * A garage's card in the list: its link to the garage page (the link takes no
 * name from the article inside it, so it is found by where it goes).
 */
const card = (page: Page, garage: { id: string }) => page.locator(`a[href^="/garage/${garage.id}"]`)

const switchFor = (page: Page, tier: string) =>
  page.getByRole('region', { name: 'Tiers' }).getByRole('switch', { name: `Show ${tier} medals to customers` })

test.describe.serial('tiers and medals @p0', () => {
  test.beforeAll(async () => {
    // As seeded, whatever an earlier attempt left.
    await sql`update tier_switches set shown = true`
    await sql`update vendors set tier_hidden = false where id in (${TIERS.gold.id}, ${TIERS.silver.id}, ${TIERS.bronze.id}, ${TIERS.award.id})`
    await sql`delete from vendor_certifications where vendor_id = ${TIERS.award.id}`
    await sql`delete from vendor_quality_checks where vendor_id = ${TIERS.award.id}`
    // The agreement journey (run before this file) has the fresh garage accept.
    await sql`delete from agreement_acceptances where vendor_id = ${TIERS.fresh.id}`
  })

  test.afterAll(async () => {
    // Never leave a medal switched off for the rest of the suite.
    await sql`update tier_switches set shown = true`
    await sql`update vendors set tier_hidden = false where id = ${TIERS.silver.id}`
  })

  test('a guest sees each garage’s medal, and “What this means”', async ({ browser }) => {
    const { ctx, page } = await openGuest(browser)
    await expectMedal(page, TIERS.gold.id, 'Gold garage')
    await expectMedal(page, TIERS.silver.id, 'Silver garage')
    await expectMedal(page, TIERS.bronze.id, 'Bronze garage')
    await expectMedal(page, TIERS.fresh.id, null)

    // Bronze's sheet: the one standard, and how a medal is kept.
    await page.goto(`/garage/${TIERS.bronze.id}`)
    await page.getByRole('button', { name: 'What this means' }).click()
    const sheet = page.getByRole('dialog', { name: 'Bronze garage: what this means' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('Has accepted the Detlio garage agreement.')).toBeVisible()
    await expect(sheet.getByText(/loses its medal after 14 days/)).toBeVisible()

    // Gold's lists every tier's standards, its own first.
    await page.goto(`/garage/${TIERS.gold.id}`)
    await page.getByRole('button', { name: 'What this means' }).click()
    const gold = page.getByRole('dialog', { name: 'Gold garage: what this means' })
    await expect(gold.getByRole('region', { name: 'Gold standards' })).toContainText('Visited and checked in person')
    await expect(gold.getByRole('region', { name: 'Silver standards' })).toContainText('Rated 4.2 or more')
    await expect(gold.getByRole('region', { name: 'Bronze standards' })).toBeVisible()

    // The API carries one value, never the numbers or the switches.
    const api = (await (await ctx.request.get(`${API}/api/v1/vendors/${TIERS.gold.id}`)).json())
      .data as Record<string, unknown>
    expect(api.tier).toBe('gold')
    expect(api).not.toHaveProperty('certified')
    expect(api).not.toHaveProperty('documentsVerified')
    expect(api).not.toHaveProperty('tierHidden')
    await ctx.close()
  })

  test('“Silver & above” narrows the list to Silver and Gold, each card with its medal', async ({ browser }) => {
    const { ctx, page } = await openGuest(browser)
    await page.goto('/garages')
    const chip = page.getByRole('button', { name: 'Silver & above' })
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')

    await expect(card(page, TIERS.gold).getByRole('img', { name: 'Gold garage' })).toBeVisible()
    await expect(card(page, TIERS.silver).getByRole('img', { name: 'Silver garage' })).toBeVisible()
    await expect(card(page, TIERS.bronze)).toHaveCount(0)
    await expect(card(page, TIERS.fresh)).toHaveCount(0)

    // Off again: the list is every garage once more.
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await ctx.close()
  })

  test('admin hides the Silver garage’s medal, then shows it again', async ({ browser }) => {
    const admin = await openAdmin(browser)
    await admin.page.goto(`/vendors/${TIERS.silver.id}/edit?tab=certification`)
    const panel = admin.page.getByRole('tabpanel', { name: 'Tier' })
    await expect(panel.getByText('Customers see the Silver medal.')).toBeVisible()
    const hide = panel.getByRole('switch', { name: "Hide this garage's medal" })
    await expect(hide).toHaveAttribute('aria-checked', 'false')
    await hide.click()
    await expect(hide).toHaveAttribute('aria-checked', 'true')
    await expect(panel.getByText('Customers see no medal: you hid it.')).toBeVisible()
    // The garage still holds Silver.
    await expect(panel.getByText("You're Silver.", { exact: false })).toBeVisible()

    const guest = await openGuest(browser)
    await expectMedal(guest.page, TIERS.silver.id, null)
    await guest.page.goto('/garages')
    await guest.page.getByRole('button', { name: 'Silver & above' }).click()
    await expect(card(guest.page, TIERS.gold)).toBeVisible()
    await expect(card(guest.page, TIERS.silver)).toHaveCount(0)

    await hide.click()
    await expect(hide).toHaveAttribute('aria-checked', 'false')
    await expect(panel.getByText('Customers see the Silver medal.')).toBeVisible()
    await expectMedal(guest.page, TIERS.silver.id, 'Silver garage')

    const audit = await sql<{ action: string; actor_name: string }[]>`
      select action, actor_name from admin_audit_log
       where action in ('garage_medal_hidden', 'garage_medal_shown')
         and summary->>'vendorId' = ${TIERS.silver.id}
       order by created_at desc limit 2
    `
    expect(audit.map((row) => row.action)).toEqual(['garage_medal_shown', 'garage_medal_hidden'])
    expect(audit[0]!.actor_name).toBe('E2E Admin')
    await guest.ctx.close()
    await admin.ctx.close()
  })

  test('switching Gold, then Silver, off steps the medal down and takes the filter away', async ({ browser }) => {
    const admin = await openAdmin(browser)
    const guest = await openGuest(browser)
    try {
      await admin.page.goto('/settings')
      const gold = switchFor(admin.page, 'Gold')
      await expect(gold).toHaveAttribute('aria-checked', 'true')
      await gold.click()
      await expect(gold).toHaveAttribute('aria-checked', 'false')

      // A Gold garage shows the highest tier still shown: Silver.
      await expectMedal(guest.page, TIERS.gold.id, 'Silver garage')

      const silver = switchFor(admin.page, 'Silver')
      await silver.click()
      await expect(silver).toHaveAttribute('aria-checked', 'false')
      await expect(
        admin.page.getByRole('region', { name: 'Tiers' }).getByText(/so it is hidden now/)
      ).toBeVisible()

      // Now Bronze, and no "Silver & above" at all once the app has asked.
      await expectMedal(guest.page, TIERS.gold.id, 'Bronze garage')
      const config = guest.page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/tiers')
      await guest.page.goto('/garages')
      expect((await (await config).json()).data).toMatchObject({ silverFilter: false })
      await expect(guest.page.getByRole('button', { name: 'All', exact: true })).toBeVisible()
      await expect(guest.page.getByRole('button', { name: 'Silver & above' })).toHaveCount(0)

      // Back on, both: Gold again.
      await silver.click()
      await expect(silver).toHaveAttribute('aria-checked', 'true')
      await gold.click()
      await expect(gold).toHaveAttribute('aria-checked', 'true')
      await expectMedal(guest.page, TIERS.gold.id, 'Gold garage')
    } finally {
      await sql`update tier_switches set shown = true`
      await guest.ctx.close()
      await admin.ctx.close()
    }
  })

  test('admin records a passing check and presses Award Gold', async ({ browser }) => {
    const admin = await openAdmin(browser)
    await admin.page.goto(`/vendors/${TIERS.award.id}/edit?tab=certification`)
    const panel = admin.page.getByRole('tabpanel', { name: 'Tier' })
    await expect(panel.getByText('Meets every Gold standard. Arrange a quality check next.')).toBeVisible()
    const award = panel.getByRole('button', { name: 'Award Gold' })
    await expect(award).toBeDisabled()

    await panel.getByRole('button', { name: 'Record a check' }).click()
    await panel.getByLabel('Checked by').fill('Kavya')
    await panel.getByRole('button', { name: 'Record check' }).click()
    await expect(panel.getByText('Meets every Gold standard and passed its check: ready for Award Gold.')).toBeVisible()

    await expect(award).toBeEnabled()
    await award.click()
    await expect(panel.getByText(/^Gold since/)).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Revoke…' })).toBeVisible()

    const [row] = await sql<{ certified_by: string }[]>`
      select certified_by from vendor_certifications
       where vendor_id = ${TIERS.award.id} and certified_at is not null and revoked_at is null
    `
    expect(row?.certified_by).toBe('E2E Admin')
    await admin.ctx.close()

    // Customers see Gold on it at once.
    const guest = await openGuest(browser)
    await expectMedal(guest.page, TIERS.award.id, 'Gold garage')
    await guest.ctx.close()
  })
})
