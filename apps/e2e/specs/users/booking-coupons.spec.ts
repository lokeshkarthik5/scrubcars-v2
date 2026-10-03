/**
 * Discount application at checkout.
 *
 * The subtle case — and the reason this is P0 — is that an applied code is
 * validated against a specific cart and vehicle. Checkout derives that rather
 * than syncing it in an effect: `appliedDiscount` is compared against a
 * `serviceKey` built from the selected ids. Remove a line and the code must
 * retire itself, or the customer sees a saving the server will refuse at pay
 * time.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { DISCOUNTS, SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-coupons') })

/** Opens checkout with a cart already priced above every seeded minimum. */
async function checkoutWith(page: import('@playwright/test').Page, serviceIds: string[]) {
  const checkout = new CheckoutPage(page)
  await checkout.goto(VENDORS.main.id, serviceIds)
  await checkout.pickTomorrowSlot()
  await checkout.pickVehicle(/Hyundai i20/)
  return checkout
}

test.describe('coupons @p0', () => {
  test('a percentage code applies and stops at its cap', async ({ page }) => {
    const checkout = await checkoutWith(page, [SERVICES.wash.id, SERVICES.detail.id])
    await expect(checkout.cta()).toHaveText('Pay ₹2,498')

    await checkout.applyPromo(DISCOUNTS.percentCapped.code)

    // 20% of 2498 is 499.60, but the code caps at 200 — so the customer pays
    // 2298, not 1998. The cap is the whole point of this fixture.
    await expect(checkout.appliedBanner(DISCOUNTS.percentCapped.code)).toBeVisible()
    await expect(checkout.discountRow(DISCOUNTS.percentCapped.code)).toBeVisible()
    await expect(checkout.cta()).toHaveText('Pay ₹2,298')
  })

  test('removing a service retires the code applied to the old cart', async ({ page }) => {
    const checkout = await checkoutWith(page, [SERVICES.wash.id, SERVICES.detail.id])
    await checkout.applyPromo(DISCOUNTS.percentCapped.code)
    await expect(checkout.cta()).toHaveText('Pay ₹2,298')

    await checkout.removeLine(SERVICES.wash.name).click()

    // The cart the code was priced against no longer exists. It must drop
    // immediately rather than survive until the server rejects it.
    await expect(checkout.discountRow(DISCOUNTS.percentCapped.code)).toHaveCount(0)
    await expect(checkout.cta()).toHaveText('Pay ₹1,999')
  })

  test('a fixed code below its minimum order is refused', async ({ page }) => {
    // 499 is under the code's ₹1000 floor.
    const checkout = await checkoutWith(page, [SERVICES.wash.id])
    await checkout.applyPromo(DISCOUNTS.fixedMinOrder.code)

    // The message names the threshold; a generic "invalid code" would leave
    // the customer with no way to act on it.
    await expect(checkout.promoError()).toHaveText(
      'This code needs a booking of ₹1,000 or more.'
    )
    await expect(checkout.cta()).toHaveText('Pay ₹499')
  })

  test('expired, other-vendor and exhausted codes are all refused', async ({ page }) => {
    const checkout = await checkoutWith(page, [SERVICES.wash.id, SERVICES.detail.id])

    for (const code of [
      DISCOUNTS.expired.code,          // endsAt in the past
      DISCOUNTS.otherVendor.code,      // scoped to a different garage
      DISCOUNTS.exhaustedTotal.code,   // totalUsageLimit already spent
      DISCOUNTS.exhaustedPerUser.code, // this customer has already used it
    ]) {
      await checkout.applyPromo(code)

      await expect(checkout.promoError(), `${code} should be refused`).toBeVisible()
      // No discount row, and the total is untouched.
      await expect(checkout.appliedBanner(code)).toHaveCount(0)
      await expect(checkout.cta()).toHaveText('Pay ₹2,498')
    }
  })
})
