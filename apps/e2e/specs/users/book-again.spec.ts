/**
 * Book again: from a booking that is over to checkout at the same garage,
 * with the same services in the same order and the same mode.
 *
 * Reads CUSTOMERS.bookAgain's fixtures at MAIN (see seedBookingRows), all
 * over, and never pays, so nothing here writes. The link itself and how
 * checkout reads it are unit-tested in packages/core/src/book-again.test.ts;
 * this pins that the screens agree with each other.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { BOOKINGS, SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-bookAgain') })

// A doorstep booking reopens on the address it went to; that address is
// the customer's saved one, whose id the seed doesn't fix.
const REBOOK_DOORSTEP = new RegExp(
  `/book/${VENDORS.main.id}\\?service=${SERVICES.detail.id},${SERVICES.wash.id}&mode=doorstep&address=[0-9a-f-]{36}$`
)

test.describe('book again @p0', () => {
  test('opens checkout with the same services, in order, and the same mode', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.rebookDoorstep}`)
    await page.getByRole('link', { name: 'Book again' }).click()

    await expect(page).toHaveURL(REBOOK_DOORSTEP)
    const checkout = new CheckoutPage(page)
    await expect(checkout.bookingType('Doorstep')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(`${SERVICES.detail.name} + 1 more`)).toBeVisible()
    // Nothing was left out, so nothing says so.
    await expect(page.getByText('Some services are no longer offered')).toHaveCount(0)

    // The summary lists them in the booking's order, not the menu's.
    await checkout.pickTomorrowSlot()
    const lines = page.getByRole('button', { name: /^Remove / })
    await expect(lines).toHaveCount(2)
    await expect(lines.nth(0)).toHaveAccessibleName(`Remove ${SERVICES.detail.name}`)
    await expect(lines.nth(1)).toHaveAccessibleName(`Remove ${SERVICES.wash.name}`)
    // 1999 + 499, at the prices the garage charges today.
    await expect(checkout.cta()).toHaveText('Pay ₹2,498')
  })

  test('each card under Past offers it too', async ({ page }) => {
    await page.goto('/bookings?tab=past')
    await page
      .getByRole('link', {
        name: `Book again: ${SERVICES.detail.name} + 1 more at ${VENDORS.main.name}`,
      })
      .click()

    await expect(page).toHaveURL(REBOOK_DOORSTEP)
  })

  test('a service the garage has withdrawn is left out, and the page says so', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.rebookPartlyRetired}`)
    await page.getByRole('link', { name: 'Book again' }).click()

    await expect(page).toHaveURL(
      `/book/${VENDORS.main.id}?service=${SERVICES.wash.id},${SERVICES.inactive.id}`
    )
    await expect(page.getByText('Some services are no longer offered')).toBeVisible()
    await expect(page.getByText(SERVICES.wash.name).first()).toBeVisible()
    await expect(page.getByText(SERVICES.inactive.name)).toHaveCount(0)
  })

  test('when nothing on it is offered any more, it opens the garage to pick from', async ({
    page,
  }) => {
    await page.goto(`/bookings/${BOOKINGS.rebookAllRetired}`)
    await page.getByRole('link', { name: 'Book again' }).click()

    await expect(page).toHaveURL(`/garage/${VENDORS.main.id}?withdrawn=1`)
    // On the page, not a toast: it is still there once the garage has loaded.
    await expect(
      page.getByRole('status').filter({ hasText: 'The services you picked are no longer offered here.' })
    ).toBeVisible()
    // Nothing was put in a cart in its place: no Book bar until they pick.
    await expect(new GaragePage(page).bookButton()).toHaveCount(0)
  })

  test('a paused garage says so at checkout, not as an error', async ({ page }) => {
    await page.goto(`/book/${VENDORS.paused.id}?service=${SERVICES.pausedWash.id}`)

    await expect(page.getByText('Not taking bookings right now')).toBeVisible()
    await expect(page.getByText('Closed for renovation')).toBeVisible()
  })
})
