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

    await expect(checkout.cta()).toHaveText('Pay Now (₹2,298)')
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

  test('an on-inspection service charges its inspection fee upfront', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.inspect.id])
    await checkout.pickTomorrowSlot()
    await checkout.pickVehicle(/Maruti Swift/)

    // on_inspection is not "unpriced": the customer pays a fixed inspection
    // fee now and the repair itself is quoted afterwards. resolveServiceAmount
    // returns `price` for this type, so the CTA is a normal Pay Now.
    await expect(checkout.cta()).toHaveText('Pay Now (₹299)')
  })
})
