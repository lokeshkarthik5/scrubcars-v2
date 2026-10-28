/**
 * Find businesses in a zone (0064, mockup zone-finder), on PLACES_FAKE's
 * fixed list (apps/server/src/lib/places/fake.ts), so nothing reaches
 * Google or Ola: the kinds and the search, one merged list with G / Ola
 * tags ("Shine Pro Detailing" is at both), what the team already has
 * greyed with its status (LEADS.knownAqua shares a phone with "Aqua Foam
 * Car Wash"), the sort, ticking, assigning, and "Add N as leads".
 *
 * Searches Perambur. The leads it adds are removed before and after, by
 * the fake places' ids. Merging and matching are unit-tested in
 * apps/server/src/lib/places/merge.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { LEADS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const removeFound = async () => {
  await sql`delete from leads where google_place_id like 'fake-%' or ola_place_id like 'fake-%'`
}

const names = async (page: Page) =>
  page
    .getByRole('list', { name: 'Businesses found' })
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map(
        (item) =>
          item
            .querySelector('input')
            ?.getAttribute('aria-label')
            ?.replace(/^Tick /, '') ?? ''
      )
    )

test.describe.serial('the zone finder @p0', () => {
  test.beforeAll(removeFound)
  test.afterAll(removeFound)

  test('search, sort, tick, assign and add as leads', async ({ page }) => {
    const [zone] = await sql<
      { id: string }[]
    >`select id from zones where slug = ${LEADS.zoneSlug}`
    await page.goto(`/coverage?zone=${zone.id}`)
    await page
      .getByRole('dialog', { name: LEADS.zoneName })
      .getByRole('link', { name: 'Find businesses' })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/coverage/find\\?zone=${zone.id}$`)
    )
    await expect(
      page.getByRole('heading', {
        name: `Find businesses in ${LEADS.zoneName}`,
      })
    ).toBeVisible()

    // Straight to the address works (the page reads ?zone= in the browser).
    await page.reload()
    await expect(
      page.getByRole('heading', {
        name: `Find businesses in ${LEADS.zoneName}`,
      })
    ).toBeVisible()

    // Four kinds start ticked; tyres does not.
    const kinds = page.getByRole('group', { name: 'Kinds' })
    await expect(
      kinds.getByRole('button', { name: /^Car wash/ })
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      kinds.getByRole('button', { name: /^Tyres & accessories/ })
    ).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('button', { name: 'Search zone' }).click()
    await expect(
      page.getByText('5 found (Google 4 · Ola 2 · 1 in both) · 4 new · 1 known')
    ).toBeVisible()
    await expect(
      kinds.getByRole('button', { name: 'Detailing studio 2' })
    ).toBeVisible()

    const found = page.getByRole('list', { name: 'Businesses found' })
    const shine = found
      .getByRole('listitem')
      .filter({ hasText: 'Shine Pro Detailing' })
    await expect(shine.getByText('G', { exact: true })).toBeVisible()
    await expect(shine.getByText('Ola', { exact: true })).toBeVisible()
    await expect(shine).toContainText('★ 4.7')
    await expect(shine).toContainText('98400 22417')
    await expect(shine).toContainText('New')

    // Known: greyed, can't be ticked, with its status.
    const aqua = found
      .getByRole('listitem')
      .filter({ hasText: 'Aqua Foam Car Wash' })
    await expect(
      aqua.getByRole('checkbox', { name: 'Tick Aqua Foam Car Wash' })
    ).toBeDisabled()
    await expect(aqua).toContainText('Already a lead')
    await expect(aqua).toContainText('Lead')

    const gloss = found
      .getByRole('listitem')
      .filter({ hasText: 'Gloss Garage Ceramic' })
    await expect(gloss).toContainText('No phone listed')
    const murugan = found
      .getByRole('listitem')
      .filter({ hasText: 'Sri Murugan Auto Works' })
    await expect(murugan).toContainText('No rating')

    // The sorts.
    expect((await names(page))[0]).toBe('Shine Pro Detailing')
    await page.getByRole('radio', { name: 'Rating' }).click()
    expect((await names(page))[0]).toBe('Gloss Garage Ceramic')
    await page.getByRole('radio', { name: 'Nearest' }).click()
    expect((await names(page)).slice(0, 2)).toEqual([
      'Shine Pro Detailing',
      'Splash Doorstep Wash',
    ])
    await page.getByRole('radio', { name: 'Most reviews' }).click()
    expect(await names(page)).toEqual([
      'Shine Pro Detailing',
      'Aqua Foam Car Wash',
      'Gloss Garage Ceramic',
      'Splash Doorstep Wash',
      'Sri Murugan Auto Works',
    ])

    // Tick every new one, then untick two: two to add.
    const add = page.getByRole('button', { name: /^Add \d+ as leads?$/ })
    await expect(add).toBeDisabled()
    await page.getByRole('checkbox', { name: 'Tick every new one (4)' }).check()
    await expect(
      page.getByRole('button', { name: 'Add 4 as leads' })
    ).toBeEnabled()
    await gloss
      .getByRole('checkbox', { name: 'Tick Gloss Garage Ceramic' })
      .uncheck()
    await found
      .getByRole('checkbox', { name: 'Tick Splash Doorstep Wash' })
      .uncheck()
    await expect(
      page.getByText('2 ticked · become leads in Perambur, status To target')
    ).toBeVisible()
    await page.getByLabel('Assign to').selectOption({ label: 'E2E Admin' })
    await page.getByRole('button', { name: 'Add 2 as leads' }).click()

    // Back to the zone's call list, with them in it.
    await expect(page).toHaveURL(new RegExp(`/coverage\\?zone=${zone.id}$`))
    const list = page
      .getByRole('dialog', { name: LEADS.zoneName })
      .getByRole('list', { name: `Call list for ${LEADS.zoneName}` })
    await expect(
      list.getByText('Shine Pro Detailing Studio', { exact: true })
    ).toBeVisible()
    await expect(
      list.getByText('Sri Murugan Auto Works', { exact: true })
    ).toBeVisible()

    const rows = await sql<
      {
        name: string | null
        phone: string | null
        source: string
        google_place_id: string | null
        ola_place_id: string | null
        google_name: string | null
        google_rating: string | null
        google_fetched_at: Date | null
        pin_source: string
        zone_id: string
        assigned_name: string
        status: string
      }[]
    >`
      select name, phone, source, google_place_id, ola_place_id, google_name, google_rating::text,
             google_fetched_at, pin_source, zone_id, assigned_name, status
        from leads where google_place_id like 'fake-%' or ola_place_id like 'fake-%' order by name
    `
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      name: 'Shine Pro Detailing Studio',
      phone: '9840022417',
      source: 'google',
      google_place_id: 'fake-google-shine',
      ola_place_id: 'fake-ola-shine',
      google_name: 'Shine Pro Detailing',
      google_rating: '4.7',
      pin_source: 'ola',
      zone_id: zone.id,
      assigned_name: 'E2E Admin',
      status: 'to_target',
    })
    expect(rows[0].google_fetched_at).not.toBeNull()
    expect(rows[1]).toMatchObject({
      name: 'Sri Murugan Auto Works',
      source: 'ola',
      google_place_id: null,
      google_fetched_at: null,
      ola_place_id: 'fake-ola-murugan',
    })

    // Searched again, they are known now.
    await page.goto(`/coverage/find?zone=${zone.id}`)
    await page.getByRole('button', { name: 'Search zone' }).click()
    await expect(
      page.getByText('5 found (Google 4 · Ola 2 · 1 in both) · 2 new · 3 known')
    ).toBeVisible()
    await expect(
      page
        .getByRole('list', { name: 'Businesses found' })
        .getByRole('checkbox', { name: 'Tick Shine Pro Detailing' })
    ).toBeDisabled()
  })

  test('your own words, nothing found, Tyres, and Close', async ({ page }) => {
    const [zone] = await sql<
      { id: string }[]
    >`select id from zones where slug = ${LEADS.zoneSlug}`
    await page.goto(`/coverage/find?zone=${zone.id}`)
    const kinds = page.getByRole('group', { name: 'Kinds' })
    for (const kind of [
      /^Car wash/,
      /^Detailing studio/,
      /^Workshop/,
      /^Doorstep wash/,
    ]) {
      await kinds.getByRole('button', { name: kind }).click()
      await expect(kinds.getByRole('button', { name: kind })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    }
    // Nothing ticked and no words: nothing to search.
    await expect(
      page.getByRole('button', { name: 'Search zone' })
    ).toBeDisabled()

    await page.getByLabel('Your own words (optional)').fill('zzz nothing here')
    await page.getByRole('button', { name: 'Search zone' }).click()
    await expect(
      page.getByText(`No businesses found in ${LEADS.zoneName}.`)
    ).toBeVisible()

    await page.getByLabel('Your own words (optional)').fill('ceramic')
    await page.getByRole('button', { name: 'Search zone' }).click()
    await expect(
      page.getByText('1 found (Google 1 · Ola 0 · 0 in both) · 1 new · 0 known')
    ).toBeVisible()

    await page.getByLabel('Your own words (optional)').fill('')
    await kinds.getByRole('button', { name: /^Tyres & accessories/ }).click()
    await page.getByRole('button', { name: 'Search zone' }).click()
    await expect(
      page.getByRole('list', { name: 'Businesses found' })
    ).toContainText('Wheel Point Tyres')
    await expect(
      page.getByRole('list', { name: 'Businesses found' })
    ).toContainText('44262 14400')

    await page.getByRole('link', { name: LEADS.zoneName, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/coverage\\?zone=${zone.id}$`))
    await page.goto(`/coverage/find?zone=${zone.id}`)
    await page.getByRole('link', { name: 'Close' }).click()
    await expect(page).toHaveURL(new RegExp(`/coverage\\?zone=${zone.id}$`))
  })
})
