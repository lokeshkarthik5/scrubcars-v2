/**
 * The regression net for commit 06d9f05 ("book several services in one
 * booking").
 *
 * That change made every derived value on checkout a function of the *set* of
 * selected services: the payable amount, the block of time the slot grid has
 * to fit, and whether an applied coupon is still valid. The failures worth
 * catching are the ones where one of those stops tracking the set — and none
 * of them are visible to a unit test, because they only appear once the cart,
 * the URL and the summary have to agree with each other.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-book') })

test.describe('multi-service cart @p0', () => {
  test('selecting three services carries all of them into checkout', async ({ page }) => {
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)

    await garage.add(SERVICES.wash.name)
    await expect(garage.toggle(SERVICES.wash.name)).toHaveAttribute('aria-pressed', 'true')

    await garage.add(SERVICES.detail.name)
    await garage.add(SERVICES.tiered.name)

    // The cart bar summarises the set rather than naming one service, and the
    // duration is the sum: 30 + 90 + 45 = 165 minutes.
    await expect(page.getByText('3 services · 2 hr 45 min')).toBeVisible()

    await garage.book()

    // Selection order is the contract between the two pages: the query string
    // is the only state that crosses, and the summary renders in this order.
    await expect(page).toHaveURL(
      `/book/${VENDORS.main.id}?service=${SERVICES.wash.id},${SERVICES.detail.id},${SERVICES.tiered.id}`
    )
  })

  test('the summary lists every service, and removing one reprices', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id, SERVICES.detail.id])

    await checkout.pickTomorrowSlot()
    await checkout.pickVehicle(/Maruti Swift/)

    // 499 + 1999. Subtotal only appears once there is more than one line.
    await expect(checkout.subtotal()).toBeVisible()
    await expect(checkout.removeLine(SERVICES.wash.name)).toBeVisible()
    await expect(checkout.removeLine(SERVICES.detail.name)).toBeVisible()
    await expect(checkout.cta()).toHaveText('Pay ₹2,498')

    await checkout.removeLine(SERVICES.wash.name).click()

    await expect(checkout.cta()).toHaveText('Pay ₹1,999')
    await expect(checkout.removeLine(SERVICES.wash.name)).toHaveCount(0)
    // One line is not a list: the subtotal row retires with it.
    await expect(checkout.subtotal()).toHaveCount(0)
  })

  test('the slot grid fits the summed duration, not the longest service', async ({ page }) => {
    const checkout = new CheckoutPage(page)

    // One 30-minute service against a 06:00–22:00 day: the last start that
    // still finishes by close is 21:30. The morning shows first, so the
    // evening is asked for.
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
    await checkout.pickTomorrow()
    await checkout.showAllTimes()
    await expect(checkout.slots().last()).toHaveText('9:30 pm')

    // Add 90 more minutes and the tail of the day stops being bookable: a
    // two-hour block has to start by 20:00.
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id, SERVICES.detail.id])
    await checkout.pickTomorrow()
    await checkout.showAllTimes()
    await expect(checkout.slots().last()).toHaveText('8:00 pm')
  })

  test('a package is one line, not its constituent services', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.packageDeal.id])

    await checkout.pickTomorrowSlot()
    await checkout.pickVehicle(/Maruti Swift/)

    // The package bundles Express Wash and Full Body Detail, but the customer
    // bought one thing: the summary shows the package, not its parts, and
    // charges the package price rather than 499 + 1999.
    const summary = page.getByRole('region', { name: 'Your booking' })
    await expect(summary).toContainText(SERVICES.packageDeal.name)
    await expect(summary).not.toContainText(SERVICES.wash.name)
    await expect(summary).not.toContainText(SERVICES.detail.name)

    // A single line has nothing to remove — emptying the cart from here is not
    // an offer the page makes — and nothing to subtotal.
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0)
    await expect(checkout.subtotal()).toHaveCount(0)
    await expect(checkout.cta()).toHaveText('Pay ₹2,299')
  })
})
