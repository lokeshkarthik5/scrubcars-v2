/**
 * Garage documents (0043), from the garage's Settings to the customer's
 * garage page.
 *
 * VENDORS.documents' owner uploads the four required documents (a photo
 * and PDFs, one with a front and a back) into the private bucket, which
 * MinIO stands in for (R2_DOCS_BUCKET=detlio-e2e-docs, created without
 * public access, as in production). Nobody else can list or open them: not
 * its operator, not another garage, not a customer, and the bucket itself
 * refuses a file without its five-minute signature. Admin finds the garage
 * under "Documents to review", opens and approves each one, and the
 * customer's garage page then shows "Documents verified". The rules are
 * unit-tested in apps/server/src/lib/vendor-documents.test.ts, and every
 * route's who-may-see in vendor-documents.routes.test.ts.
 *
 * Its own garage, owner, operator and customer (the 2300–2399 range), read
 * by no other spec.
 */
import path from 'node:path'
import { answerCookieQuestion } from '../../support/consent'
import { fileURLToPath } from 'node:url'
import type { Browser } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi, setActiveVendor, statePath } from '../../support/auth'
import { sql } from '../../support/db'
import { USERS_ORIGIN, VENDORS_ORIGIN } from '../../support/journey'
import { blockThirdParties, dismissLocationPrompt } from '../../support/network'
import { CUSTOMERS, STAFF, VENDORS } from '../../support/seed-ids'

const ADMIN_ORIGIN = 'http://localhost:3002'
const GARAGE = VENDORS.documents
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')
const PIXEL = path.join(FIXTURES, 'pixel.png')
const PDF = path.join(FIXTURES, 'document.pdf')

const GARAGE_DOCUMENTS = `${API}/api/v1/vendors/me/documents`
const ADMIN_DOCUMENTS = `${API}/api/v1/admin/documents/vendors/${GARAGE.id}`
const PUBLIC_GARAGE = `${API}/api/v1/vendors/${GARAGE.id}`

const REQUIRED: Array<{ label: string; files: string[] }> = [
  { label: 'Shop photo', files: [PIXEL] },
  { label: 'Owner ID', files: [PDF, PIXEL] },
  { label: 'Bank proof', files: [PDF] },
  { label: 'Signed Detlio agreement', files: [PDF] },
]

type DocumentRow = { type: string; id: string | null; status: string; files: Array<{ id: string; side: string }> }

async function openGarage(browser: Browser) {
  const api = await loginViaApi(STAFF.documentsOwner.phone, 'vendor')
  const ctx = await browser.newContext({
    storageState: await api.storageState(),
    baseURL: VENDORS_ORIGIN,
    viewport: { width: 412, height: 915 },
    isMobile: true,
  })
  await answerCookieQuestion(ctx)
  await api.dispose()
  await setActiveVendor(ctx, GARAGE.id)
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

test.describe.serial('garage documents @p0', () => {
  test.beforeAll(async () => {
    // As seeded, whatever an earlier attempt left: no documents yet.
    await sql`delete from vendor_documents where vendor_id = ${GARAGE.id}`
  })

  test('the owner uploads the four required documents from Settings → Documents', async ({ browser }) => {
    const { ctx, page } = await openGarage(browser)

    await page.goto('/settings')
    await page.getByRole('link', { name: /^Documents/ }).click()
    await expect(page).toHaveURL(/\/settings\/documents$/)
    await expect(page.getByText('0 of 4 required approved')).toBeVisible()
    // An Aadhaar number must never be readable.
    await expect(page.getByText('Cover the first 8 digits of an Aadhaar number.')).toBeVisible()

    for (const { label, files } of REQUIRED) {
      const card = page.getByRole('group', { name: label, exact: true })
      await card.getByLabel(`Choose files for ${label}`).setInputFiles(files)
      await card.getByRole('button', { name: 'Send for review' }).click()
      await expect(card.getByText('Waiting for review')).toBeVisible()
    }
    // A front and a back, both kept.
    const ownerId = page.getByRole('group', { name: 'Owner ID', exact: true })
    await expect(ownerId.getByRole('button', { name: 'View Owner ID, front' })).toBeVisible()
    await expect(ownerId.getByRole('button', { name: 'View Owner ID, back' })).toBeVisible()

    // The owner may open its own file, for five minutes; the bucket refuses
    // the same file without the signature.
    const list = await ctx.request.get(GARAGE_DOCUMENTS, { headers: { 'X-Vendor-Id': GARAGE.id } })
    expect(list.status()).toBe(200)
    const { data } = (await list.json()) as { data: { documents: DocumentRow[] } }
    const bank = data.documents.find((doc) => doc.type === 'bank_proof')!
    expect(bank.status).toBe('pending')
    const link = await ctx.request.get(`${GARAGE_DOCUMENTS}/${bank.id}/files/${bank.files[0].id}/link`, {
      headers: { 'X-Vendor-Id': GARAGE.id },
    })
    expect(link.status()).toBe(200)
    expect(link.headers()['cache-control']).toBe('no-store')
    const { url } = (await link.json()).data as { url: string }
    expect(url).toContain('detlio-e2e-docs')
    expect(url).toContain('X-Amz-Expires=300')
    const signed = await ctx.request.get(url)
    expect(signed.status()).toBe(200)
    expect(signed.headers()['content-type']).toBe('application/pdf')
    const unsigned = await ctx.request.get(url.split('?')[0])
    expect(unsigned.status()).toBe(403)

    await ctx.close()
  })

  test('nobody else can list or open them', async () => {
    const owner = await loginViaApi(STAFF.documentsOwner.phone, 'vendor')
    const { data } = (await (
      await owner.get(GARAGE_DOCUMENTS, { headers: { 'X-Vendor-Id': GARAGE.id } })
    ).json()) as { data: { documents: DocumentRow[] } }
    await owner.dispose()
    const ownerId = data.documents.find((doc) => doc.type === 'owner_id')!
    const linkPath = `${GARAGE_DOCUMENTS}/${ownerId.id}/files/${ownerId.files[0].id}/link`

    // Its own operator: the owner seat only.
    const operator = await loginViaApi(STAFF.documentsOperator.phone, 'vendor')
    for (const target of [GARAGE_DOCUMENTS, linkPath]) {
      const response = await operator.get(target, { headers: { 'X-Vendor-Id': GARAGE.id } })
      expect(response.status()).toBe(403)
    }
    await operator.dispose()

    // Another garage's owner: not its file from their own garage, and no way in to this one.
    const other = await loginViaApi(STAFF.proposalsOwner.phone, 'vendor')
    const fromOwnGarage = await other.get(linkPath, { headers: { 'X-Vendor-Id': VENDORS.proposals.id } })
    expect(fromOwnGarage.status()).toBe(404)
    const asThisGarage = await other.get(linkPath, { headers: { 'X-Vendor-Id': GARAGE.id } })
    expect(asThisGarage.status()).toBe(404)
    // Nor through admin.
    expect((await other.get(ADMIN_DOCUMENTS)).status()).toBe(403)
    await other.dispose()

    // A customer has no garage at all.
    const customer = await loginViaApi(CUSTOMERS.documents.phone, 'customer')
    expect((await customer.get(GARAGE_DOCUMENTS)).status()).toBe(404)
    expect((await customer.get(linkPath)).status()).toBe(404)
    // Customers read one boolean, and it is not earned yet.
    const garage = (await (await customer.get(PUBLIC_GARAGE)).json()).data as Record<string, unknown>
    expect(garage.documentsVerified).toBe(false)
    expect(Object.keys(garage).filter((key) => /document|file/i.test(key))).toEqual(['documentsVerified'])
    await customer.dispose()
  })

  test('admin finds it under Documents to review, opens a file and approves all four', async ({ browser }) => {
    const { ctx, page } = await openAdmin(browser)

    await page.goto('/vendors?show=documents')
    await expect(page.getByRole('button', { name: /^Documents to review \d+$/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const card = page.getByRole('row', { name: GARAGE.name, exact: true })
    // The row's link reads "4 docs to review"; it is named in full.
    const review = card.getByRole('link', { name: '4 documents to review' })
    await expect(review).toBeVisible()
    await review.click()

    await expect(page).toHaveURL(new RegExp(`/vendors/${GARAGE.id}/edit\\?tab=documents`))
    const panel = page.getByRole('tabpanel', { name: 'Documents' })
    await expect(panel.getByText('0 of 4 required approved · 4 to review')).toBeVisible()

    // A file opens in a new tab on its five-minute link. The tab's request is
    // what is checked: headless Chromium has no PDF viewer, so the PDF becomes
    // a download and the tab itself stays on about:blank.
    const bank = panel.getByRole('group', { name: 'Bank proof', exact: true })
    const [tab, signed] = await Promise.all([
      ctx.waitForEvent('page'),
      ctx.waitForEvent('request', (request) => request.url().includes('X-Amz-Signature')),
      bank.getByRole('button', { name: 'Open Bank proof in a new tab' }).click(),
    ])
    expect(signed.frame().page()).toBe(tab)
    await tab.close()

    for (const { label } of REQUIRED) {
      const group = panel.getByRole('group', { name: label, exact: true })
      await group.getByRole('button', { name: 'Approve' }).click()
      await expect(group.getByText('Approved', { exact: true })).toBeVisible()
    }
    await expect(panel.getByText('Documents verified', { exact: true })).toBeVisible()

    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from vendor_documents
       where vendor_id = ${GARAGE.id} and status = 'approved' and reviewed_by = 'E2E Admin'
    `
    expect(row.n).toBe(4)
    await ctx.close()
  })

  test('the customer’s garage page shows Documents verified', async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: statePath('customer-documents'),
      baseURL: USERS_ORIGIN,
      viewport: { width: 412, height: 915 },
      isMobile: true,
    })
    await answerCookieQuestion(ctx)
    await dismissLocationPrompt(ctx)
    await blockThirdParties(ctx)
    const page = await ctx.newPage()

    await page.goto(`/garage/${GARAGE.id}`)
    await expect(page.getByRole('heading', { name: GARAGE.name })).toBeVisible()
    await expect(page.getByText('Documents verified', { exact: true })).toBeVisible()

    const garage = (await (await ctx.request.get(PUBLIC_GARAGE)).json()).data as Record<string, unknown>
    expect(garage.documentsVerified).toBe(true)
    await ctx.close()
  })
})
