/**
 * A job the customer moves.
 *
 * Rescheduling writes a *new* booking, so the garage has to end up looking at
 * the new one — a vendor still working the old row would turn up on the wrong
 * day.
 */
import { test, expect } from '../../support/fixtures'
import { openActors } from '../../support/journey'
import {
  bookingsForUser,
  getBooking,
  getPayment,
  rescheduleChain,
} from '../../support/db'
import { CheckoutPage } from '../../pages/checkout.page'
import { BookingPage } from '../../pages/booking.page'
import { CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

test('a customer moves a booking and the garage sees the new slot @p0', async ({
  browser,
}) => {
  const { customer, vendor, close } = await openActors(
    browser,
    'customer-journeyMove',
    VENDORS.main.id
  )

  const checkout = new CheckoutPage(customer)
  await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
  await checkout.pickTomorrowSlot()
  await checkout.pickVehicle(/Hyundai i20/)
  await checkout.pay()
  await customer.waitForURL(/\/bookings\/[0-9a-f-]+/)

  const [original] = await bookingsForUser(CUSTOMERS.journeyMove.id)

  // The garage accepts it before the customer moves it — the interesting case:
  // it agreed to the old time, so the move has to come back to it.
  await vendor.goto('/bookings?tab=new')
  await vendor
    .getByRole('button', {
      name: `Accept booking for ${CUSTOMERS.journeyMove.name}`,
    })
    .click()
  // Accept waits five seconds behind its Undo (0066).
  await expect
    .poll(async () => (await getBooking(original.id))?.status, { timeout: 15_000 })
    .toBe('confirmed')

  // ── the move ─────────────────────────────────────────────────────────────
  const booking = new BookingPage(customer)
  await customer.reload()
  await booking.openReschedule()
  await checkout.pickTomorrow()
  // The last time of the day: the picker shows the morning first.
  await checkout.showAllTimes()
  await checkout.slots().last().click()
  await booking.confirmReschedule()

  await customer.waitForURL((url) => !url.pathname.includes(original.id))
  const movedId = booking.currentId()

  const moved = await getBooking(movedId)
  expect(moved?.rescheduled_from_id).toBe(original.id)
  expect(moved?.original_booking_id).toBe(original.id)
  expect(moved?.reschedule_count).toBe(1)
  // An accepted job goes back to a request after a move: the garage agreed to
  // the old time, not the new one.
  expect(moved?.status).toBe('pending')
  expect(moved?.accepted_by).toBeNull()

  // The payment follows the booking; the customer is not charged twice.
  const payment = await getPayment(movedId)
  expect(payment?.status).toBe('paid')
  expect(payment?.amount).toBe(original.amount)

  const chain = await rescheduleChain(original.id)
  expect(chain).toHaveLength(1)
  expect(chain[0]).toMatchObject({
    from_booking_id: original.id,
    to_booking_id: movedId,
  })

  // ── the garage's view ────────────────────────────────────────────────────
  // The moved job is back under New, saying the customer moved it, and
  // the garage accepts the new time.
  await vendor.goto('/bookings?tab=new')
  await expect(
    vendor
      .locator(`#job-${movedId}`)
      .getByText(/The customer moved this booking to a new time/)
  ).toBeVisible()
  await vendor
    .getByRole('button', {
      name: `Accept booking for ${CUSTOMERS.journeyMove.name}`,
    })
    .click()
  await expect
    .poll(async () => (await getBooking(movedId))?.status, { timeout: 15_000 })
    .toBe('confirmed')

  // Exactly one live job for this customer: the moved one. The original must
  // not still be sitting in the list.
  await expect
    .poll(async () => {
      const rows = await bookingsForUser(CUSTOMERS.journeyMove.id)
      return rows.filter((r) => ['pending', 'confirmed'].includes(r.status))
        .length
    })
    .toBe(1)

  // The source is retired as a plain cancellation rather than left in a
  // 'rescheduled' limbo — the enum value exists but is deliberately unused, so
  // the row reads the same way in every list (bookings.repository.ts:582).
  const retired = await getBooking(original.id)
  expect(retired?.status).toBe('cancelled')
  expect(retired?.cancelled_by).toBe('user')

  await close()
})
