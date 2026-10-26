/**
 * Onboarding marks on the Garages page (0059): the Missing chips count and
 * filter the garages that still owe us something, a mark is added from the
 * row and moved To ask → Asked, a second open mark of a missing key offers
 * the first one to edit, and Ask on WhatsApp builds a wa.me link per garage
 * with only what that garage misses. The link's href is asserted, never
 * opened, and nothing is marked Asked until the admin opens it.
 *
 * The garages are VENDORS.marksA (missing photos, logo, doorstep radius and
 * payout) and VENDORS.marksB (missing photos and bays), which only the marks
 * specs touch. The rules are unit-tested in apps/admin/lib/onboarding-marks.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const A = VENDORS.marksA
const B = VENDORS.marksB

/** A garage's row in the Garages table, named by the garage. */
const row = (page: Page, name: string) =>
  page.getByRole('row', { name, exact: true })

const forgetMarks = () =>
  sql`delete from vendor_onboarding_marks where vendor_id in (${A.id}, ${B.id})`

/** The text a wa.me link types in for the owner. */
const textOf = (href: string | null) => {
  expect(href).toMatch(/^https:\/\/wa\.me\/91[6-9]\d{9}\?text=/)
  return decodeURIComponent(href!.split('?text=')[1])
}

test.describe.serial('onboarding marks on the Garages page @p0', () => {
  test.beforeAll(forgetMarks)
  test.afterAll(forgetMarks)

  test('the Missing chips count the garages and filter to them', async ({
    page,
  }) => {
    await page.goto('/vendors?show=all')
    const missing = page.getByRole('group', { name: 'Missing' })

    const photos = missing.getByRole('button', { name: /^Photos \d+$/ })
    const label = await photos.getAttribute('aria-label')
    // Both fixtures have no photos; other garages may not either.
    expect(Number(label?.split(' ').pop())).toBeGreaterThanOrEqual(2)

    await photos.click()
    await expect(photos).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/[?&]missing=photos\b/)
    await expect(row(page, A.name)).toBeVisible()
    await expect(row(page, B.name)).toBeVisible()

    // Only B misses its bays; A has them.
    await missing.getByRole('button', { name: /^Bays \d+$/ }).click()
    await expect(row(page, B.name)).toBeVisible()
    await expect(row(page, A.name)).toHaveCount(0)

    // Pressing the pressed chip shows every garage again.
    await missing.getByRole('button', { name: /^Bays \d+$/ }).click()
    await expect(row(page, A.name)).toBeVisible()
  })

  test('a mark is added on the row and moved to Asked', async ({ page }) => {
    await page.goto('/vendors?show=all')
    const a = row(page, A.name)

    await a.getByRole('button', { name: `Add mark for ${A.name}` }).click()
    const add = page.getByRole('dialog', { name: 'Add a mark' })
    await add.getByRole('button', { name: 'Call back', exact: true }).click()
    await add.getByLabel('Note (optional)').fill('E2E: call after 5 pm')
    await expect(add.getByRole('radio', { name: /^To ask/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await add.getByRole('button', { name: 'Add mark', exact: true }).click()
    await expect(add).toBeHidden()

    const chip = a.getByRole('button', {
      name: /^Edit mark Call back · To ask/,
    })
    await expect(chip).toBeVisible()

    await chip.click()
    const edit = page.getByRole('dialog', { name: 'Edit mark' })
    await expect(edit.getByLabel('Note (optional)')).toHaveValue(
      'E2E: call after 5 pm'
    )
    await edit.getByRole('radio', { name: /^Asked/ }).click()
    await edit.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(edit).toBeHidden()

    await expect(
      a.getByRole('button', { name: /^Edit mark Call back · Asked today/ })
    ).toBeVisible()
    await expect(a).toContainText('Asked today')

    const [mark] = await sql<
      { status: string; asked_at: Date | null; asked_by_name: string | null }[]
    >`
      select status, asked_at, asked_by_name from vendor_onboarding_marks
       where vendor_id = ${A.id} and kind = 'custom' and label = 'Call back'
    `
    expect(mark.status).toBe('asked')
    expect(mark.asked_at).not.toBeNull()
    expect(mark.asked_by_name).toBe('E2E Admin')
  })

  test('a second open mark of a missing key offers the first to edit', async ({
    page,
  }) => {
    await sql`
      insert into vendor_onboarding_marks (vendor_id, kind, label, status, created_by_name)
      values (${A.id}, 'radius_default', 'Ask for radius', 'to_ask', 'E2E Admin')
    `
    await page.goto('/vendors?show=all')
    const a = row(page, A.name)

    await a.getByRole('button', { name: `Add mark for ${A.name}` }).click()
    const add = page.getByRole('dialog', { name: 'Add a mark' })
    await add
      .getByRole('button', { name: 'Ask for radius', exact: true })
      .click()
    await add.getByRole('button', { name: 'Add mark', exact: true }).click()

    await expect(add.getByRole('alert')).toContainText(
      'already has an open “Ask for radius” mark'
    )
    await add.getByRole('button', { name: 'Edit that mark' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit mark' })
    await expect(edit).toContainText(`Ask for radius · ${A.name}`)
    await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(edit).toBeHidden()

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from vendor_onboarding_marks
       where vendor_id = ${A.id} and kind = 'radius_default'
    `
    expect(count).toBe(1)
  })

  test('Ask on WhatsApp writes one wa.me link per garage, and marks nothing by itself', async ({
    page,
  }) => {
    await page.goto('/vendors?show=all')
    await row(page, A.name).getByRole('checkbox').first().check()
    await row(page, B.name).getByRole('checkbox').first().check()

    await page
      .getByRole('button', { name: 'Ask on WhatsApp', exact: true })
      .first()
      .click()
    const sheet = page.getByRole('dialog', {
      name: 'Ask on WhatsApp · 2 garages',
    })
    await expect(sheet).toBeVisible()

    const linkA = sheet.getByRole('link', {
      name: `Open in WhatsApp, ${A.name}`,
    })
    const textA = textOf(await linkA.getAttribute('href'))
    expect(textA).toMatch(/^Hi .+?, to finish your Detlio page we still need: /)
    expect(textA).toContain('3 shop photos')
    expect(textA).toContain('your logo')
    expect(textA).toContain('doorstep jobs')
    expect(textA).toContain('payout bank details')
    expect(textA).not.toContain('how many cars')
    expect(textA).toMatch(/Thanks! – E2E Admin, Team Detlio$/)

    const textB = textOf(
      await sheet
        .getByRole('link', { name: `Open in WhatsApp, ${B.name}` })
        .getAttribute('href')
    )
    expect(textB).toContain('3 shop photos')
    expect(textB).toContain('how many cars you can work on at once')
    expect(textB).not.toContain('your logo')

    // Unticking a thing takes it out of that garage's message.
    const card = sheet.getByRole('region', { name: A.name })
    await card.getByRole('checkbox', { name: 'Logo', exact: true }).uncheck()
    const untickedA = textOf(await linkA.getAttribute('href'))
    expect(untickedA).not.toContain('your logo')
    expect(untickedA).toContain('3 shop photos')

    // The footer opens the first garage's message, the same link.
    await expect(
      sheet.getByRole('link', { name: `Open next: ${A.name}` })
    ).toHaveAttribute('href', (await linkA.getAttribute('href'))!)

    // Nothing is marked Asked while the links are only looked at.
    await sheet.getByRole('button', { name: 'Close' }).click()
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from vendor_onboarding_marks
       where vendor_id in (${A.id}, ${B.id}) and kind <> 'custom' and status = 'asked'
    `
    expect(count).toBe(0)
  })
})
