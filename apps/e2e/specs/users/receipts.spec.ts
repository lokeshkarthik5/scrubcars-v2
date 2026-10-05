/**
 * The customer's payment receipt: opened from the booking page, saved as a
 * PDF through the print screen, and only ever the customer's own.
 *
 * Reads CUSTOMERS.receipts' two bookings at MAIN (see seedBookingRows): a
 * completed one with two services and SAVE20, and one the garage declined
 * that ops refunded in full. Nothing here writes, so the file can run beside
 * anything. What goes on a receipt, and every figure, is unit-tested in
 * apps/server/src/lib/receipts.test.ts; this pins that the page shows it and
 * that the API keeps it to its owner.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { getPayment } from '../../support/db'
import { BOOKINGS, CUSTOMERS } from '../../support/seed-ids'

const receiptUrl = (id: string) => `${API}/api/v1/bookings/${id}/receipt`

/** "2EC10001": the booking reference, as the receipt number ends. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

/**
 * The receipt number the server must give: the IST date of the payment. The
 * reference is the booking's own because these seeds were never moved (a
 * moved booking is numbered by the first booking of its chain).
 */
async function expectedReceiptNumber(bookingId: string) {
  const paidAt = (await getPayment(bookingId))?.paid_at
  if (!paidAt) throw new Error(`Seed payment for ${bookingId} has no paid_at`)
  const ist = new Date(paidAt.getTime() + (5 * 60 + 30) * 60 * 1000)
  const yymmdd = ist.toISOString().slice(2, 10).replaceAll('-', '')
  return `DTL-${yymmdd}-${reference(bookingId)}`
}

test.describe('receipts @p0', () => {
  test.describe('the customer', () => {
    // A 390px phone, the width the receipt is designed down to.
    test.use({ storageState: asRole('customer-receipts'), viewport: { width: 390, height: 844 } })

    test('opens the receipt from the booking: number, services, amounts, payment id, not a tax invoice', async ({
      page,
    }) => {
      const number = await expectedReceiptNumber(BOOKINGS.receiptPaid)

      await page.goto(`/bookings/${BOOKINGS.receiptPaid}`)
      await page.getByRole('link', { name: 'View receipt' }).click()
      await expect(page).toHaveURL(new RegExp(`/bookings/${BOOKINGS.receiptPaid}/receipt$`))

      const receipt = page.getByRole('article', { name: `Payment receipt ${number}` })
      await expect(receipt).toBeVisible()
      await expect(receipt.getByRole('heading', { name: 'Payment receipt' })).toBeVisible()
      await expect(receipt).toContainText(number)

      // The customer, masked: a receipt is made to be shared.
      await expect(receipt).toContainText(CUSTOMERS.receipts.name)
      await expect(receipt).toContainText(`+91 ******${CUSTOMERS.receipts.phone.slice(-4)}`)
      await expect(receipt).not.toContainText(CUSTOMERS.receipts.phone)

      // Each service beside the price it was sold at, then the code and what
      // was charged.
      await expect(receipt).toContainText('Express Wash₹499.00')
      await expect(receipt).toContainText('Full Body Detail₹1,999.00')
      await expect(receipt).toContainText('Subtotal₹2,498.00')
      await expect(receipt).toContainText('Discount (SAVE20)−₹200.00')
      await expect(receipt).toContainText('Paid at booking₹2,298.00')
      await expect(receipt).toContainText('Online (Razorpay)')
      await expect(receipt).toContainText('pay_seed_receipt_paid')
      await expect(receipt).toContainText('Net amount paid₹2,298.00')

      await expect(receipt.getByText('This is a payment receipt, not a tax invoice.')).toBeVisible()
      // Receipt now, GST later: nothing on it may claim to be a tax document.
      await expect(receipt).not.toContainText('GSTIN')
      await expect(receipt.getByText(/^Tax invoice/i)).toHaveCount(0)

      await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()

      // On paper, only the receipt: the buttons and the hint are gone.
      await page.emulateMedia({ media: 'print' })
      await expect(page.getByRole('button', { name: 'Download PDF' })).toBeHidden()
      await expect(receipt).toBeVisible()
      await page.emulateMedia({ media: 'screen' })

      // Fits the phone: nothing scrolls sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow).toBeLessThanOrEqual(0)

      // And the API behind it, in its envelope. The page has just refreshed
      // this context's session, so the request is signed in.
      const response = await page.request.get(receiptUrl(BOOKINGS.receiptPaid))
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toMatchObject({
        receiptNumber: number,
        subtotal: '2498.00',
        discount: { code: 'SAVE20', amount: '200.00' },
        bookingPayment: { amount: '2298.00', paymentId: 'pay_seed_receipt_paid' },
        refunds: [],
        netPaid: '2298.00',
      })
    })

    test('a refunded booking shows the refund line', async ({ page }) => {
      await page.goto(`/bookings/${BOOKINGS.receiptRefunded}/receipt`)

      const receipt = page.getByRole('article', { name: /^Payment receipt DTL-\d{6}-/ })
      await expect(receipt).toBeVisible()
      await expect(receipt).toContainText(reference(BOOKINGS.receiptRefunded))
      await expect(receipt).toContainText('Cancelled')
      await expect(receipt).toContainText('Paid at booking₹499.00')
      await expect(receipt).toContainText('Refund−₹499.00')
      await expect(receipt).toContainText('Refunded to original payment method')
      await expect(receipt).toContainText('rfnd_E2ERECEIPT0001')
      await expect(receipt).toContainText('Net amount paid₹0.00')
    })
  })

  test('another customer gets a 404, and a booking with nothing paid has no receipt yet', async () => {
    // A fresh login rather than a saved state: a bare request context cannot
    // refresh a 15-minute token, and a 401 would pass for the wrong reason.
    // This number belongs to this file alone.
    const stranger = await loginViaApi(CUSTOMERS.receiptsStranger.phone)

    const theirs = await stranger.get(receiptUrl(BOOKINGS.receiptPaid))
    expect(theirs.status()).toBe(404)
    expect(await theirs.json()).toEqual({
      success: false,
      message: 'Booking not found',
      code: 'BOOKING_NOT_FOUND',
    })

    const unpaid = await stranger.get(receiptUrl(BOOKINGS.receiptUnpaid))
    expect(unpaid.status()).toBe(404)
    expect(await unpaid.json()).toEqual({
      success: false,
      message: expect.stringContaining('no receipt for this booking yet'),
      code: 'RECEIPT_NOT_AVAILABLE',
    })

    await stranger.dispose()
  })
})
