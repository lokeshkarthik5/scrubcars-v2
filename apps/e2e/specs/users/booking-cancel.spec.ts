/**
 * Customer cancellation.
 *
 * Three rules live in bookings.service.ts:808 and none of them are enforced by
 * the UI — the buttons stay on screen regardless, and the server refuses. So
 * each case here drives the real control and asserts the refusal that comes
 * back, plus the row that did or did not change.
 */
import { test, expect, asRole } from '../../support/fixtures'
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

  test('cancelling inside the 2-hour cutoff is refused', async ({ page }) => {
    const booking = new BookingPage(page)
    await booking.goto(BOOKINGS.cancelTooLate)

    // Seeded at now + 1h. The control is still offered — the rule is enforced
    // server-side — so the customer finds out here.
    await booking.openCancel()
    await booking.confirmCancel()

    await expect(
      page.getByText(/at least 2 hours before the scheduled time/i).first()
    ).toBeVisible()

    const row = await getBooking(BOOKINGS.cancelTooLate)
    expect(row?.status).toBe('confirmed')
    expect(row?.cancelled_at).toBeNull()
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
