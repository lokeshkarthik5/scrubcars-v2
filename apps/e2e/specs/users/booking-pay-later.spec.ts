/**
 * Paying for a booking that already exists.
 *
 * A second, older payment path: createPaymentOrder(bookingId) rather than the
 * intent flow checkout uses (bookings/[id]/page.tsx:95). It is reachable
 * whenever a booking exists unpaid, and nothing else in the suite touches it.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { getPayment } from '../../support/db'
import { BOOKINGS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-payLater') })

test('an unpaid booking can be settled from its own page', async ({ page }) => {
  expect((await getPayment(BOOKINGS.unpaid))?.status).toBe('pending')

  await page.goto(`/bookings/${BOOKINGS.unpaid}`)
  await page.getByRole('button', { name: /^Pay/ }).click()

  // Same fake gateway, different server route: this one settles an existing
  // booking rather than consuming an intent to create one.
  await expect
    .poll(async () => (await getPayment(BOOKINGS.unpaid))?.status)
    .toBe('paid')
})
