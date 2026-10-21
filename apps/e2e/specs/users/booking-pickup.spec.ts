/**
 * Pickup & drop checkout (0037).
 *
 * The garage collects the car from the customer's address, works on it at the
 * garage and brings it back. What sets it apart from doorstep is the handover:
 * the booking is written with two 4-digit codes, and only the customer's own
 * booking page shows them — the pickup code first, the delivery code only once
 * the car has been collected. The address is snapshotted onto the row like a
 * doorstep job's, because it is where the driver is sent.
 *
 * VENDORS.pickup offers it (pickup 'yes' with the responsibility terms on
 * file), within 8 km of its pin; CUSTOMERS.pickup's default address is ~1.7 km
 * away. Nothing else books that garage.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { BookingPage } from '../../pages/booking.page'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { sql } from '../../support/db'
import { CUSTOMERS, PICKUP_HOME, SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-pickup') })

/** The handover steps, in order, as the customer's timeline names them. */
const STEPS = ['Booked', 'Picked up', 'At garage', 'Being worked on', 'Out for delivery', 'Delivered']

/**
 * A summary row holding both texts: the innermost element that contains the
 * label and the value. Ancestors come before descendants in document order,
 * so the last match is the row itself.
 */
const summaryRow = (page: Page, label: string, value: string) =>
  page
    .locator('*')
    .filter({ has: page.getByText(label, { exact: true }) })
    .filter({ has: page.getByText(value, { exact: true }) })
    .last()

test.describe('pickup & drop booking', () => {
  test('books pickup to the default address and shows the pickup code @p0', async ({ page }) => {
    // ── the garage page: the mode, then the service ─────────────────────────
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.pickup.id)

    // At the garage and pickup & drop: two modes, so the switch renders.
    await garage.mode('Pickup & drop').click()
    await expect(garage.mode('Pickup & drop')).toHaveAttribute('aria-checked', 'true')
    await garage.add(SERVICES.pickupWash.name)
    await garage.book()

    await expect(page).toHaveURL(new RegExp(`/book/${VENDORS.pickup.id}\\?.*\\bmode=pickup\\b`))

    // ── checkout ────────────────────────────────────────────────────────────
    const checkout = new CheckoutPage(page)
    await expect(checkout.bookingType('Pickup & drop')).toHaveAttribute('aria-pressed', 'true')

    // Tomorrow is well past the 3 hours' notice pickup needs.
    await checkout.pickTomorrowSlot()

    // The address step asks where the car is, not where to come.
    await expect(checkout.pickupAddressStep()).toBeVisible()
    await expect(checkout.addressStep()).toBeHidden()

    // No fee for now, and the garage's responsibility said before paying.
    await expect(summaryRow(page, 'Pickup & drop', 'Free')).toBeVisible()
    await expect(
      page.getByText(/The garage is responsible for your car from pickup until it.s returned\./)
    ).toBeVisible()

    // The default address is preselected and inside the garage's reach, so
    // the price is the service's alone.
    await expect(checkout.cta()).toHaveText(`Pay ₹${Number(SERVICES.pickupWash.price)}`)
    await checkout.pay()

    // ── the booking ─────────────────────────────────────────────────────────
    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)
    const bookingId = new BookingPage(page).currentId()

    const [row] = await sql<
      {
        user_id: string
        booking_type: string
        address: string | null
        lat: number | null
        lng: number | null
        pickup_code: string | null
        delivery_code: string | null
        picked_up_at: Date | null
      }[]
    >`
      select user_id, booking_type, address, lat, lng, pickup_code, delivery_code, picked_up_at
        from bookings where id = ${bookingId}
    `
    expect(row.user_id).toBe(CUSTOMERS.pickup.id)
    expect(row.booking_type).toBe('pickup')
    // Snapshotted, like doorstep: where the driver is sent, whatever the
    // saved address becomes later.
    expect(row.address).toBe(PICKUP_HOME.address)
    expect(Number(row.lat)).toBeCloseTo(PICKUP_HOME.lat, 4)
    expect(Number(row.lng)).toBeCloseTo(PICKUP_HOME.lng, 4)
    // Two different codes, written with the booking.
    expect(row.pickup_code).toMatch(/^\d{4}$/)
    expect(row.delivery_code).toMatch(/^\d{4}$/)
    expect(row.delivery_code).not.toBe(row.pickup_code)
    expect(row.picked_up_at).toBeNull()

    // The customer reads the pickup code out to the driver.
    await expect(page.getByRole('heading', { name: 'Pickup code' })).toBeVisible()
    await expect(page.getByText(row.pickup_code!, { exact: true }).first()).toBeVisible()

    // Every step of the handover, in order, before any of them has happened.
    const progress = page.getByRole('list', { name: 'Pickup progress' })
    await expect(progress).toBeVisible()
    await expect(progress.getByRole('listitem')).toHaveText(STEPS.map((step) => new RegExp(step)))

    // The car has not been collected, so the delivery code is not shown yet.
    await expect(page.getByText(row.delivery_code!, { exact: true })).toHaveCount(0)
  })
})
