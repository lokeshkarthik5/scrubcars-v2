/**
 * Coverage in zones (0064, mockup coverage-zones A and D7): the totals, the
 * zone list (Priority / All zones), a zone's call list, the doorstep demand
 * toggle, and Edit zones (add, rename, priority, target, move the centre,
 * remove; a zone with leads is kept). The map is a picture of the same
 * thing; every action here goes through the list, which is what keyboards
 * use too.
 *
 * Only "E2E Test Zone" (LEADS.testZone) is added, changed and removed, and
 * it is removed again after; Perambur's seeded leads are only read here,
 * and only ones coverage-leads.spec.ts never changes (`notInterested`,
 * `knownAqua`): that file runs at the same time and edits `toTarget`.
 * The figures' rules are unit-tested in apps/admin/lib/coverage.test.ts and
 * the zone rules in apps/server/src/lib/zone-edits.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { LEADS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const TEST_ZONE = LEADS.testZone

const removeTestZone = async () => {
  await sql`delete from zones where slug like 'e2e-test-zone%' or lower(name) like 'e2e test zone%'`
}

/** The "Click the map to place …" line while a centre is being picked. */
const pickBanner = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Click the map to place' })

const zoneButton = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Zones', exact: true })
    .getByRole('button', { name: new RegExp(`^${name}: `) })

test.describe.serial('Coverage in zones @p0', () => {
  test.beforeAll(removeTestZone)
  test.afterAll(removeTestZone)

  test('the page: totals, the priority zones first, All zones, and a zone’s call list', async ({
    page,
  }) => {
    await page.goto('/coverage')
    await expect(
      page.getByRole('heading', { name: 'Coverage', exact: true })
    ).toBeVisible()

    const totals = page.getByRole('region', { name: 'Totals' })
    // The seven priority zones 0062 seeded.
    await expect(
      totals.locator('div', {
        has: page.getByText('Priority zones', { exact: true }),
      })
    ).toContainText('7')
    await expect(totals.getByText('Onboarded')).toBeVisible()
    await expect(totals.getByText('To target')).toBeVisible()
    await expect(totals.getByText('Not interested')).toBeVisible()

    // Priority first: the seven, and Perambur (not a priority zone) only under All zones.
    for (const name of [
      'Adyar',
      'Anna Nagar',
      'Guindy',
      'Navalur',
      'Nungambakkam',
      'Sholinganallur',
      'T Nagar',
    ]) {
      await expect(zoneButton(page, name)).toBeVisible()
    }
    await expect(zoneButton(page, LEADS.zoneName)).toHaveCount(0)
    await page.getByRole('radio', { name: 'All zones' }).click()
    await expect(zoneButton(page, LEADS.zoneName)).toBeVisible()
    await expect(zoneButton(page, LEADS.zoneName)).toHaveAccessibleName(
      /Perambur: \d+ of 5 live, \d+ known/
    )
    await page.getByRole('radio', { name: 'Priority' }).click()
    await expect(zoneButton(page, LEADS.zoneName)).toHaveCount(0)
    await page.getByRole('radio', { name: 'All zones' }).click()

    // The demand section keeps its place for customer reach part 2.
    await expect(page.getByRole('region', { name: 'Demand' })).toContainText(
      'customer reach part 2'
    )

    // Perambur's call list: its seeded leads, filtered by status.
    await zoneButton(page, LEADS.zoneName).click()
    await expect(page).toHaveURL(/\/coverage\?zone=/)
    const drawer = page.getByRole('dialog', { name: LEADS.zoneName })
    const list = drawer.getByRole('list', {
      name: `Call list for ${LEADS.zoneName}`,
    })
    await expect(
      list.getByText(LEADS.knownAqua.name, { exact: true })
    ).toBeVisible()
    await expect(
      list.getByText(LEADS.notInterested.name, { exact: true })
    ).toBeVisible()
    await expect(
      list.getByRole('listitem').filter({ hasText: LEADS.knownAqua.name })
    ).toContainText('Not called yet')
    await expect(list).toContainText(`“${LEADS.notInterested.reason}”`)

    await drawer.getByRole('button', { name: /^Not interested \d+$/ }).click()
    await expect(
      list.getByText(LEADS.notInterested.name, { exact: true })
    ).toBeVisible()
    await expect(
      list.getByText(LEADS.knownAqua.name, { exact: true })
    ).toHaveCount(0)
    await drawer.getByRole('button', { name: /^To target \d+$/ }).click()
    await expect(
      list.getByText(LEADS.knownAqua.name, { exact: true })
    ).toBeVisible()
    await expect(
      list.getByText(LEADS.notInterested.name, { exact: true })
    ).toHaveCount(0)
    await drawer.getByRole('button', { name: /^Onboarded \d+$/ }).click()
    await expect(
      list.getByText(LEADS.knownAqua.name, { exact: true })
    ).toHaveCount(0)
    await drawer.getByRole('button', { name: /^All \d+$/ }).click()
    await expect(
      list.getByText(LEADS.notInterested.name, { exact: true })
    ).toBeVisible()

    // Call and WhatsApp open the phone's apps.
    const row = list
      .getByRole('listitem')
      .filter({ hasText: LEADS.knownAqua.name })
    await expect(
      row.getByRole('link', { name: `Call ${LEADS.knownAqua.name}` })
    ).toHaveAttribute('href', `tel:+91${LEADS.knownAqua.phone}`)
    await expect(
      row.getByRole('link', { name: `WhatsApp ${LEADS.knownAqua.name}` })
    ).toHaveAttribute('href', `https://wa.me/91${LEADS.knownAqua.phone}`)
    await expect(drawer.getByRole('region', { name: 'Demand' })).toBeVisible()

    // Straight to the address works (the page reads ?zone= in the browser).
    await page.reload()
    await expect(
      page.getByRole('dialog', { name: LEADS.zoneName })
    ).toBeVisible()
    await page
      .getByRole('dialog', { name: LEADS.zoneName })
      .getByRole('button', { name: 'Close' })
      .click()
    await expect(
      page.getByRole('dialog', { name: LEADS.zoneName })
    ).toHaveCount(0)
    await expect(page).toHaveURL(/\/coverage$/)
  })

  test('the doorstep demand view is the second view', async ({ page }) => {
    await page.goto('/coverage')
    await page.getByRole('radio', { name: 'Doorstep demand' }).click()
    await expect(page).toHaveURL(/view=demand/)
    await expect(
      page.getByRole('heading', { name: 'Biggest gaps' })
    ).toBeVisible()
    await page.getByRole('radio', { name: 'Zones' }).click()
    await expect(page).toHaveURL(/\/coverage$/)
    // Exact: "Map of the zones" is a region too.
    await expect(
      page.getByRole('region', { name: 'Zones', exact: true })
    ).toBeVisible()
  })

  test('Edit zones: add a zone, change it, move its centre, then remove it; customers see it in GET /zones', async ({
    page,
    request,
  }) => {
    await page.goto('/coverage')
    await page.getByRole('button', { name: 'Edit zones' }).click()
    const editor = page.getByRole('region', { name: 'Edit zones' })
    await expect(editor).toBeVisible()

    // Add: the fields, and the map pick that the page's map answers.
    await editor.getByRole('button', { name: '+ Add a zone' }).click()
    await editor.getByLabel('Name', { exact: true }).fill(TEST_ZONE.name)
    await editor.getByLabel('Target (live garages)').fill('3')
    await editor
      .getByRole('button', { name: "Pick the new zone's centre on the map" })
      .click()
    await expect(pickBanner(page)).toContainText(
      'Click the map to place the new zone’s centre'
    )
    await pickBanner(page).getByRole('button', { name: 'Stop' }).click()
    await expect(pickBanner(page)).toHaveCount(0)
    const add = editor.getByRole('button', { name: 'Add zone' })
    await expect(add).toBeDisabled()
    await editor.getByLabel('Centre latitude').fill(String(TEST_ZONE.lat))
    await editor.getByLabel('Centre longitude').fill(String(TEST_ZONE.lng))
    await add.click()
    await expect(
      editor.getByRole('button', { name: `Edit zone ${TEST_ZONE.name}` })
    ).toBeVisible()

    const [added] = await sql<
      { slug: string; target: number; priority: boolean }[]
    >`
      select slug, target, priority from zones where name = ${TEST_ZONE.name}
    `
    expect(added).toEqual({ slug: TEST_ZONE.slug, target: 3, priority: false })

    // A name taken by another zone is refused.
    await editor.getByRole('button', { name: '+ Add a zone' }).click()
    await editor.getByLabel('Name', { exact: true }).fill('perambur')
    await editor.getByLabel('Centre latitude').fill('12.9')
    await editor.getByLabel('Centre longitude').fill('80.1')
    await editor.getByRole('button', { name: 'Add zone' }).click()
    await expect(editor.getByRole('alert')).toContainText(
      'Another zone already has that name.'
    )
    await editor.getByRole('button', { name: 'Cancel' }).click()

    // Rename, priority, target and a new centre, in one save. The slug stays.
    await editor
      .getByRole('button', { name: `Edit zone ${TEST_ZONE.name}` })
      .click()
    const row = editor
      .getByRole('listitem')
      .filter({
        has: page.getByRole('button', { name: `Edit zone ${TEST_ZONE.name}` }),
      })
    await row.getByLabel('Name', { exact: true }).fill(`${TEST_ZONE.name} West`)
    await row.getByLabel('Target (live garages)').fill('4')
    await row.getByRole('checkbox', { name: 'Priority' }).check()
    await row.getByLabel('Centre longitude').fill('80.03')
    await row
      .getByRole('button', {
        name: `Pick ${TEST_ZONE.name}'s centre on the map`,
      })
      .click()
    await expect(pickBanner(page)).toContainText(
      `Click the map to place ${TEST_ZONE.name}’s centre`
    )
    await pickBanner(page).getByRole('button', { name: 'Stop' }).click()
    await row.getByRole('button', { name: 'Save zone' }).click()
    await expect(
      editor.getByRole('button', { name: `Edit zone ${TEST_ZONE.name} West` })
    ).toBeVisible()

    const [changed] = await sql<
      {
        slug: string
        name: string
        target: number
        priority: boolean
        lng: number
      }[]
    >`
      select slug, name, target, priority, lng from zones where slug = ${TEST_ZONE.slug}
    `
    expect(changed).toEqual({
      slug: TEST_ZONE.slug,
      name: `${TEST_ZONE.name} West`,
      target: 4,
      priority: true,
      lng: 80.03,
    })

    // Customers' list has it (the API clears its own cache on a change).
    const zones = (await (await request.get(`${API}/api/v1/zones`)).json()).data
      .zones as Array<{ slug: string; name: string; priority: boolean }>
    expect(zones.find((zone) => zone.slug === TEST_ZONE.slug)).toMatchObject({
      name: `${TEST_ZONE.name} West`,
      priority: true,
    })

    // A zone with leads is kept.
    await editor
      .getByRole('button', { name: `Edit zone ${LEADS.zoneName}` })
      .click()
    const perambur = editor
      .getByRole('listitem')
      .filter({
        has: page.getByRole('button', { name: `Edit zone ${LEADS.zoneName}` }),
      })
    await perambur.getByRole('button', { name: 'Remove zone' }).click()
    await perambur
      .getByRole('button', { name: `Remove ${LEADS.zoneName}` })
      .click()
    await expect(perambur.getByRole('alert')).toContainText(
      `in ${LEADS.zoneName}. Move`
    )
    expect(
      (await sql`select 1 from zones where slug = ${LEADS.zoneSlug}`).length
    ).toBe(1)

    // Remove the test zone: Keep it first, then Remove.
    const testRow = editor
      .getByRole('listitem')
      .filter({
        has: page.getByRole('button', {
          name: `Edit zone ${TEST_ZONE.name} West`,
        }),
      })
    await testRow
      .getByRole('button', { name: `Edit zone ${TEST_ZONE.name} West` })
      .click()
    await testRow.getByRole('button', { name: 'Remove zone' }).click()
    await testRow.getByRole('button', { name: 'Keep it' }).click()
    await testRow.getByRole('button', { name: 'Remove zone' }).click()
    await testRow
      .getByRole('button', { name: `Remove ${TEST_ZONE.name} West` })
      .click()
    await expect(
      editor.getByRole('button', { name: `Edit zone ${TEST_ZONE.name} West` })
    ).toHaveCount(0)
    expect(
      (await sql`select 1 from zones where slug = ${TEST_ZONE.slug}`).length
    ).toBe(0)

    await editor.getByRole('button', { name: 'Done' }).click()
    // Exact: "Map of the zones" is a region too.
    await expect(
      page.getByRole('region', { name: 'Zones', exact: true })
    ).toBeVisible()
  })
})
