/**
 * Service categories (0080) in admin: the garage editor's Services tab under
 * one heading per category, Add service's "What kind of service?" picker,
 * the "Looks like … · Move" hint in Others, and Settings → Services in
 * Others, where Move saves at once with Undo.
 *
 * Everything here is on SERVICE_CATEGORIES (seeds/e2e-ids.ts), which no
 * other file reads. Each test puts the seeded state back first, so a retry
 * starts where the first attempt did.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { SERVICE_CATEGORIES as C } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

async function resetServices() {
  await sql`
    update services set category = 'others', category_hint_dismissed_at = null
     where id in (${C.clutch.id}, ${C.bumper.id}, ${C.alignment.id}, ${C.bikeWash.id})
  `
  await sql`
    update services set category = 'others', category_hint_dismissed_at = now() - interval '2 days'
     where id = ${C.battery.id}
  `
}

async function stored(id: string) {
  const [row] = await sql<{ category: string; dismissed: boolean }[]>`
    select category, category_hint_dismissed_at is not null as dismissed from services where id = ${id}
  `
  return row
}

test.describe('the garage editor, by category', () => {
  test('one heading per category with its commission, and template lines @p0', async ({ page }) => {
    await resetServices()
    await page.goto(`/vendors/${C.garage.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()

    // Each heading carries its count and Detlio's commission, in order.
    const headings = page.getByRole('heading', { level: 3, name: /commission$/ })
    await expect(headings).toHaveText([
      /^General service\s*1\s*·\s*5% commission$/,
      /^Repairs\s*1\s*·\s*5% commission$/,
      /^Others\s*5\s*·\s*8% commission$/,
    ])
    // Three of the five in Others look like the new work; the turned-down
    // battery and the bike wash don't.
    await expect(
      page.getByText(
        '3 of these look like they belong in a new category. Nothing moves until you tap Move; then Save changes as usual.'
      )
    ).toBeVisible()

    // Template chips sit on one line per category; what the garage has is left out.
    const repairs = page.getByRole('group', { name: 'Repairs templates' })
    await expect(repairs.getByRole('button', { name: 'AC service' })).toBeVisible()
    await expect(repairs.getByRole('button', { name: 'Clutch repair' })).toBeVisible()
    await expect(repairs.getByRole('button', { name: 'Brake pads' })).toHaveCount(0)
    await expect(
      page.getByRole('group', { name: 'Detailing templates' }).getByRole('button', { name: 'Engine bay cleaning' })
    ).toBeVisible()
  })

  test('Add service asks for the category, and the row lands under it, named first', async ({ page }) => {
    await resetServices()
    await page.goto(`/vendors/${C.garage.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()

    const add = page.getByRole('button', { name: 'Add service' })
    await add.click()
    await expect(add).toHaveAttribute('aria-expanded', 'true')
    const picker = page.getByRole('group', { name: 'What kind of service?' })
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('button')).toHaveCount(8)
    await expect(picker.getByRole('button', { name: /^Repairs\s*5%\s*New$/ })).toBeVisible()
    await expect(picker.getByRole('button', { name: /^Others\s*8%$/ })).toBeVisible()

    // Escape closes it without adding anything.
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    await expect(add).toBeFocused()

    await add.click()
    await page.getByRole('group', { name: 'What kind of service?' }).getByRole('button', { name: /^Dent & paint/ }).click()
    await expect(page.getByRole('group', { name: 'What kind of service?' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 3, name: /^Dent & paint\s*1\s*·\s*5% commission$/ })).toBeVisible()
    // The new row lands after General service and Repairs: the third on screen, its name box focused.
    const name = page.getByLabel('Service 3 name')
    await expect(name).toBeFocused()
    await expect(name).toHaveValue('')

    await page.getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('heading', { level: 3, name: /^Dent & paint/ })).toHaveCount(0)
  })

  test('the hint in Others: Move follows the row; Not this is saved with Save changes @p0', async ({ page }) => {
    await resetServices()
    await page.goto(`/vendors/${C.garage.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()

    const clutch = page.getByRole('group', { name: C.clutch.name })
    await expect(clutch).toContainText('Looks like Repairs · matched “clutch”')
    await expect(page.getByRole('group', { name: C.bikeWash.name })).not.toContainText('Looks like')
    await expect(page.getByRole('group', { name: C.battery.name })).not.toContainText('Looks like')

    // Move: it jumps to Repairs, is announced, and the hint goes.
    await clutch.getByRole('button', { name: 'Move to Repairs' }).click()
    await expect(page.getByRole('heading', { level: 3, name: /^Repairs\s*2\s*·/ })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: /^Others\s*4\s*·/ })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'moved to Repairs' })).toHaveText(
      `“${C.clutch.name}” moved to Repairs.`
    )
    await expect(page.getByRole('group', { name: C.clutch.name })).not.toContainText('Looks like')
    await expect(page.getByRole('button', { name: `More for ${C.clutch.name}` })).toBeFocused()

    // Not this: the hint goes for good once saved.
    const bumper = page.getByRole('group', { name: C.bumper.name })
    await expect(bumper).toContainText('Looks like Dent & paint · matched “bumper”')
    await bumper.getByRole('button', { name: `Not this: keep ${C.bumper.name} in Others` }).click()
    await expect(bumper).not.toContainText('Looks like')

    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => stored(C.clutch.id)).toEqual({ category: 'repairs', dismissed: false })
    await expect.poll(() => stored(C.bumper.id)).toEqual({ category: 'others', dismissed: true })

    await page.reload()
    await page.getByRole('tab', { name: 'Services' }).click()
    await expect(page.getByRole('group', { name: C.bumper.name })).not.toContainText('Looks like')
    await expect(page.getByRole('group', { name: C.alignment.name })).toContainText(
      'Looks like General service · matched “alignment”'
    )
    await resetServices()
  })
})

test.describe('Settings → Services in Others', () => {
  test('reached from Settings; Move saves at once, with Undo; Not this and Show again @p0', async ({ page }) => {
    await resetServices()
    await page.goto('/settings')
    await page.getByRole('link', { name: /Services in Others/ }).click()
    await expect(page).toHaveURL(/\/settings\/services-in-others$/)
    await expect(page.getByRole('heading', { name: 'Services in Others' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Words we look for' })).toBeVisible()

    const toCheck = page.getByRole('button', { name: /^To check \d+$/ })
    await expect(toCheck).toHaveAttribute('aria-pressed', 'true')
    const row = (name: string) => page.getByRole('listitem', { name: `${name}, ${C.garage.name}` })

    // Only names that match, never the bike wash or the turned-down battery.
    await expect(row(C.alignment.name)).toContainText('“alignment”')
    await expect(row(C.alignment.name)).toContainText('General service')
    await expect(row(C.bikeWash.name)).toHaveCount(0)
    await expect(row(C.battery.name)).toHaveCount(0)

    // Move: saved straight away; the row stays, marked Moved, with Undo.
    await row(C.alignment.name).getByRole('button', { name: `Move ${C.alignment.name} to General service` }).click()
    await expect(row(C.alignment.name)).toContainText('Moved')
    await expect.poll(() => stored(C.alignment.id)).toEqual({ category: 'general_service', dismissed: false })
    await page.getByRole('button', { name: /^Moved 1$/ }).click()
    await expect(row(C.alignment.name)).toBeVisible()
    await row(C.alignment.name).getByRole('button', { name: `Undo, put ${C.alignment.name} back in Others` }).click()
    await expect.poll(() => stored(C.alignment.id)).toEqual({ category: 'others', dismissed: false })
    await expect(page.getByRole('button', { name: /^Moved 0$/ })).toBeVisible()

    // Not this, then Show again from its tab.
    await toCheck.click()
    await row(C.clutch.name).getByRole('button', { name: `Not this: keep ${C.clutch.name} in Others` }).click()
    await expect.poll(() => stored(C.clutch.id)).toEqual({ category: 'others', dismissed: true })
    await expect(row(C.clutch.name)).toHaveCount(0)
    await page.getByRole('button', { name: /^Not this \d+$/ }).click()
    await expect(row(C.battery.name)).toBeVisible()
    await row(C.clutch.name).getByRole('button', { name: `Show the hint for ${C.clutch.name} again` }).click()
    await expect.poll(() => stored(C.clutch.id)).toEqual({ category: 'others', dismissed: false })

    // The garage's link opens its Services tab.
    await toCheck.click()
    await row(C.bumper.name).getByRole('link', { name: C.garage.name }).click()
    await expect(page).toHaveURL(new RegExp(`/vendors/${C.garage.id}/edit\\?tab=services`))
    await resetServices()
  })
})
