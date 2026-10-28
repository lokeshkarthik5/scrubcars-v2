/**
 * The admin round on the Garages page (0061, mockup garages-list): the
 * target counter (live garages against the team's target, its edit dialog,
 * added this week, not live yet, live by area) and the colour tags (set on
 * one garage from its Colour cell, on several from the bulk bar, with a
 * Call back day; filtered by the chips with counts; sorted by the column;
 * renamed for the whole team; who set it and when).
 *
 * Only VENDORS.roundA and roundB are coloured here, and the team-wide target
 * and colour names are put back after each test, so the page reads the same
 * for every other spec. The figures' rules are unit-tested in
 * apps/admin/lib/garage-target.test.ts and garage-colours.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const A = VENDORS.roundA
const B = VENDORS.roundB

/** A garage's row in the Garages table, named by the garage. */
const row = (page: Page, name: string) =>
  page.getByRole('row', { name, exact: true })

const colourOf = async (id: string) => {
  const [garage] = await sql<
    {
      colour_tag: string | null
      colour_tag_call_on: string | null
      colour_tag_set_by: string | null
    }[]
  >`select colour_tag, colour_tag_call_on::text, colour_tag_set_by from vendors where id = ${id}`
  return garage
}

/** No colours on our garages, and the team's settings as they start. */
const reset = async () => {
  await sql`update vendors set colour_tag = null, colour_tag_call_on = null, colour_tag_set_by = null,
    colour_tag_set_at = null where id in (${A.id}, ${B.id})`
  await sql`delete from admin_settings`
}

/** A day n days from today in Chennai, "YYYY-MM-DD". */
const istDay = (n: number) =>
  new Date(Date.now() + 5.5 * 60 * 60 * 1000 + n * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

test.describe.serial('the admin round: Garages @p0', () => {
  test.beforeAll(reset)
  test.afterAll(reset)

  test('the target counter: live garages against the target, edited for the team', async ({
    page,
  }) => {
    await page.goto('/vendors?show=all')
    const counter = page.getByRole('region', { name: 'Onboarding target' })
    await expect(
      counter.getByText('Live garages', { exact: true })
    ).toBeVisible()
    await expect(counter.getByText('/ 50')).toBeVisible()
    await expect(
      counter.getByRole('progressbar', {
        name: 'Live garages against the target',
      })
    ).toHaveAttribute('aria-valuemax', '50')
    await expect(counter.getByText(/^\d+% there/)).toBeVisible()
    await expect(counter.getByText('Added this week')).toBeVisible()
    await expect(counter.getByText('Not live yet')).toBeVisible()
    // roundA and roundB are live, out of town: their area is their city.
    const areas = counter.getByRole('list')
    await expect(counter.getByText('Live by area')).toBeVisible()
    await expect(areas.getByRole('listitem').first()).toBeVisible()

    await counter.getByRole('button', { name: 'Target 50, edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Onboarding target' })
    await dialog.getByLabel('Target', { exact: true }).fill('0')
    await expect(dialog.getByText('A whole number from 1.')).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Save target' })
    ).toBeDisabled()
    await dialog.getByLabel('Target', { exact: true }).fill('60')
    await dialog.getByRole('radio', { name: 'All onboarded' }).click()
    const by = istDay(60)
    await dialog.getByLabel('By (optional)', { exact: true }).fill(by)
    await dialog.getByRole('button', { name: 'Save target' }).click()
    await expect(dialog).toHaveCount(0)

    await expect(
      counter.getByText('Garages onboarded', { exact: true })
    ).toBeVisible()
    await expect(counter.getByText('/ 60')).toBeVisible()
    await expect(
      counter.getByText(/to go by \d{1,2} [A-Z][a-z]{2}|target reached/)
    ).toBeVisible()
    const [stored] = await sql<
      { value: Record<string, unknown>; updated_by_name: string }[]
    >`
      select value, updated_by_name from admin_settings where key = 'garage_target'
    `
    expect(stored).toEqual({
      value: { target: 60, endsOn: by, counts: 'onboarded' },
      updated_by_name: 'E2E Admin',
    })

    // Everyone sees it: read again from the API.
    const settings = await page.request.get(
      `${API}/api/v1/admin/garage-board/settings`
    )
    expect((await settings.json()).data.target).toMatchObject({
      target: 60,
      updatedBy: 'E2E Admin',
    })

    // Cancel changes nothing.
    await counter.getByRole('button', { name: 'Target 60, edit' }).click()
    await dialog.getByLabel('Target', { exact: true }).fill('99')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(counter.getByText('/ 60')).toBeVisible()

    // No end date takes the day off.
    await counter.getByRole('button', { name: 'Target 60, edit' }).click()
    await expect(
      dialog.getByLabel('By (optional)', { exact: true })
    ).toHaveValue(by)
    await dialog.getByRole('button', { name: 'No end date' }).click()
    await expect(
      dialog.getByLabel('By (optional)', { exact: true })
    ).toHaveValue('')
    await dialog.getByRole('button', { name: 'Save target' }).click()
    await expect(dialog).toHaveCount(0)
    await expect
      .poll(
        async () =>
          (
            await sql`select value from admin_settings where key = 'garage_target'`
          )[0].value.endsOn
      )
      .toBeNull()
  })

  test('a colour on one garage from its cell: the row is tinted, the chip counts it, and it says who set it', async ({
    page,
  }) => {
    await page.goto('/vendors?show=all')
    const a = row(page, A.name)
    await a
      .getByRole('button', { name: `Colour for ${A.name}: none. Change` })
      .click()
    const picker = page.getByRole('dialog', { name: `Colour for ${A.name}` })
    await expect(picker.getByText('No colour yet')).toBeVisible()
    await picker.getByRole('button', { name: /^All confirmed/ }).click()
    await expect(picker).toHaveCount(0)

    await expect(
      a.getByRole('button', {
        name: `Colour for ${A.name}: All confirmed. Change`,
      })
    ).toBeVisible()
    await expect
      .poll(() => colourOf(A.id))
      .toMatchObject({ colour_tag: 'green', colour_tag_set_by: 'E2E Admin' })
    // The soft tint and its edge.
    await expect(a).toHaveClass(/bg-tone-done-tint/)

    const chips = page.getByRole('group', { name: 'Colour', exact: true })
    await chips.getByRole('button', { name: /^All confirmed \d+$/ }).click()
    await expect(page).toHaveURL(/[?&]colour=green\b/)
    await expect(a).toBeVisible()
    await expect(row(page, B.name)).toHaveCount(0)
    // No colour: B, not A.
    await chips.getByRole('button', { name: /^No colour \d+$/ }).click()
    await expect(row(page, B.name)).toBeVisible()
    await expect(a).toHaveCount(0)
    // The pressed chip again: every garage.
    await chips.getByRole('button', { name: /^No colour \d+$/ }).click()
    await expect(a).toBeVisible()
    await expect(row(page, B.name)).toBeVisible()

    // Who set it, and Call back with a day.
    await a.getByRole('button', { name: /^Colour for .*Change$/ }).click()
    await expect(
      picker.getByText(/^Set by E2E Admin · \d{1,2} [A-Z][a-z]{2}/)
    ).toBeVisible()
    await picker
      .getByLabel('Call back on (optional)', { exact: true })
      .fill(istDay(1))
    await picker.getByRole('button', { name: /^Call back/ }).click()
    await expect(
      a.getByRole('button', {
        name: `Colour for ${A.name}: Call back tomorrow. Change`,
      })
    ).toBeVisible()
    await expect
      .poll(() => colourOf(A.id))
      .toMatchObject({ colour_tag: 'blue', colour_tag_call_on: istDay(1) })

    // No colour clears who set it too.
    await a.getByRole('button', { name: /^Colour for .*Change$/ }).click()
    await picker.getByRole('button', { name: 'No colour' }).click()
    await expect
      .poll(() => colourOf(A.id))
      .toEqual({
        colour_tag: null,
        colour_tag_call_on: null,
        colour_tag_set_by: null,
      })
  })

  test('several ticked garages coloured at once, then sorted by colour', async ({
    page,
  }) => {
    await page.goto('/vendors?show=all')
    await page.getByRole('checkbox', { name: `Select ${A.name}` }).check()
    await page.getByRole('checkbox', { name: `Select ${B.name}` }).check()
    const bar = page.getByRole('region', { name: 'Selected garages' })
    await bar.getByRole('button', { name: 'Set colour' }).click()
    const picker = page.getByRole('dialog', { name: 'Colour for 2 garages' })
    await picker.getByRole('button', { name: /^Needs details/ }).click()
    await expect(picker).toHaveCount(0)
    await expect(
      page.getByText('2 garages coloured “Needs details”')
    ).toBeVisible()
    await expect.poll(() => colourOf(A.id)).toMatchObject({ colour_tag: 'red' })
    await expect.poll(() => colourOf(B.id)).toMatchObject({ colour_tag: 'red' })

    // Sorted by the column: coloured garages first, in the chips' order.
    await page
      .getByRole('columnheader', { name: 'Colour' })
      .getByRole('button')
      .click()
    await expect(
      page.getByRole('columnheader', { name: 'Colour' })
    ).toHaveAttribute('aria-sort', 'ascending')
    const firstRows = page.getByRole('row').nth(1)
    await expect(
      firstRows.getByRole('button', { name: /Needs details/ })
    ).toBeVisible()
  })

  test('the colours are renamed once, for the whole team', async ({ page }) => {
    await page.goto('/vendors?show=all')
    await row(page, A.name)
      .getByRole('button', { name: /^Colour for .*Change$/ })
      .click()
    const picker = page.getByRole('dialog', { name: `Colour for ${A.name}` })
    await picker.getByRole('button', { name: 'Rename colours' }).click()

    const rename = page.getByRole('dialog', { name: 'Rename colours' })
    // Cancel keeps the names.
    await rename
      .getByLabel('Name for Needs details', { exact: true })
      .fill('Call them')
    await rename.getByRole('button', { name: 'Cancel' }).click()
    await expect(rename).toHaveCount(0)
    // Back on the picker, which still says Needs details.
    await expect(
      picker.getByRole('button', { name: /^Needs details/ })
    ).toBeVisible()
    await picker.getByRole('button', { name: 'Rename colours' }).click()
    await rename.getByLabel('Name for All confirmed', { exact: true }).fill('')
    await expect(
      rename.getByRole('button', { name: 'Save names' })
    ).toBeDisabled()
    await rename
      .getByLabel('Name for All confirmed', { exact: true })
      .fill('Verified on call')
    await rename.getByRole('button', { name: 'Save names' }).click()
    await expect(rename).toHaveCount(0)

    await expect(
      page
        .getByRole('group', { name: 'Colour', exact: true })
        .getByRole('button', { name: /^Verified on call \d+$/ })
    ).toBeVisible()
    const [stored] = await sql<{ value: Record<string, string> }[]>`
      select value from admin_settings where key = 'colour_names'
    `
    expect(stored.value).toMatchObject({
      green: 'Verified on call',
      red: 'Needs details',
    })
  })
})
