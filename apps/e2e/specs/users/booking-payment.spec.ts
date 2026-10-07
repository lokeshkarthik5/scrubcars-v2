/**
 * Checkout through to a persisted booking, and the ways it can fail.
 *
 * Nothing is written until the gateway callback returns: createBookingIntent
 * prices and validates, but holds no slot and no claim on the car. So the
 * assertions here are as much about what is *not* in the database after a
 * cancelled payment as about what is there after a successful one.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { setPaymentMode, lastPaymentOptions } from '../../support/network'
import {
  bookingsForUser,
  countBookingsForUser,
  getBooking,
  getBookingItems,
  getPayment,
  countRedemptions,
} from '../../support/db'
import { CUSTOMERS, DISCOUNTS, SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-book') })

test.describe('payment @p0', () => {
  test('paying writes a booking, its lines, its payment and its redemption', async ({ page }) => {
    const before = await countBookingsForUser(CUSTOMERS.book.id)

    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id, SERVICES.detail.id])
    await checkout.pickTomorrowSlot()
    await checkout.pickVehicle(/Maruti Swift/)
    await checkout.applyPromo(DISCOUNTS.percentCapped.code)
    await checkout.closePromo()

    await expect(checkout.cta()).toHaveText('Pay ₹2,298')
    await checkout.pay()

    // The success burst is keyed off ?celebrate=1, which the page strips once
    // it has played — so this asserts arrival, not a lingering query string.
    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)

    // The amount handed to the gateway is in paise and must match the sheet.
    const options = await lastPaymentOptions(page)
    expect(options?.amount).toBe(229800)
    expect(String(options?.order_id)).toMatch(/^order_e2e_/)

    expect(await countBookingsForUser(CUSTOMERS.book.id)).toBe(before + 1)

    const [created] = await bookingsForUser(CUSTOMERS.book.id)
    // 2498 − 200 (the cap, not the full 20%).
    expect(created.subtotal_amount).toBe('2498.00')
    expect(created.discount_amount).toBe('200.00')
    expect(created.amount).toBe('2298.00')
    expect(created.discount_code).toBe(DISCOUNTS.percentCapped.code)
    expect(created.discount_funded_by).toBe('platform')

    const items = await getBookingItems(created.id)
    expect(items.map((i) => i.service_id)).toEqual([SERVICES.wash.id, SERVICES.detail.id])
    // Line amounts are snapshots, so a later price change cannot rewrite history.
    expect(items.map((i) => i.amount)).toEqual(['499.00', '1999.00'])

    const payment = await getPayment(created.id)
    expect(payment.status).toBe('paid')
    expect(payment.amount).toBe('2298.00')

    // Exactly one redemption — a second would let the code be spent twice.
    expect(await countRedemptions(created.id)).toBe(1)
  })

  test('a confirm lost to the network is retried, and Pay is never offered again', async ({ page }) => {
    const before = await countBookingsForUser(CUSTOMERS.book.id)

    // The first confirm dies on the way, as on a train going into a tunnel;
    // the retry a second later gets through.
    let verifyCalls = 0
    await page.route('**/api/v1/payments/verify', async (route) => {
      verifyCalls++
      if (verifyCalls === 1) return route.abort('failed')
      return route.fallback()
    })

    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
    await checkout.pickTomorrowSlot()
    // Not the Swift: the first test books it at this same first slot, and a
    // car cannot be in two bookings at once.
    await checkout.pickVehicle(/Honda City/)
    await checkout.pay()

    // The money is taken, so the button says so and cannot be pressed.
    await expect(checkout.cta()).toHaveText('Payment received — confirming your booking…')
    await expect(checkout.cta()).toBeDisabled()

    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)
    expect(verifyCalls).toBe(2)
    // One sheet, one booking: the customer was never asked to pay twice.
    expect(
      await page.evaluate(
        () => (window as unknown as { __e2ePayment: { openCount: number } }).__e2ePayment.openCount
      )
    ).toBe(1)
    expect(await countBookingsForUser(CUSTOMERS.book.id)).toBe(before + 1)
  })

  test('dismissing the sheet books nothing at all', async ({ page }) => {
    const before = await countBookingsForUser(CUSTOMERS.book.id)

    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
    await checkout.pickTomorrowSlot()
    await checkout.pickVehicle(/Maruti Swift/)

    await setPaymentMode(page, 'dismiss')
    await checkout.pay()

    await expect(page.getByText('Payment cancelled. Nothing was booked.')).toHaveCount(1)
    await expect(page).toHaveURL(/\/book\//)

    // The message has to be true: an intent exists, a booking must not.
    expect(await countBookingsForUser(CUSTOMERS.book.id)).toBe(before)
  })

  test('a declined card surfaces the gateway message and books nothing', async ({ page }) => {
    const before = await countBookingsForUser(CUSTOMERS.book.id)

    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
    await checkout.pickTomorrowSlot()
    await checkout.pickVehicle(/Maruti Swift/)

    await setPaymentMode(page, 'fail')
    await checkout.pay()

    // Exactly one toast. The message used to arrive twice — the checkout sheet
    // reported it through onFailure and then rejected, and handleConfirm's
    // catch reported the same Error again.
    await expect(page.getByText('Your card was declined.')).toHaveCount(1)
    expect(await countBookingsForUser(CUSTOMERS.book.id)).toBe(before)
  })

  test('the CTA names the next missing step and goes to it', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])

    // A "Pay" button that cannot be pressed explains nothing; the step that is
    // missing does. This customer owns three cars, so nothing is preselected
    // and the car step is a real question.
    await expect(checkout.cta()).toHaveText('Pick a time')
    await checkout.pickTomorrowSlot()
    await expect(checkout.cta()).toHaveText('Choose your car')

    // Tapping it takes the customer to the step instead of doing nothing —
    // and never towards payment, which is what the label promises.
    await checkout.cta().click()
    await expect(page.getByRole('heading', { name: 'Car details' })).toBeInViewport()
    await expect(page).toHaveURL(/\/book\//)

    await checkout.pickVehicle(/Maruti Swift/)
    await expect(checkout.cta()).toHaveText('Pay ₹499')
  })

  test('an on-inspection service charges its inspection fee upfront', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.inspect.id])
    await checkout.pickTomorrowSlot()
    await checkout.pickVehicle(/Maruti Swift/)

    // on_inspection is not "unpriced": the customer pays a fixed inspection
    // fee now and the repair itself is quoted afterwards. resolveServiceAmount
    // returns `price` for this type, so the CTA asks for payment as normal.
    await expect(checkout.cta()).toHaveText('Pay ₹299')
  })
})
