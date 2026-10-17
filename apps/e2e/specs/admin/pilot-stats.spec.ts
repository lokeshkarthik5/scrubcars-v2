/**
 * The pilot numbers: an admin-only read of counts over the last 7 or 30 days,
 * and the card under the Statistics page's Overview that shows them.
 *
 * Counts are asserted as shapes and floors, never exact totals: other specs
 * book, pay and cancel in parallel, so the totals move while this runs.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { CUSTOMERS } from '../../support/seed-ids'

const STATS = `${API}/api/v1/admin/stats/pilot`

test.use({ storageState: asRole('admin') })

test.describe('pilot numbers @p0', () => {
  test('an admin reads the numbers for either window', async ({ page }) => {
    for (const days of [7, 30]) {
      const response = await page.request.get(`${STATS}?days=${days}`)
      expect(response.status()).toBe(200)
      const { success, data } = await response.json()
      expect(success).toBe(true)
      expect(data.days).toBe(days)

      for (const key of [
        'checkoutsStarted',
        'paid',
        'paidNoBooking',
        'accepted',
        'completed',
        'cancelledByCustomer',
        'cancelledByGarage',
        'cancelledByDetlio',
        'customerNoShows',
        'garageNoShows',
        'revenue',
        'acceptSamples',
        'refundsOwed',
        'refundsOwedAmount',
        'refunded',
        'refundedAmount',
      ]) {
        expect(typeof data[key], key).toBe('number')
      }
      // A median of accept times, or null while there are under three.
      expect(
        data.medianAcceptMins === null || typeof data.medianAcceptMins === 'number'
      ).toBe(true)
      if (data.acceptSamples < 3) expect(data.medianAcceptMins).toBeNull()
      // The seed's failed checkout (BOOKING_INTENTS.failed) was opened today.
      expect(data.paidNoBooking).toBeGreaterThanOrEqual(1)
      expect(data.checkoutsStarted).toBeGreaterThanOrEqual(data.paid + data.paidNoBooking)
      // Owed refunds are a to-do list, not a window: the seed leaves several
      // (BOOKINGS.refundDetlioStays, refundGarageNoShow, the failed checkouts)
      // whatever else has been recorded by the time this runs.
      expect(data.refundsOwed).toBeGreaterThanOrEqual(2)
      expect(data.refundsOwedAmount).toBeGreaterThan(0)
      expect(Array.isArray(data.topGarages)).toBe(true)
      expect(data.topGarages.length).toBeLessThanOrEqual(5)
    }
  })

  test('only the two windows the card offers', async ({ page }) => {
    expect((await page.request.get(`${STATS}?days=14`)).status()).toBe(400)
  })

  test('a signed-in customer cannot read them', async () => {
    // A fresh login, not the saved customer state: this file runs after the
    // users and vendors projects, by when that 15-minute token has usually
    // expired — and a 401 from an expired token would pass a weaker check
    // even if the route had lost its admin guard.
    const customer = await loginViaApi(CUSTOMERS.pilotStats.phone)
    expect((await customer.get(`${API}/api/v1/auth/me`)).status()).toBe(200)

    const response = await customer.get(STATS)
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Admin access required',
      code: 'ADMIN_REQUIRED',
    })
    await customer.dispose()
  })

  test('the card is on Statistics, with a 7 / 30 day switch', async ({ page }) => {
    await page.goto('/statistics')

    await expect(page.getByRole('heading', { name: 'Pilot numbers' })).toBeVisible()
    await expect(page.getByText('Checkouts started')).toBeVisible()

    await page.getByRole('radio', { name: '30 days' }).click()
    await expect(page.getByRole('radio', { name: '30 days' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Paid, no booking')).toBeVisible()
    // Exact: a loose match would also find the hints that mention refunds.
    await expect(page.getByText('Refunds owed', { exact: true })).toBeVisible()
    await expect(page.getByText('Collected, less refunds owed', { exact: true })).toBeVisible()
    // It follows none of the page's filters, and says so.
    await expect(page.getByText(/^All garages · the last 30 days to now, not the filters above/)).toBeVisible()
    // The accept time is a figure now, not a note saying it can't be shown.
    await expect(page.getByText('Payment to accept')).toBeVisible()
  })
})
