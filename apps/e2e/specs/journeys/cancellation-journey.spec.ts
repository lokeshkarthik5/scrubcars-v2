/**
 * A job the garage turns down.
 *
 * The customer is told *who* cancelled and *why*, and that has to survive the
 * trip from the vendor app through the API to the customer's page — the two
 * are separate deployments reading the same row.
 */
import { test, expect } from '../../support/fixtures'
import { openActors } from '../../support/journey'
import { bookingsForUser, getBooking } from '../../support/db'
import { CheckoutPage } from '../../pages/checkout.page'
import { CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

test('a garage rejects a booking and the customer is told why @p0', async ({ browser }) => {
  const { customer, vendor, close } = await openActors(
    browser,
    'customer-journeyCancel',
    VENDORS.main.id
  )

  const checkout = new CheckoutPage(customer)
  await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
  await checkout.pickTomorrowSlot()
  await checkout.pickVehicle(/Hyundai i20/)
  await checkout.pay()
  await customer.waitForURL(/\/bookings\/[0-9a-f-]+/)

  const [booking] = await bookingsForUser(CUSTOMERS.journeyCancel.id)
  expect(booking.status).toBe('pending')

  // The garage turns it down with a reason.
  await vendor.goto('/bookings')
  await vendor
    .getByRole('button', { name: `Reject booking for ${CUSTOMERS.journeyCancel.name}` })
    .click()
  await vendor.getByPlaceholder('Reason for rejecting (optional)').fill('Ramp under repair')
  await vendor.getByRole('button', { name: 'Confirm reject' }).click()

  await expect.poll(async () => (await getBooking(booking.id))?.status).toBe('cancelled')

  const row = await getBooking(booking.id)
  // 'vendor', not 'user': the customer's page renders the two differently, and
  // so does the vendor's own Cancelled tab.
  expect(row?.cancelled_by).toBe('vendor')
  expect(row?.cancellation_reason).toBe('Ramp under repair')

  // The customer's page polls, so this arrives without a reload.
  await expect(customer.getByText(/Declined by|Cancelled by/i).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(customer.getByText('Ramp under repair')).toBeVisible()

  await close()
})
