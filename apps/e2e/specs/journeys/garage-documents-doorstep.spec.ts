/**
 * Garage documents (0043) for a doorstep-only garage: it has no shop, so its
 * shop photo is optional (owner decision, 1 Nov 2026: "Documents for doorstep
 * they cant provide a front store photo so that cant be mandatory").
 *
 * VENDORS.documentsDoorstep has doorstep on and at-garage off. Its owner sees
 * two required documents (ID and bank proof) and the shop photo as Optional,
 * and Documents checked needs only the two: admin approves them and the
 * garage's documents count as checked, one of Silver's steps, with no shop
 * photo uploaded at all. A shop photo sent anyway can still be reviewed,
 * rejected without changing that, and removed. Turning at-garage on makes the
 * photo required again (the documents drop back to "not checked"); turning it
 * off restores it. The rules are unit-tested in
 * apps/server/src/lib/vendor-documents.test.ts; the garage with a shop keeps
 * all three in garage-documents-journey.spec.ts.
 *
 * Its own garage and owner (the 2300–2399 range), read by no other spec.
 */
import path from 'node:path'
import { answerCookieQuestion } from '../../support/consent'
import { fileURLToPath } from 'node:url'
import type { Browser } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi, setActiveVendor, statePath } from '../../support/auth'
import { sql } from '../../support/db'
import { VENDORS_ORIGIN } from '../../support/journey'
import { blockThirdParties } from '../../support/network'
import { STAFF, VENDORS } from '../../support/seed-ids'

const ADMIN_ORIGIN = 'http://localhost:3002'
const GARAGE = VENDORS.documentsDoorstep
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')
const PIXEL = path.join(FIXTURES, 'pixel.png')
const PDF = path.join(FIXTURES, 'document.pdf')

const GARAGE_DOCUMENTS = `${API}/api/v1/vendors/me/documents`

async function openGarage(browser: Browser) {
  const api = await loginViaApi(STAFF.documentsDoorstepOwner.phone, 'vendor')
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

test.describe.serial('garage documents, doorstep-only garage @p0', () => {
  test.beforeAll(async () => {
    // As seeded, whatever an earlier attempt left: doorstep only, no documents.
    await sql`delete from vendor_documents where vendor_id = ${GARAGE.id}`
    await sql`update vendors set doorstep_enabled = true, dropin_enabled = false where id = ${GARAGE.id}`
  })

  test('the owner is asked for ID and bank proof; the shop photo is optional', async ({ browser }) => {
    const { ctx, page } = await openGarage(browser)

    await page.goto('/settings')
    // No shop photo in the Settings line either.
    const link = page.getByRole('link', { name: /^Documents/ })
    await expect(link).toContainText('Your ID and bank proof, one of the steps to Silver')
    await expect(link).not.toContainText('shop photo')
    await link.click()
    await expect(page).toHaveURL(/\/settings\/documents$/)

    await expect(page.getByText('0 of 2 required approved')).toBeVisible()
    const shop = page.getByRole('group', { name: 'Shop photo', exact: true })
    await expect(shop.getByText('Optional', { exact: true })).toBeVisible()
    await expect(shop.getByText(/You work at customers’ doorsteps/)).toBeVisible()
    for (const label of ['Owner ID', 'Bank proof']) {
      await expect(page.getByRole('group', { name: label, exact: true }).getByText('Required', { exact: true })).toBeVisible()
    }

    // ID and bank proof only: the shop photo is never uploaded.
    for (const { label, files } of [
      { label: 'Owner ID', files: [PDF, PIXEL] },
      { label: 'Bank proof', files: [PDF] },
    ]) {
      const card = page.getByRole('group', { name: label, exact: true })
      await card.getByLabel(`Choose files for ${label}`).setInputFiles(files)
      await card.getByRole('button', { name: 'Send for review' }).click()
      await expect(card.getByText('Waiting for review')).toBeVisible()
    }
    await expect(shop.getByText('Not uploaded')).toBeVisible()

    // The API says the same, for the apps to read.
    const list = await ctx.request.get(GARAGE_DOCUMENTS, { headers: { 'X-Vendor-Id': GARAGE.id } })
    const { data } = (await list.json()) as {
      data: { summary: { required: number; missingRequired: number }; documents: Array<{ type: string; required: boolean }> }
    }
    expect(data.summary).toMatchObject({ required: 2, missingRequired: 0 })
    expect(data.documents.filter((doc) => doc.required).map((doc) => doc.type)).toEqual(['owner_id', 'bank_proof'])
    await ctx.close()
  })

  test('admin approves ID and bank proof: documents are checked, with no shop photo', async ({ browser }) => {
    const { ctx, page } = await openAdmin(browser)

    await page.goto(`/vendors/${GARAGE.id}/edit?tab=documents`)
    const panel = page.getByRole('tabpanel', { name: 'Documents' })
    await expect(panel.getByText('0 of 2 required approved · 2 to review')).toBeVisible()
    await expect(panel.getByText(/^Optional · /)).toHaveCount(3)
    await expect(
      panel.getByRole('group', { name: 'Shop photo', exact: true }).getByText('Not uploaded')
    ).toBeVisible()

    for (const label of ['Owner ID', 'Bank proof']) {
      const group = panel.getByRole('group', { name: label, exact: true })
      await group.getByRole('button', { name: 'Approve' }).click()
      await expect(group.getByText('Approved', { exact: true })).toBeVisible()
    }
    await expect(panel.getByText('Documents checked', { exact: true })).toBeVisible()
    await expect(panel.getByText('2 of 2 required approved')).toBeVisible()

    // Silver's documents step is met and does not ask for a shop photo.
    await page.goto(`/vendors/${GARAGE.id}/edit?tab=certification`)
    const tier = page.getByRole('tabpanel', { name: 'Tier' })
    const documents = tier
      .getByRole('region', { name: 'Silver steps' })
      .getByRole('listitem')
      .filter({ hasText: 'Documents checked by Detlio' })
    await expect(documents.getByLabel('Met')).toBeVisible()
    await expect(documents).toContainText('ID and bank proof approved')
    await expect(documents).not.toContainText('Shop photo')
    await ctx.close()
  })

  test('a shop photo sent anyway can be rejected without losing that, and is removed like any optional one', async ({
    browser,
  }) => {
    const garage = await openGarage(browser)
    await garage.page.goto('/settings/documents')
    const shop = garage.page.getByRole('group', { name: 'Shop photo', exact: true })
    await shop.getByLabel('Choose files for Shop photo').setInputFiles([PIXEL])
    await shop.getByRole('button', { name: 'Send for review' }).click()
    await expect(shop.getByText('Waiting for review')).toBeVisible()
    await garage.ctx.close()

    const admin = await openAdmin(browser)
    await admin.page.goto(`/vendors/${GARAGE.id}/edit?tab=documents`)
    const panel = admin.page.getByRole('tabpanel', { name: 'Documents' })
    const photo = panel.getByRole('group', { name: 'Shop photo', exact: true })
    await photo.getByRole('button', { name: 'Reject' }).click()
    await photo.getByLabel('What should the garage fix? (they read this)').fill('The name board is not readable.')
    await photo.getByRole('button', { name: 'Reject shop photo' }).click()
    await expect(photo.getByText('Rejected', { exact: true }).first()).toBeVisible()
    // Still checked: a rejected optional photo takes nothing away.
    await expect(panel.getByText('Documents checked', { exact: true })).toBeVisible()
    await expect(panel.getByText('2 of 2 required approved')).toBeVisible()

    // Detlio removes it with no Silver warning (it is not one of the steps)…
    await photo.getByRole('button', { name: 'Remove Shop photo' }).click()
    const ask = admin.page.getByRole('group', { name: 'Remove Shop photo?' })
    await expect(ask).not.toContainText('Silver')
    await ask.getByRole('button', { name: 'Remove Shop photo' }).click()
    await expect(photo.getByText('Not uploaded')).toBeVisible()
    await expect(panel.getByText('Documents checked', { exact: true })).toBeVisible()

    // …while an approved ID still carries the warning.
    const ownerId = panel.getByRole('group', { name: 'Owner ID', exact: true })
    await ownerId.getByRole('button', { name: 'Remove Owner ID' }).click()
    await expect(admin.page.getByRole('group', { name: 'Remove Owner ID?' })).toContainText('Silver')
    await admin.page.getByRole('group', { name: 'Remove Owner ID?' }).getByRole('button', { name: 'Keep it' }).click()
    await admin.ctx.close()
  })

  test('turning at-garage on makes the shop photo required again; turning it off lifts that', async ({ browser }) => {
    const readState = async () => {
      const api = await loginViaApi(STAFF.documentsDoorstepOwner.phone, 'vendor')
      const response = await api.get(GARAGE_DOCUMENTS, { headers: { 'X-Vendor-Id': GARAGE.id } })
      const { data } = (await response.json()) as {
        data: {
          summary: { verified: boolean; required: number; missingRequired: number }
          documents: Array<{ type: string; required: boolean }>
        }
      }
      await api.dispose()
      return data
    }

    expect((await readState()).summary).toMatchObject({ verified: true, required: 2 })

    // The garage opens its shop (the same field the Settings toggle writes).
    await sql`update vendors set dropin_enabled = true where id = ${GARAGE.id}`
    const withShop = await readState()
    expect(withShop.summary).toMatchObject({ verified: false, required: 3, missingRequired: 1 })
    expect(withShop.documents.find((doc) => doc.type === 'shop_photo')?.required).toBe(true)

    const { ctx, page } = await openGarage(browser)
    await page.goto('/settings/documents')
    await expect(page.getByText('2 of 3 required approved')).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Shop photo', exact: true }).getByText('Required', { exact: true })
    ).toBeVisible()
    await ctx.close()

    await sql`update vendors set dropin_enabled = false where id = ${GARAGE.id}`
    expect((await readState()).summary).toMatchObject({ verified: true, required: 2, missingRequired: 0 })
  })
})
