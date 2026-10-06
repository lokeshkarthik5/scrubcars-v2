/**
 * Customer cancellation.
 *
 * The rules live in bookingsService.cancelBooking: only a pending or confirmed
 * booking can be cancelled, and the 2-hour cutoff applies only once the garage
 * has accepted. The page shows the cutoff instead of offering a control the
 * server would refuse, so that case checks both: the explanation on screen,
 * and the server still refusing a direct request.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { BookingPage } from '../../pages/booking.page'
import { getBooking } from '../../support/db'
import { BOOKINGS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-cancel') })

test.describe('cancellation @p0', () => {
  test('a confirmed booking outside the window cancels with a reason', async ({ page }) => {
    const booking = new BookingPage(page)
    await booking.goto(BOOKINGS.cancellable)

    await booking.openCancel()
    await booking.cancelReason().fill('Change of plans')
    await booking.confirmCancel()

    await expect(page.getByText(/Cancelled by you/i)).toBeVisible()

    const row = await getBooking(BOOKINGS.cancellable)
    expect(row?.status).toBe('cancelled')
    // cancelledBy distinguishes this from a vendor rejection, which the vendor
    // list renders differently.
    expect(row?.cancelled_by).toBe('user')
    expect(row?.cancellation_reason).toBe('Change of plans')
    expect(row?.cancelled_at).not.toBeNull()
  })

  test('the reason is optional', async ({ page }) => {
    const booking = new BookingPage(page)
    await booking.goto(BOOKINGS.cancellableNoReason)

    await booking.openCancel()
    await booking.confirmCancel()

    await expect(page.getByText(/Cancelled by you/i)).toBeVisible()

    const row = await getBooking(BOOKINGS.cancellableNoReason)
    expect(row?.status).toBe('cancelled')
    expect(row?.cancelled_by).toBe('user')
    // Left blank on purpose: the field is optional, and an empty string would
    // be a worse record than none.
    expect(row?.cancellation_reason).toBeNull()
  })

  test('an accepted booking inside the 2-hour cutoff cannot be cancelled', async ({ page }) => {
    const booking = new BookingPage(page)
    await booking.goto(BOOKINGS.cancelTooLate)

    // Seeded confirmed at now + 1h: the page explains rather than offering a
    // Cancel the server would refuse.
    await expect(page.getByText(/less than 2 hours away .* can't be cancelled here/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel Booking' })).toHaveCount(0)

    // And the server holds the line on its own.
    const response = await page.request.patch(
      `${API}/api/v1/bookings/${BOOKINGS.cancelTooLate}/cancel`,
      { data: {} }
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('CANCELLATION_WINDOW_PASSED')
    expect(body.message).toMatch(/at least 2 hours before the scheduled time/i)

    const row = await getBooking(BOOKINGS.cancelTooLate)
    expect(row?.status).toBe('confirmed')
    expect(row?.cancelled_at).toBeNull()
  })

  test('a booking the garage has not accepted cancels even inside 2 hours', async ({ page }) => {
    const booking = new BookingPage(page)
    await booking.goto(BOOKINGS.cancelPendingSoon)

    // Seeded pending at now + 1h: nobody has committed to the slot yet.
    await booking.openCancel()
    await expect(page.getByText(/hasn't accepted yet, so you can cancel any time/i)).toBeVisible()
    await booking.confirmCancel()

    await expect(page.getByText(/Cancelled by you/i)).toBeVisible()
    const row = await getBooking(BOOKINGS.cancelPendingSoon)
    expect(row?.status).toBe('cancelled')
    expect(row?.cancelled_by).toBe('user')
  })

  test('an in-progress booking offers no way to cancel', async ({ page }) => {
    const booking = new BookingPage(page)
    await booking.goto(BOOKINGS.cancelWrongStatus)
    // Wait on content that is always present, so an absent Cancel button below
    // means "not offered" rather than "not loaded yet".
    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()

    // The status rule is enforced in the UI as well as the server: once the
    // car is being worked on, the control is gone rather than merely failing.
    // (Contrast the 2-hour cutoff above, which is server-side only.)
    await expect(page.getByRole('button', { name: 'Cancel Booking' })).toHaveCount(0)

    const row = await getBooking(BOOKINGS.cancelWrongStatus)
    expect(row?.status).toBe('in_progress')
  })
})
