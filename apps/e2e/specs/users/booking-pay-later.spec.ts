/**
 * Paying for a booking that already exists.
 *
 * A second, older payment path: createPaymentOrder(bookingId) rather than the
 * intent flow checkout uses (bookings/[id]/page.tsx:95). It is reachable
 * whenever a booking exists unpaid, and nothing else in the suite touches it.
 *
 * @p0 because it is also the only spec that sees settlePayment's ordinary
 * branch issue a receipt number in the payment's own transaction (the other
 * @p0 specs cover consumeIntent and the refused branch).
 */
import { test, expect, asRole } from '../../support/fixtures'
import { gatewayModes, getPayment, getReceiptNumber } from '../../support/db'
import { BOOKINGS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-payLater') })

test('an unpaid booking can be settled from its own page @p0', async ({ page }) => {
  expect((await getPayment(BOOKINGS.unpaid))?.status).toBe('pending')

  await page.goto(`/bookings/${BOOKINGS.unpaid}`)
  await page.getByRole('button', { name: /^Pay/ }).click()

  // Same fake gateway, different server route: this one settles an existing
  // booking rather than consuming an intent to create one.
  await expect
    .poll(async () => (await getPayment(BOOKINGS.unpaid))?.status)
    .toBe('paid')

  // The receipt number is issued in the same transaction that settles it.
  expect((await getReceiptNumber(BOOKINGS.unpaid))?.number).toMatch(/^DTL\/\d{2}-\d{2}\/\d{6}$/)

  // Opening the order recorded its mode on the payment (no checkout here).
  expect((await gatewayModes(BOOKINGS.unpaid))?.payment).toBe('fake')
})
