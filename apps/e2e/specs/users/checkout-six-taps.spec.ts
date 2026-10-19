/**
 * The booking path in six taps (UX audit F1): Home → Book a wash → the garage
 * → Add → Book Now → a time → Pay.
 *
 * It used to take eight: checkout asked for a day before it showed any time,
 * and for the car even when the customer has a default one. Now the earliest
 * day with a free time is already open, the default car is chosen, and the
 * price is on screen before the time is picked. Every tap is counted, so a
 * step that creeps back fails here.
 *
 * CUSTOMERS.sixTap owns this file: one default car, no address, no bookings.
 */
import type { Locator } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { bookingsForUser, countBookingsForUser, sql } from '../../support/db'
import { CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-sixTap') })

test.describe('the six-tap checkout @p0', () => {
  test('Home to a paid booking in six taps, the day and the car already picked', async ({
    page,
  }) => {
    const before = await countBookingsForUser(CUSTOMERS.sixTap.id)
    let taps = 0
    const tap = async (target: Locator) => {
      await target.click()
      taps++
    }

    await page.goto('/home')

    // 1. Book a wash, under the customer's car.
    await tap(page.getByRole('button', { name: 'Book a wash' }))
    await expect(page).toHaveURL(/\/garages$/)

    // 2. The garage.
    await tap(
      page
        .getByRole('link')
        .filter({
          has: page.getByRole('heading', {
            name: VENDORS.main.name,
            exact: true,
          }),
        })
        .first()
    )
    await expect(page).toHaveURL(new RegExp(`/garage/${VENDORS.main.id}`))

    // 3. Add, and 4. Book Now.
    const garage = new GaragePage(page)
    await tap(garage.addButton(SERVICES.wash.name))
    await tap(garage.bookButton())
    await expect(page).toHaveURL(
      new RegExp(`/book/${VENDORS.main.id}\\?service=${SERVICES.wash.id}`)
    )

    // Checkout opens with times already showing (no day to pick first), the
    // customer's car chosen, and the price in the bottom bar from the start.
    const checkout = new CheckoutPage(page)
    await expect(checkout.slots().first()).toBeVisible()
    await expect(checkout.vehicleCard(/Hyundai Venue/)).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(page.getByText(/Total\s*₹499/)).toBeVisible()
    await expect(checkout.cta()).toHaveText('Pick a time')

    // 5. A time.
    const slot = checkout.slots().first()
    await tap(slot)
    await expect(slot).toHaveAttribute('aria-pressed', 'true')

    // The reasons to trust it sit right above Pay (F4).
    await expect(
      page.getByText('Free cancel until the garage accepts')
    ).toBeVisible()
    await expect(page.getByText(/Secure payment by Razorpay/)).toBeVisible()

    // 6. Pay.
    await expect(checkout.cta()).toHaveText('Pay ₹499')
    await tap(checkout.cta())

    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)
    expect(taps).toBe(6)

    expect(await countBookingsForUser(CUSTOMERS.sixTap.id)).toBe(before + 1)
    const [created] = await bookingsForUser(CUSTOMERS.sixTap.id)
    expect(created.amount).toBe('499.00')
    // The car Home had on screen, never asked for again.
    const [row] = await sql<{ vendor_id: string; vehicle_id: string }[]>`
      select vendor_id, vehicle_id from bookings where id = ${created.id}
    `
    expect(row).toEqual({
      vendor_id: VENDORS.main.id,
      vehicle_id: CUSTOMERS.sixTap.vehicleId,
    })

    // The booking page leads with where it stands, in plain words (F3).
    await expect(
      page.getByRole('heading', {
        name: `Waiting for ${VENDORS.main.name} to accept`,
      })
    ).toBeVisible()
  })
})
