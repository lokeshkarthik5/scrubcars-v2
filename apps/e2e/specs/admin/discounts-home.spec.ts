/**
 * "Show on Home" on the discount form: the section, the live preview beside
 * it, the targeted audiences (on in this stack: HOME_OFFER_TARGETING=on in
 * .env.e2e), and the window saved as India time whatever the browser's zone.
 * The disabled state with targeting off is unit-tested
 * (packages/core/src/home-offer-form.test.ts), since this stack runs with it
 * on.
 *
 * Every code made here starts a month from now and is deleted at the end:
 * a live Show-on-Home code would land on every customer's Home in the specs
 * running alongside.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { VENDORS } from '../../support/seed-ids'

const DAY = 24 * 60 * 60 * 1000
const IST_OFFSET_MS = 330 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The IST calendar date `days` from today, as "YYYY-MM-DD". */
function istDateKey(days: number): string {
  return new Date(Date.now() + days * DAY + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** What a datetime-local field holding `key` at `time` IST means, as an instant. */
function istInstant(key: string, time: string): string {
  return new Date(Date.parse(`${key}T${time}:00Z`) - IST_OFFSET_MS).toISOString()
}

/** "Till Sat 17 Oct" for a code that ends at the very start of `key` (IST). */
function tillDayBefore(key: string): string {
  const before = new Date(Date.parse(`${key}T00:00:00Z`) - DAY)
  return `Till ${WEEKDAYS[before.getUTCDay()]} ${before.getUTCDate()} ${MONTHS[before.getUTCMonth()]}`
}

// A browser that is not on India time (playwright.config.ts puts every
// project on Asia/Kolkata), so the starts_at / ends_at checks below prove the
// form converts from IST rather than passing because the two zones agree.
// Nothing else here reads the browser's zone: the "Till" label and the IST
// dates are worked out in Node.
test.use({ storageState: asRole('admin'), timezoneId: 'America/Los_Angeles' })

test.describe('discount form: Show on Home @p0', () => {
  test('the preview follows the form, and the window is saved as IST', async ({ page }) => {
    const code = `E2EHOME${Date.now().toString().slice(-6)}`
    const startKey = istDateKey(30)
    const endKey = istDateKey(37)

    try {
      await page.goto('/discounts/new')
      await page.locator('#code').fill(code)
      await page.locator('#percentOff').fill('20')
      await page.locator('#maxDiscountAmount').fill('300')
      await page.locator('#startsAt').fill(`${startKey}T10:00`)

      await page.getByRole('switch', { name: 'Show this offer on Home' }).click()
      const create = page.getByRole('button', { name: 'Create discount' })

      // An offer on Home needs an end date, and says so before the server does.
      await expect(page.getByText('An offer on Home needs an end date, so the card can say when it ends.')).toBeVisible()
      await expect(create).toBeDisabled()

      await page.locator('#endsAt').fill(`${endKey}T00:00`)
      await page.locator('#homeTitle').fill('20% off any service')
      await page.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'High' }).click()

      // The coupon a customer will get, with the small print the server writes.
      const preview = page.getByRole('complementary', { name: 'Preview on Home' })
      await expect(preview).toContainText('20% off any service')
      await expect(preview).toContainText('Detlio · Offer')
      await expect(preview).toContainText('Up to ₹300')
      await expect(preview).toContainText(tillDayBefore(endKey))
      await expect(preview).toContainText(code)
      await expect(preview.locator('.offer-coupon__figure').first()).toHaveText('20%')
      await expect(preview).toContainText('Garage list, code applied at checkout')
      // It starts in a month, so it is not on Home yet.
      await expect(preview).toContainText('High · not live yet')
      await expect(preview).toContainText(/Estimated reach: [\d,]+ customers?/)
      await expect(preview).toContainText('Everyone signed in, counted now')

      // Live as you type.
      await page.locator('#percentOff').fill('25')
      await page.locator('#homeTitle').fill('25% off any service')
      await expect(preview.locator('.offer-coupon__figure').first()).toHaveText('25%')
      await expect(preview).toContainText('25% off any service')

      await expect(create).toBeEnabled()
      await create.click()
      await expect(page).toHaveURL(/\/discounts$/)

      const [row] = await sql<
        {
          show_on_home: boolean
          home_title: string
          home_priority: number
          home_audience: string
          starts_at: Date
          ends_at: Date
        }[]
      >`
        select show_on_home, home_title, home_priority, home_audience, starts_at, ends_at
          from discounts where lower(code) = lower(${code})
      `
      expect(row).toMatchObject({
        show_on_home: true,
        home_title: '25% off any service',
        home_priority: 1,
        home_audience: 'everyone',
      })
      // 10:00 and midnight in India, not in whatever zone the browser runs.
      expect(row.starts_at.toISOString()).toBe(istInstant(startKey, '10:00'))
      expect(row.ends_at.toISOString()).toBe(istInstant(endKey, '00:00'))

      // The list marks it.
      await page.getByRole('searchbox', { name: 'Search discounts' }).fill(code)
      await expect(page.getByText('On Home', { exact: true })).toBeVisible()
    } finally {
      await sql`delete from discounts where lower(code) = lower(${code})`
    }
  })

  test("a targeted audience: near the code's garage, saved with its distance", async ({ page }) => {
    const code = `E2ENEAR${Date.now().toString().slice(-6)}`

    try {
      await page.goto('/discounts/new')
      await page.locator('#code').fill(code)
      await page.locator('#discountType').selectOption('fixed')
      await page.locator('#amountOff').fill('75')
      await page.locator('#startsAt').fill(`${istDateKey(30)}T09:00`)
      await page.locator('#endsAt').fill(`${istDateKey(40)}T00:00`)
      await page.getByRole('switch', { name: 'Show this offer on Home' }).click()
      await page.locator('#homeTitle').fill('₹75 off a wash')

      // Targeting is on here, but the garage audiences wait for a garage.
      const near = page.getByRole('radio', { name: /Customers near this garage/ })
      await expect(near).toBeDisabled()
      await expect(page.getByText('Pick a garage above').first()).toBeVisible()
      await expect(page.getByRole('radio', { name: /Customers whose wash is due or overdue/ })).toBeEnabled()

      await page.locator('#vendorId').selectOption(VENDORS.homePromo.id)
      await expect(near).toBeEnabled()
      await near.check()
      await page.locator('#homeAudienceRadiusKm').fill('5')

      const preview = page.getByRole('complementary', { name: 'Preview on Home' })
      await expect(preview).toContainText(`${VENDORS.homePromo.name} · Offer`)
      await expect(preview).toContainText(`${VENDORS.homePromo.name}, code applied at checkout`)
      await expect(preview.locator('.offer-coupon__figure').first()).toHaveText('₹75')
      await expect(preview).toContainText(/Estimated reach: [\d,]+ customers?/)
      await expect(preview).toContainText('saved address within 5 km')

      await page.getByRole('button', { name: 'Create discount' }).click()
      await expect(page).toHaveURL(/\/discounts$/)

      const [row] = await sql<
        { home_audience: string; home_audience_radius_km: number; vendor_id: string; show_on_home: boolean }[]
      >`
        select home_audience, home_audience_radius_km, vendor_id, show_on_home
          from discounts where lower(code) = lower(${code})
      `
      expect(row).toEqual({
        home_audience: 'near_this_garage',
        home_audience_radius_km: 5,
        vendor_id: VENDORS.homePromo.id,
        show_on_home: true,
      })
    } finally {
      await sql`delete from discounts where lower(code) = lower(${code})`
    }
  })
})
