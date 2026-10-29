/**
 * The Detlio garage agreement, click to agree (0063), from admin's upload to
 * the garage owner's tick.
 *
 * Admin publishes the next version from Settings → Garage agreement (a real
 * PDF, uploaded straight to the public bucket, which MinIO stands in for).
 * TIERS.fresh's owner, who has accepted nothing, sees Home's banner and the
 * "Your tier" card's step, opens the agreement, reads the PDF, ticks "I agree
 * to the terms" and confirms: the garage is Bronze, and the acceptance is
 * recorded with who and which version. TIERS.bronze's owner, Bronze already,
 * follows "Your tier" to Documents (the next step to Silver). The rules are
 * unit-tested in apps/server/src/lib/agreements.test.ts, and every route's
 * who-may-see in modules/agreements/agreements.routes.test.ts.
 *
 * A published version is global: a garage that accepted an earlier one keeps
 * Bronze for 30 days, so no other spec's medal changes. Every assertion here
 * reads the version number rather than assuming it, so a retry that publishes
 * once more still holds.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser } from '@playwright/test'
import { answerCookieQuestion } from '../../support/consent'
import { test, expect } from '../../support/fixtures'
import { loginViaApi, setActiveVendor, statePath } from '../../support/auth'
import { sql } from '../../support/db'
import { VENDORS_ORIGIN } from '../../support/journey'
import { blockThirdParties } from '../../support/network'
import { TIERS } from '../../support/seed-ids'

const ADMIN_ORIGIN = 'http://localhost:3002'
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')
const PDF = path.join(FIXTURES, 'document.pdf')
const PIXEL = path.join(FIXTURES, 'pixel.png')

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

async function openGarage(browser: Browser, owner: { phone: string }, garageId: string) {
  const api = await loginViaApi(owner.phone, 'vendor')
  const ctx = await browser.newContext({
    storageState: await api.storageState(),
    baseURL: VENDORS_ORIGIN,
    viewport: { width: 412, height: 915 },
    isMobile: true,
  })
  await answerCookieQuestion(ctx)
  await api.dispose()
  await setActiveVendor(ctx, garageId)
  await blockThirdParties(ctx)
  return { ctx, page: await ctx.newPage() }
}

let published = 0

test.describe.serial('garage agreement @p0', () => {
  test.beforeAll(async () => {
    // As seeded, whatever an earlier attempt left: the fresh garage has accepted nothing.
    await sql`delete from agreement_acceptances where vendor_id = ${TIERS.fresh.id}`
  })

  test.afterAll(async () => {
    // Back as seeded for any later spec: the fresh garage has accepted nothing.
    await sql`delete from agreement_acceptances where vendor_id = ${TIERS.fresh.id}`
  })

  test('admin publishes the next version as a PDF', async ({ browser }) => {
    const { ctx, page } = await openAdmin(browser)
    await page.goto('/settings')
    await page.getByRole('link', { name: /^Garage agreement/ }).click()
    await expect(page).toHaveURL(/\/settings\/agreement$/)

    const form = page.getByRole('region', { name: 'Publish a new version' })
    const publish = form.getByRole('button', { name: /^Publish v\d+$/ })
    published = Number((await publish.textContent())!.replace(/\D/g, ''))
    expect(published).toBeGreaterThanOrEqual(2)
    await expect(publish).toBeDisabled()

    // Only a PDF: a photo is refused before anything is sent.
    await form.getByLabel('Choose the agreement PDF').setInputFiles(PIXEL)
    await expect(form.getByRole('alert')).toHaveText('Pick a PDF.')
    await expect(publish).toBeDisabled()

    await form.getByLabel('Choose the agreement PDF').setInputFiles(PDF)
    await expect(form.getByText('document.pdf')).toBeVisible()
    await form.getByLabel(/^What changed/).fill('E2E: pickup clause added')
    await publish.click()

    const versions = page.getByRole('region', { name: 'Versions' })
    await expect(versions.getByText(`Detlio garage agreement v${published}`)).toBeVisible()
    await expect(versions.getByText('E2E: pickup clause added')).toBeVisible()

    const [row] = await sql<{ file_key: string; published_by: string; size_bytes: number }[]>`
      select file_key, published_by, size_bytes from agreement_versions where version = ${published}
    `
    expect(row?.published_by).toBe('E2E Admin')
    expect(row?.file_key).toMatch(new RegExp(`^agreements/v${published}-`))
    await ctx.close()
  })

  test('the fresh garage’s owner sees the banner and its tier step, and accepts', async ({ browser }) => {
    const { ctx, page } = await openGarage(browser, TIERS.owners.fresh, TIERS.fresh.id)
    await page.goto('/home')

    // Home: the banner, and "Your tier" with the agreement as the one step to Bronze.
    await expect(page.getByRole('link', { name: /Accept the Detlio garage agreement/ })).toBeVisible()
    const tier = page.getByRole('region', { name: 'Your tier' })
    await expect(tier.getByRole('heading', { name: 'No tier yet' })).toBeVisible()
    await expect(tier.getByText(/Next: Bronze, 0 of 1 done/)).toBeVisible()
    await tier.getByRole('link', { name: 'Read and accept' }).click()
    await expect(page).toHaveURL(/\/agreement$/)

    await expect(page.getByRole('heading', { name: `Detlio garage agreement v${published}` })).toBeVisible()
    await expect(page.getByText('E2E: pickup clause added')).toBeVisible()

    // Read (PDF): the uploaded file, served from the public bucket.
    const read = page.getByRole('link', { name: 'Read (PDF)' })
    const href = await read.getAttribute('href')
    expect(href).toContain(`/agreements/v${published}-`)
    expect(await read.getAttribute('target')).toBe('_blank')
    const pdf = await ctx.request.get(href!)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')

    // Confirm waits for the tick.
    const confirm = page.getByRole('button', { name: 'Confirm' })
    await expect(confirm).toBeDisabled()
    await page.getByRole('checkbox', { name: /I agree to the terms/ }).check()
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page.getByText(`You accepted v${published}`)).toBeVisible()

    const [row] = await sql<{ version: number; accepted_by_name: string; user_id: string }[]>`
      select version, accepted_by_name, user_id from agreement_acceptances where vendor_id = ${TIERS.fresh.id}
    `
    expect(row).toMatchObject({ version: published, accepted_by_name: TIERS.owners.fresh.name, user_id: TIERS.owners.fresh.id })

    // Back Home: no banner, and the garage is Bronze.
    await page.getByRole('link', { name: 'Go back' }).click()
    await page.goto('/home')
    await expect(tier.getByRole('heading', { name: "You're Bronze" })).toBeVisible()
    await expect(page.getByRole('link', { name: /Accept the Detlio garage agreement/ })).toHaveCount(0)
    await ctx.close()
  })

  test('a Bronze garage’s owner sees the new version asked for, and follows “Your tier” to Documents', async ({ browser }) => {
    const { ctx, page } = await openGarage(browser, TIERS.owners.bronze, TIERS.bronze.id)
    await page.goto('/home')

    // It accepted v1: it keeps Bronze for 30 days and is asked to accept the new one.
    await expect(page.getByRole('link', { name: /Accept the Detlio garage agreement/ })).toContainText(
      new RegExp(`updated the garage agreement \\(v${published}\\)`)
    )
    const tier = page.getByRole('region', { name: 'Your tier' })
    await expect(tier.getByRole('heading', { name: "You're Bronze" })).toBeVisible()
    await expect(tier.getByText(/Next: Silver/)).toBeVisible()
    const documents = tier.getByRole('listitem').filter({ hasText: 'Documents checked by Detlio' })
    await expect(documents.getByLabel('To do')).toBeVisible()
    await documents.getByRole('link', { name: 'Upload documents' }).click()
    await expect(page).toHaveURL(/\/settings\/documents$/)
    await ctx.close()
  })
})
