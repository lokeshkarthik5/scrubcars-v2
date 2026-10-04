/**
 * Moving a booking to another slot.
 *
 * Reschedule does not edit a booking — it writes a new one and links the two
 * (bookings.service.ts:835, rescheduleBookingWithPayment). That makes three
 * things easy to get wrong, and all three cost the customer money or the
 * garage a job:
 *
 *   - the payment has to come across, or the customer is asked to pay twice
 *   - the discount has to come across without being redeemed twice
 *   - the lines are re-booked from the snapshot, not re-resolved, so a service
 *     repriced or withdrawn since must not change or block the move
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { BookingPage } from '../../pages/booking.page'
import { CheckoutPage } from '../../pages/checkout.page'
import {
  countRedemptions,
  countRedemptionsByCodeForUser,
  getBooking,
  getBookingItems,
  getPayment,
} from '../../support/db'
import { BOOKINGS, CUSTOMERS, DISCOUNTS, SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-reschedule') })

test.describe('reschedule @p0', () => {
  test('carries the payment and the discount onto the new booking', async ({ page }) => {
    const original = await getBooking(BOOKINGS.reschedulable)
    expect(original?.discount_code).toBe(DISCOUNTS.percentCapped.code)

    const booking = new BookingPage(page)
    const checkout = new CheckoutPage(page)
    await booking.goto(BOOKINGS.reschedulable)

    await expect(booking.rescheduleAllowance()).toHaveText(/2 of 2 left/)
    await booking.openReschedule()

    // The picker opens non-progressively here: the date list is already shown.
    await checkout.pickTomorrow()
    await checkout.slots().last().click()
    await booking.confirmReschedule()

    // A move writes a NEW booking, so wait for the id to change rather than
    // for "a booking page", which we are already on.
    await page.waitForURL((url) => !url.pathname.includes(BOOKINGS.reschedulable))
    const movedId = booking.currentId()

    const moved = await getBooking(movedId)
    expect(moved?.rescheduled_from_id).toBe(BOOKINGS.reschedulable)
    // The chain roots at the first booking, so the cap counts moves across the
    // whole chain rather than resetting each time.
    expect(moved?.original_booking_id).toBe(BOOKINGS.reschedulable)
    expect(moved?.reschedule_count).toBe(1)
    // The garage agreed to the old time, not this one: the move goes back to
    // it as a request.
    expect(moved?.status).toBe('pending')
    await expect(page.getByText('Awaiting garage')).toBeVisible()

    // Money is unchanged and already settled — the customer is not asked again.
    expect(moved?.amount).toBe(original?.amount)
    expect(moved?.discount_code).toBe(DISCOUNTS.percentCapped.code)
    expect(moved?.discount_amount).toBe(original?.discount_amount)

    const payment = await getPayment(movedId)
    expect(payment?.status).toBe('paid')
    expect(payment?.amount).toBe(original?.amount)

    // The redemption is moved onto the new booking rather than copied: it
    // follows the money. What must hold is that the code is still spent
    // exactly once in total — otherwise two reschedules would burn three uses
    // of a one-per-customer code.
    expect(await countRedemptions(movedId)).toBe(1)
    expect(await countRedemptions(BOOKINGS.reschedulable)).toBe(0)
    expect(
      await countRedemptionsByCodeForUser(
        DISCOUNTS.percentCapped.code,
        CUSTOMERS.reschedule.id
      )
    ).toBe(1)

    // Lines are re-booked from the snapshot, so they survive intact.
    const items = await getBookingItems(movedId)
    expect(items.map((i) => i.service_id)).toEqual([SERVICES.wash.id, SERVICES.detail.id])
    expect(items.map((i) => i.amount)).toEqual(['499.00', '1999.00'])
  })

  test('the cap closes the door rather than failing at the end', async ({ page }) => {
    const booking = new BookingPage(page)
    await booking.goto(BOOKINGS.rescheduleExhausted)

    await expect(booking.rescheduleAllowance()).toHaveText(/0 of 2 left/)
    // Unlike the 2-hour cutoff, the cap is enforced in the UI too: the control
    // is replaced by a disabled explanation instead of letting the customer
    // pick a slot and only then be refused.
    await expect(booking.rescheduleBlocked()).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Reschedule', exact: true })).toHaveCount(0)

    const row = await getBooking(BOOKINGS.rescheduleExhausted)
    expect(row?.reschedule_count).toBe(2)
  })

  test('an accepted booking inside the 2-hour cutoff cannot be moved', async ({ page }) => {
    const booking = new BookingPage(page)
    await booking.goto(BOOKINGS.rescheduleTooLate)

    // Seeded confirmed at now + 1h: like the cap, the cutoff is shown, not
    // left for the server to refuse after the customer has picked a time.
    await expect(page.getByRole('button', { name: 'Too close to your slot to move' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Reschedule', exact: true })).toHaveCount(0)

    // The server refuses a direct request too.
    const tomorrow = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()
    const response = await page.request.patch(
      `${API}/api/v1/bookings/${BOOKINGS.rescheduleTooLate}/reschedule`,
      { data: { scheduledAt: tomorrow } }
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('RESCHEDULE_WINDOW_PASSED')
    expect(body.message).toMatch(/at least 2 hours before the scheduled time/i)

    const row = await getBooking(BOOKINGS.rescheduleTooLate)
    expect(row?.reschedule_count).toBe(0)
  })
})
