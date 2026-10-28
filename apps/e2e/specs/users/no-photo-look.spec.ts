/**
 * The no-photo look and "What's included" (Trust & look, 0063).
 *
 * A garage without photos gets a designed cover (its initials, area and
 * modes on a colour of its own) and, without a logo, a monogram tile; real
 * photos always win. A service without the garage's own photos shows its
 * category icon, its sheet has no picture area at all, and nothing on a
 * customer screen says "Sample". A description's "- " points show as
 * "What's included" with ticks in the sheet (five, then "+N more") and as
 * "a · b · c +N" on the service card.
 *
 * Fixtures: TRUST_LOOK (apps/server/src/db/seeds/e2e-ids.ts), two garages of
 * its own far south-west, read by no other spec. Read-only.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { GaragePage } from '../../pages/garage.page'
import { TRUST_LOOK } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-browse') })

const S = TRUST_LOOK.services

/** The search screen, typed: no radius, so these far garages are found. */
async function searchFor(page: import('@playwright/test').Page, q: string) {
  await page.goto('/search')
  await page
    .getByRole('searchbox', { name: 'Search garages or services' })
    .fill(q)
}

/** A garage's card on a list: its link to the garage page. */
const cardOf = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`a[href^="/garage/${id}"]`).first()

test.describe('garages without photos @p0', () => {
  test('the list card shows the designed cover and the monogram', async ({
    page,
  }) => {
    await searchFor(page, TRUST_LOOK.plain.name)
    const card = cardOf(page, TRUST_LOOK.plain.id)
    await expect(card).toBeVisible()
    await expect(
      card.getByRole('heading', { name: TRUST_LOOK.plain.name })
    ).toBeVisible()

    const cover = card.getByTestId('garage-cover')
    await expect(cover).toBeVisible()
    // Where it is and how it is booked (small caps by CSS; the text is as written).
    await expect(cover).toContainText('Chennai')
    await expect(cover).toContainText('At garage')
    await expect(cover).toContainText('Doorstep')
    await expect(cover).toHaveAttribute(
      'data-tone',
      /^(red|blue|green|bronze|plum)$/
    )
    await expect(card.getByTestId('garage-monogram')).toHaveText(
      TRUST_LOOK.plain.initials
    )
    // No picture of a garage it does not have (the cover is drawn, not an image).
    await expect(card.locator('img')).toHaveCount(0)
  })

  test('the colour is the same on the card and the page', async ({ page }) => {
    await searchFor(page, TRUST_LOOK.plain.name)
    const tone = await cardOf(page, TRUST_LOOK.plain.id)
      .getByTestId('garage-cover')
      .getAttribute('data-tone')

    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.plain.id)
    await expect(
      page.getByRole('heading', { level: 1, name: TRUST_LOOK.plain.name })
    ).toBeVisible()
    await expect(garage.cover()).toHaveAttribute('data-tone', tone!)
    await expect(garage.cover()).toContainText('Doorstep')
    await expect(garage.monogram()).toHaveText(TRUST_LOOK.plain.initials)
    await expect(garage.monogram()).toHaveAttribute('data-tone', tone!)
    // The back button still works over the cover.
    await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible()
  })

  test('a garage with a photo shows the photo, with the monogram for its missing logo', async ({
    page,
  }) => {
    await searchFor(page, TRUST_LOOK.photo.name)
    const card = cardOf(page, TRUST_LOOK.photo.id)
    await expect(
      card.getByRole('img', { name: TRUST_LOOK.photo.name, exact: true })
    ).toBeVisible()
    await expect(card.getByTestId('garage-cover')).toHaveCount(0)
    await expect(card.getByTestId('garage-monogram')).toHaveText(
      TRUST_LOOK.photo.initials
    )

    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.photo.id)
    await expect(
      page.getByRole('img', { name: TRUST_LOOK.photo.name, exact: true })
    ).toBeVisible()
    await expect(garage.cover()).toHaveCount(0)
    await expect(garage.monogram()).toHaveText(TRUST_LOOK.photo.initials)
  })
})

test.describe('services without photos @p0', () => {
  test('cards show the category icon; a photo still shows', async ({
    page,
  }) => {
    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.plain.id)

    for (const [service, icon] of [
      [S.points, 'detailing'],
      [S.bike, 'bike'],
      [S.aiOnly, 'coating'],
    ] as const) {
      await expect(
        garage.detailsTrigger(service.name).getByTestId('service-icon-tile')
      ).toHaveAttribute('data-icon', icon)
    }
    const withPhoto = garage.detailsTrigger(S.photo.name)
    await expect(withPhoto.getByTestId('service-icon-tile')).toHaveCount(0)
    await expect(withPhoto.locator('img')).toHaveCount(1)

    await expect(page.getByText('Sample', { exact: true })).toHaveCount(0)
  })

  test('the sheet has no picture area and never says "Sample"', async ({
    page,
  }) => {
    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.plain.id)
    await garage.openDetails(S.bike.name)

    const sheet = garage.detailsSheet(S.bike.name)
    await expect(
      sheet.getByRole('heading', { name: S.bike.name })
    ).toBeVisible()
    await expect(sheet.getByTestId('service-icon-tile')).toHaveAttribute(
      'data-icon',
      'bike'
    )
    await expect(
      sheet.getByRole('button', { name: /^Open photo/ })
    ).toHaveCount(0)
    await expect(sheet.getByText('Sample image')).toHaveCount(0)
    await expect(sheet.getByText('No photos from this garage yet')).toHaveCount(
      0
    )
    // No points: the description reads exactly as written, and no list.
    await expect(
      sheet.getByText(S.bike.description, { exact: true })
    ).toBeVisible()
    await expect(garage.whatsIncluded(S.bike.name)).toHaveCount(0)
  })

  test('an AI picture never reaches a customer', async ({ page, request }) => {
    const res = await request.get(
      `${API}/api/v1/vendors/${TRUST_LOOK.plain.id}/services`
    )
    const body = await res.json()
    const ai = body.data.find((s: { id: string }) => s.id === S.aiOnly.id)
    expect(ai.media).toEqual([])
    expect(ai.images).toEqual([])
    const photo = body.data.find((s: { id: string }) => s.id === S.photo.id)
    expect(photo.media).toHaveLength(1)
    expect(photo.media[0]).toMatchObject({
      source: 'upload',
      url: TRUST_LOOK.media.photo.url,
    })

    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.plain.id)
    await garage.openDetails(S.aiOnly.name)
    const sheet = garage.detailsSheet(S.aiOnly.name)
    await expect(sheet.getByTestId('service-icon-tile')).toHaveAttribute(
      'data-icon',
      'coating'
    )
    await expect(
      sheet.getByRole('button', { name: /^Open photo/ })
    ).toHaveCount(0)
    await expect(sheet.getByText('From', { exact: true })).toHaveCount(0)
  })

  test("a service with the garage's photo keeps its media area", async ({
    page,
  }) => {
    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.plain.id)
    await garage.openDetails(S.photo.name)
    const sheet = garage.detailsSheet(S.photo.name)
    await expect(
      sheet.getByRole('button', { name: `Open photo 1 of ${S.photo.name}` })
    ).toBeVisible()
    await expect(sheet.getByText('From', { exact: true })).toBeVisible()
    await expect(sheet.getByTestId('service-icon-tile')).toHaveCount(0)
  })
})

test.describe("what's included @p0", () => {
  test('the card shows the first points and how many more', async ({
    page,
  }) => {
    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.plain.id)
    await expect(garage.detailsTrigger(S.points.name)).toContainText(
      'Deep vacuum · Seat shampoo · Dashboard polish +4'
    )
    // Not the raw description with its dashes.
    await expect(garage.detailsTrigger(S.points.name)).not.toContainText(
      '- Deep vacuum'
    )
  })

  test('the sheet ticks five points, and "+2 more" shows the rest', async ({
    page,
  }) => {
    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.plain.id)
    await garage.openDetails(S.points.name)

    const sheet = garage.detailsSheet(S.points.name)
    await expect(sheet.getByText(S.points.intro, { exact: true })).toBeVisible()

    const included = garage.whatsIncluded(S.points.name)
    await expect(
      included.getByRole('heading', { name: "What's included" })
    ).toBeVisible()
    const items = included.getByRole('listitem')
    await expect(items).toHaveText(S.points.points.slice(0, 5))
    // A green tick on each.
    await expect(included.locator('li svg')).toHaveCount(5)

    const more = included.getByRole('button', { name: '+2 more' })
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(items).toHaveText([...S.points.points])
    const less = included.getByRole('button', { name: 'Show less' })
    await expect(less).toHaveAttribute('aria-expanded', 'true')

    await less.click()
    await expect(items).toHaveCount(5)
    await expect(
      included.getByRole('button', { name: '+2 more' })
    ).toBeVisible()
  })

  test('a long unbroken point wraps on a 375px phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const garage = new GaragePage(page)
    await garage.goto(TRUST_LOOK.plain.id)
    await garage.openDetails(S.points.name)

    const included = garage.whatsIncluded(S.points.name)
    await included.getByRole('button', { name: '+2 more' }).click()
    const items = included.getByRole('listitem')
    await expect(items).toHaveText([...S.points.points])
    // Each point stays inside its row: nothing wider than the sheet.
    const overflow = await items.evaluateAll((rows) =>
      rows.map((row) => row.scrollWidth - row.clientWidth)
    )
    expect(overflow.every((px) => px <= 1)).toBe(true)
  })
})
