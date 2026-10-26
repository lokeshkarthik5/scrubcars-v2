/**
 * The garage editor's two columns: the status panel on the left (the
 * checklist switches tabs, Go live holds the stage and Verified in the
 * draft), the tabs and one save bar on the right, and "Onboarded by".
 *
 * Everything here is on VENDORS.marksC, a copy of marksB kept for this spec
 * alone (live, verified,
 * missing photos and bays, onboarded by "E2E Admin"). The stage is only
 * changed and discarded, never saved, so the garage stays live; Onboarded
 * by is put back to "E2E Admin" before and after.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { ADMIN_LOGINS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

// Its own garage: the marks and team specs rely on marksB never changing.
const GARAGE = VENDORS.marksC
const EDIT = `/vendors/${GARAGE.id}/edit`
const SEEDED_BY = ADMIN_LOGINS.e2e.name

async function onboardedBy() {
  const [row] = await sql<{ onboarded_by_name: string | null }[]>`
    select onboarded_by_name from vendors where id = ${GARAGE.id}
  `
  return row?.onboarded_by_name ?? null
}

async function resetGarage() {
  await sql`
    update vendors set onboarded_by_name = ${SEEDED_BY} where id = ${GARAGE.id}
  `
}

test.describe('admin garage editor layout', () => {
  test('status on the left, tabs and one save bar on the right; the checklist opens a tab @p0', async ({
    page,
  }) => {
    await resetGarage()
    await page.goto(EDIT)

    const status = page.getByRole('complementary', { name: 'Garage status' })
    await expect(
      status.getByRole('heading', { level: 1, name: GARAGE.name })
    ).toBeVisible()
    const tabs = page.getByRole('tablist')
    await expect(tabs).toBeVisible()

    // Side by side on a laptop: the panel ends where the tabs begin.
    const left = await status.boundingBox()
    const right = await tabs.boundingBox()
    expect(left && right && left.x + left.width <= right.x).toBe(true)

    // The tabs under their new names, in order (Documents only while
    // garage documents are on).
    const names = (await page.getByRole('tab').allInnerTexts()).map((n) =>
      n.trim()
    )
    expect(names.filter((name) => name !== 'Documents')).toEqual([
      'Details',
      'Location',
      'Hours & booking',
      'Services',
      'Team & payout',
      'Certified',
    ])

    // Go live: the stage and Verified, as saved.
    const goLive = status.getByRole('region', { name: 'Go live' })
    await expect(
      goLive
        .getByRole('radiogroup', { name: 'Stage' })
        .getByRole('radio', { name: 'Active' })
    ).toHaveAttribute('aria-checked', 'true')
    await expect(
      goLive.getByRole('switch', { name: 'Verified by Detlio' })
    ).toHaveAttribute('aria-checked', 'true')
    await expect(
      goLive.getByRole('button', { name: 'Pause new bookings' })
    ).toBeVisible()

    // A checklist line switches tabs; it never leaves the page.
    await status.getByRole('button', { name: /^Bays not set/ }).click()
    await expect(
      page.getByRole('tab', { name: 'Hours & booking' })
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(new RegExp(`${EDIT}\\?tab=operations`))
    await expect(page.getByLabel('Bays (optional)')).toBeVisible()

    // The stage is in the draft: one change, named, and Discard puts it back.
    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toHaveCount(0)
    await goLive.getByRole('radio', { name: 'Pending' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'unsaved change' })
    ).toHaveText('1 unsaved change · stage')
    await expect(goLive).toContainText('Not saved yet')

    // The bar sits in the right-hand column on a laptop…
    const bar = await save.boundingBox()
    expect(left && bar && bar.x >= left.x + left.width).toBe(true)

    // …and along the bottom of the screen on a phone.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(save).toBeInViewport()
    const phoneBar = await save.boundingBox()
    expect(phoneBar && phoneBar.y + phoneBar.height).toBeGreaterThan(780)
    await page.setViewportSize({ width: 1280, height: 720 })

    await page.getByRole('button', { name: 'Discard' }).click()
    await expect(save).toHaveCount(0)
    await expect(goLive.getByRole('radio', { name: 'Active' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('Onboarded by: a login, someone else, or not set, saved with Save changes @p0', async ({
    page,
  }) => {
    await resetGarage()
    await page.goto(EDIT)

    const who = page.getByLabel('Onboarded by (optional)')
    await expect(who).toHaveValue(SEEDED_BY)
    const save = page.getByRole('button', { name: 'Save changes' })

    // Someone not on the team: typed, up to 100 characters.
    await who.selectOption({ label: 'Someone else…' })
    const theirName = page.getByLabel('Their name')
    await expect(theirName).toHaveAttribute('maxlength', '100')
    await theirName.fill('Priya from the Velachery shop')
    await expect(
      page.getByRole('status').filter({ hasText: 'unsaved change' })
    ).toHaveText('1 unsaved change · onboarded by')
    await expect(
      page.getByRole('tab', { name: 'Details, unsaved changes', exact: true })
    ).toBeVisible()
    await save.click()
    await expect.poll(onboardedBy).toBe('Priya from the Velachery shop')
    await expect(save).toHaveCount(0)

    await page.reload()
    await expect(who).toHaveValue('__other__')
    await expect(theirName).toHaveValue('Priya from the Velachery shop')

    // Not set clears it.
    await who.selectOption({ label: 'Not set' })
    await save.click()
    await expect.poll(onboardedBy).toBeNull()

    // And back to a login.
    await who.selectOption({ label: SEEDED_BY })
    await save.click()
    await expect.poll(onboardedBy).toBe(SEEDED_BY)

    await resetGarage()
  })
})
