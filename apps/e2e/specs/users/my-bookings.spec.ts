/**
 * My bookings: Upcoming and Past.
 *
 * Reads CUSTOMERS.myBookings' fixtures at MAIN (see seedBookingRows), which
 * nothing writes: three bookings still to happen, two that are over, and two
 * that must be in neither tab — the old half of a move, and a booking retired
 * the old way as 'rescheduled'. Each is a different service, so a tab's order
 * reads straight off its cards. Which status goes where, and the ordering, are
 * unit-tested in packages/core/src/my-bookings.test.ts; this pins the screen.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { loginViaApi } from '../../support/auth'
import { BOOKINGS, CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

const tab = (page: Page, name: 'Upcoming' | 'Past') => page.getByRole('tab', { name })

/** The open tab's booking cards, by the service each one names, top to bottom. */
const cardServices = (page: Page) =>
  page
    .getByRole('tabpanel')
    .getByRole('link')
    .filter({ hasNotText: 'Book again' })
    .allInnerTexts()

test.describe('my bookings @p0', () => {
  test.use({ storageState: asRole('customer-myBookings') })

  test('Upcoming is the default: still to happen, soonest first', async ({ page }) => {
    await page.goto('/bookings')

    await expect(tab(page, 'Upcoming')).toHaveAttribute('aria-selected', 'true')
    // 08:00, then the 12:00 the Dent Assessment was moved to, then 15:00.
    await expect
      .poll(() => cardServices(page))
      .toEqual([SERVICES.wash.name, SERVICES.inspect.name, SERVICES.tiered.name])
    // Nothing to repeat on a booking that has not happened.
    await expect(page.getByRole('link', { name: /^Book again/ })).toHaveCount(0)
  })

  test('Past: over, most recent first, and neither half-move listed', async ({ page }) => {
    await page.goto('/bookings')
    await tab(page, 'Past').click()

    await expect(page).toHaveURL(/\/bookings\?tab=past$/)
    await expect(tab(page, 'Past')).toHaveAttribute('aria-selected', 'true')
    await expect
      .poll(() => cardServices(page))
      .toEqual([SERVICES.packageDeal.name, SERVICES.detail.name])

    const past = page.getByRole('tabpanel')
    // The 10:00 Dent Assessment was moved to 12:00: the customer's booking is
    // the new one, under Upcoming. Neither it nor the legacy 'rescheduled'
    // booking is a past booking of its own.
    await expect(past.getByText(SERVICES.inspect.name)).toHaveCount(0)
    await expect(past.getByText(SERVICES.inactive.name)).toHaveCount(0)
    // The declined one says so, as before.
    await expect(past.getByText('Cancelled').first()).toBeVisible()
  })

  test('the tab is kept in the URL, so Back from a booking returns to it', async ({ page }) => {
    await page.goto('/bookings')
    await tab(page, 'Past').click()
    await expect(page).toHaveURL(/\?tab=past$/)

    await page.getByRole('link', { name: new RegExp(`^${SERVICES.detail.name} at `) }).click()
    await expect(page).toHaveURL(`/bookings/${BOOKINGS.historyCompleted}`)
    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/bookings\?tab=past$/)
    await expect(tab(page, 'Past')).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => cardServices(page)).toContain(SERVICES.detail.name)

    // A link straight to Past opens on Past, and Upcoming is the bare URL.
    await page.goto('/bookings?tab=past')
    await expect(tab(page, 'Past')).toHaveAttribute('aria-selected', 'true')
    await tab(page, 'Upcoming').click()
    await expect(page).toHaveURL(/\/bookings$/)
  })

  test('the API marks the old half of a move, and only it', async () => {
    // A fresh login rather than the saved state: its access token lives 15
    // minutes from global setup, and with no page loaded nothing refreshes
    // it, so a late or retried run would get a 401 instead of the answer under
    // test. This number belongs to this file alone, so clearing its codes to
    // log in cannot race another spec.
    const customer = await loginViaApi(CUSTOMERS.myBookings.phone)
    try {
      const response = await customer.get('/api/v1/bookings/me')
      expect(response.status()).toBe(200)
      const { success, data } = (await response.json()) as {
        success: boolean
        data: Array<{ id: string; moved: boolean }>
      }
      expect(success).toBe(true)
      const moved = (id: string) => data.find((b) => b.id === id)?.moved
      expect(moved(BOOKINGS.historyMovedFrom)).toBe(true)
      expect(moved(BOOKINGS.historyMovedTo)).toBe(false)
      expect(moved(BOOKINGS.historyCompleted)).toBe(false)
    } finally {
      await customer.dispose()
    }
  })

  test('a booking still to happen offers no Book again', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.historyUpcomingLater}`)
    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Book again' })).toHaveCount(0)
  })
})

test.describe('my bookings, empty @p0', () => {
  // The browse customer has never booked, and nothing it runs books.
  test.use({ storageState: asRole('customer-browse') })

  test('each tab says it is empty, and Upcoming points at garages', async ({ page }) => {
    await page.goto('/bookings')

    await expect(page.getByRole('heading', { name: 'No upcoming bookings' })).toBeVisible()
    await page.getByRole('button', { name: 'Find garages' }).click()
    await expect(page).toHaveURL(/\/search$/)

    await page.goto('/bookings?tab=past')
    await expect(page.getByRole('heading', { name: 'No past bookings yet' })).toBeVisible()
  })
})
