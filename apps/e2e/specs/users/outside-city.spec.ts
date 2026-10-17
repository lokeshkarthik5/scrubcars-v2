/**
 * The "Outside Chennai" sign (owner decision, 2026-10-16): garages in other
 * towns are part of the pilot, and each one says plainly that it is not in
 * Chennai, on its card, on its page and at checkout, so nobody books one by
 * mistake. A sign only: such a garage is listed and booked as any other.
 *
 * VENDORS.homePromo is pinned in Vellore, 124.7 km from ORIGIN (the Chennai
 * centre); MAIN sits on ORIGIN. VENDORS.refunds says Chennai but is pinned
 * 52.6 km out, just past the 50 km line, so its sign names no town and its
 * page gives no figure.
 *
 * Read-only, apart from two unpinned garages made and removed in their own
 * test.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { CheckoutPage } from '../../pages/checkout.page'
import { sql } from '../../support/db'
import { SERVICES, STAFF, VENDORS } from '../../support/seed-ids'

type Outside = { town: string | null; km: number | null } | null
type Listed = { id: string; outsideServiceCity: Outside }

async function garage(request: APIRequestContext, id: string) {
  const response = await request.get(`${API}/api/v1/vendors/${id}`)
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.success).toBe(true)
  return body.data as { id: string; outsideServiceCity: Outside }
}

/** A typed search, with no location: no radius, every town. */
async function search(
  request: APIRequestContext,
  q: string
): Promise<Listed[]> {
  const response = await request.get(`${API}/api/v1/vendors`, {
    params: { q, limit: 50 },
  })
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.success).toBe(true)
  return body.data.items as Listed[]
}

test.describe('outside Chennai, in the API @p0', () => {
  test('a garage in another town carries its town and how far out it is', async ({
    request,
  }) => {
    const vellore = { town: 'Vellore', km: 125 }
    expect(
      (await garage(request, VENDORS.homePromo.id)).outsideServiceCity
    ).toEqual(vellore)

    const listed = (await search(request, VENDORS.homePromo.name)).find(
      (item) => item.id === VENDORS.homePromo.id
    )
    expect(listed?.outsideServiceCity).toEqual(vellore)
  })

  test('a garage in Chennai carries no sign', async ({ request }) => {
    expect(
      (await garage(request, VENDORS.main.id)).outsideServiceCity
    ).toBeNull()
    const listed = (await search(request, VENDORS.main.name)).find(
      (item) => item.id === VENDORS.main.id
    )
    expect(listed).toBeDefined()
    expect(listed!.outsideServiceCity).toBeNull()
  })

  test('past 50 km with a city that says Chennai: outside, with no town named', async ({
    request,
  }) => {
    expect(
      (await garage(request, VENDORS.refunds.id)).outsideServiceCity
    ).toEqual({
      town: null,
      km: 53,
    })
  })

  test('a garage with no pin is signed from its city field: town, no km', async ({
    request,
  }) => {
    // Unpinned garages are still listed (after the pinned ones, even to a
    // customer in Chennai), so one that says it is in Sivakasi must carry
    // the sign. One typed as a Chennai suburb with a Chennai pincode must not.
    const suffix = Date.now().toString().slice(-5)
    const away = `E2E Unpinned Town ${suffix}`
    const suburb = `E2E Unpinned Suburb ${suffix}`
    const rows = await sql<{ id: string; business_name: string }[]>`
      insert into vendors (owner_id, business_name, phone, address, city, pincode,
                           geo_source, is_verified, doorstep_enabled, dropin_enabled, status)
      values (${STAFF.narrowOwner.id}, ${away}, '9000007779', '4, No Pin Street',
              'Sivakasi', '626123', 'unset', true, false, true, 'active'),
             (${STAFF.narrowOwner.id}, ${suburb}, '9000007780', '5, No Pin Street',
              'Tambaram', '600045', 'unset', true, false, true, 'active')
      returning id, business_name
    `
    const idOf = (name: string) =>
      rows.find((row) => row.business_name === name)!.id
    try {
      const sivakasi = { town: 'Sivakasi', km: null }
      const listed = (await search(request, away)).find(
        (item) => item.id === idOf(away)
      )
      expect(listed).toBeDefined()
      expect(listed!.outsideServiceCity).toEqual(sivakasi)
      expect((await garage(request, idOf(away))).outsideServiceCity).toEqual(
        sivakasi
      )

      const tambaram = (await search(request, suburb)).find(
        (item) => item.id === idOf(suburb)
      )
      expect(tambaram).toBeDefined()
      expect(tambaram!.outsideServiceCity).toBeNull()
    } finally {
      await sql`delete from vendors where id in ${sql(rows.map((row) => row.id))}`
    }
  })
})

test.describe('outside Chennai, on screen @p0', () => {
  // Signed in for checkout; no location (the fixtures dismiss the prompt with
  // none stored), so a search reaches every town.
  test.use({ storageState: asRole('customer-browse') })

  const SIGN = 'Outside Chennai · Vellore'

  test('the card says so in a search made without a location', async ({
    page,
  }) => {
    await page.goto('/search')
    const box = page.getByRole('searchbox', {
      name: 'Search garages or services',
    })

    await box.fill(VENDORS.homePromo.name)
    const card = page.getByRole('link').filter({
      has: page.getByRole('heading', { name: VENDORS.homePromo.name }),
    })
    await expect(card).toContainText(SIGN)

    // A Chennai garage's card has no sign.
    await box.fill(VENDORS.main.name)
    const main = page
      .getByRole('link')
      .filter({
        has: page.getByRole('heading', {
          name: VENDORS.main.name,
          exact: true,
        }),
      })
      .first()
    await expect(main).toBeVisible()
    await expect(main).not.toContainText('Outside Chennai')
  })

  test('the garage page says where it is, in a plain line', async ({
    page,
  }) => {
    await page.goto(`/garage/${VENDORS.homePromo.id}`)
    await expect(
      page.getByText('This garage is in Vellore, about 125 km from Chennai.')
    ).toBeVisible()

    // A garage whose own city says Chennai, pinned just past the line: the
    // plain words, and no figure to set against the "Chennai" above them.
    await page.goto(`/garage/${VENDORS.refunds.id}`)
    await expect(
      page.getByText('This garage is outside Chennai.')
    ).toBeVisible()
    await expect(page.getByText(/km from Chennai/)).toHaveCount(0)

    await page.goto(`/garage/${VENDORS.main.id}`)
    await expect(
      page.getByRole('heading', { name: VENDORS.main.name, exact: true })
    ).toBeVisible()
    await expect(page.getByText(/This garage is (in|outside)/)).toHaveCount(0)
  })

  test('checkout says it once more above Pay, and blocks nothing', async ({
    page,
  }) => {
    await page.goto(
      `/book/${VENDORS.homePromo.id}?service=${SERVICES.homePromoWash.id}`
    )
    await expect(
      page.getByText('This garage is in Vellore, not Chennai.')
    ).toBeVisible()

    // Informational: the main action is there and live, asking for the next
    // step as it would for any garage. It carries the line in its
    // description, for a screen reader that jumps straight to it.
    const cta = new CheckoutPage(page).cta()
    await expect(cta).toHaveAccessibleDescription(
      /^This garage is in Vellore, not Chennai\./
    )
    await expect(cta).toHaveText(/^Pick a time/)
    await expect(cta).toBeEnabled()
  })
})
