/**
 * The pickup fee (0079), the customer's side, on the web app: the Pickup &
 * drop list's chip, the garage page's fee line, checkout's fee lines (never
 * pressing Pay), the seeded pickup booking's fee row, refund note and
 * receipt line, the report sheet's new reason, and Ask for pickup to a garage
 * that doesn't collect cars.
 *
 * PICKUP_FEE (7750–7799, apps/server/src/db/seeds/e2e-ids.ts): garages near
 * Mysuru, far from every other fixture. Road km is the straight line × 1.3
 * to one decimal, so the screens say 6.2–6.3 km for Velan (seeded 4.8 km
 * north) and about 11 km for Kumar and Murugan; the fees don't move with
 * that last decimal (₹99 and ₹120). The maths is unit-tested in
 * packages/core/src/pickup-fee.test.ts and pickup-fee-customer.test.ts.
 */
import type { BrowserContext } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { PICKUP_FEE } from '../../support/seed-ids'

const P = PICKUP_FEE

test.describe.configure({ mode: 'serial' })
test.use({ storageState: asRole('customer-pickup-fee') })

/** The customer stands at home, as the location store keeps a phone fix. */
async function standAtHome(context: BrowserContext) {
  await context.addInitScript((at) => {
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: { location: { ...at, label: 'Home', source: 'gps', updatedAt: Date.now() }, promptDismissedAt: Date.now() },
        version: 0,
      })
    )
  }, P.home)
}

test.describe('the pickup fee, as the customer sees it @p0', () => {
  test.beforeAll(async () => {
    // A retry starts with no open request (two at most per customer).
    await sql`delete from booking_requests where user_id = ${P.customer.id}`
  })

  test.beforeEach(async ({ context, page }) => {
    await standAtHome(context)
    await page.setViewportSize({ width: 375, height: 812 })
  })

  test('the Pickup & drop list: one chip per card, for the distance', async ({ page }) => {
    await page.goto('/garages?mode=pickup')
    const card = (id: string) => page.locator(`[data-vt-card="${id}"]`)
    // Detlio's numbers at 6.2 km by road.
    await expect(card(P.velan.garage.id)).toBeVisible()
    await expect(card(P.velan.garage.id).getByText('Pickup ₹99', { exact: true })).toBeVisible()
    // Kumar's ₹20 a km waits for Detlio: customers see Detlio's ₹120.
    await expect(card(P.kumar.garage.id).getByText('Pickup ₹120', { exact: true })).toBeVisible()
    // Free, as before 0079.
    await expect(card(P.free.garage.id).getByText('Free pickup', { exact: true })).toBeVisible()
  })

  test('the garage page names the fee for the saved address and the road km', async ({ page }) => {
    await page.goto(`/garage/${P.velan.garage.id}?mode=pickup`)
    const line = page.locator('[data-pickup-fee-line]')
    await expect(line).toContainText(/Pickup & drop ₹99 to Home \(6\.[23] km by road\)\./)
    await expect(line).toContainText(`${P.velan.garage.name} collects your car from your address`)

    // A Free garage keeps today's line.
    await page.goto(`/garage/${P.free.garage.id}?mode=pickup`)
    await expect(page.locator('[data-pickup-fee-line]')).toHaveText(
      `Free pickup & drop: ${P.free.garage.name} collects your car from your address, works on it at the garage and brings it back.`
    )
  })

  test('checkout: the fee line, what it covers and its refund (Pay is never pressed)', async ({ page }) => {
    await page.goto(`/book/${P.velan.garage.id}?service=${P.velan.wash.id}&mode=pickup`)
    const price = page.getByRole('region', { name: 'Price' })
    const line = price.locator('[data-pickup-fee-line]')
    await expect(line).toContainText(/Pickup & drop · 6\.[23] km/)
    await expect(line).toContainText('From and back to 14, 2nd Main Rd, Saraswathipuram')
    await expect(line).toContainText('₹99')
    // The convenience fee is ₹0 at launch: no line.
    await expect(price.locator('[data-convenience-fee-line]')).toHaveCount(0)
    await expect(price).toContainText('₹798')
    await expect(page.getByText("This is the full pickup fee. The garage can't ask for more.")).toBeVisible()
    await expect(page.getByText(/If the garage cancels or doesn't turn up, the pickup fee is refunded in full\./)).toBeVisible()
  })

  test('the booking: its pickup fee row, the refund note, the receipt and the new report reason', async ({ page }) => {
    await page.goto(`/bookings/${P.velan.booking}`)
    const details = page.getByRole('region', { name: 'Booking details' })
    await expect(details.getByText('Pickup & drop · 6.2 km', { exact: true })).toBeVisible()
    await expect(details).toContainText('₹99')
    await expect(page.locator('[data-pickup-refund-note]')).toHaveText(
      `The pickup fee is the full price for collecting and returning your car. If ${P.velan.garage.name} cancels or doesn't turn up, it's refunded in full.`
    )

    // The quiet report line now covers extra money too, and so does the sheet.
    await page.getByRole('button', { name: 'Did the garage ask you to book directly or pay extra?' }).click()
    const sheet = page.getByRole('dialog', { name: 'Tell us about the garage' })
    const reason = sheet.getByRole('button', { name: 'Asked for extra pickup money' })
    await expect(reason).toBeVisible()
    await reason.click()
    await expect(reason).toHaveAttribute('aria-pressed', 'true')
    // Not sent: the admin specs read the Bypass reports list.
    await page.keyboard.press('Escape')

    await page.goto(`/bookings/${P.velan.booking}/receipt`)
    const receipt = page.getByRole('article', { name: /^Payment receipt / })
    await expect(receipt.getByText('Pickup & drop · 6.2 km', { exact: true })).toBeVisible()
    await expect(receipt.getByText('Detlio convenience fee')).toHaveCount(0)
  })

  test('Ask for pickup: a garage that doesn’t collect, Detlio’s suggestion, and the request', async ({ page }) => {
    await page.goto(`/garage/${P.murugan.garage.id}`)
    const card = page.locator('[data-ask-for-pickup]')
    await expect(card.getByRole('heading', { name: `${P.murugan.garage.name} doesn't collect cars yet` })).toBeVisible()
    await expect(card).toContainText(/Detlio suggests about ₹120 for 11(\.\d)? km by road; the garage confirms\. Free to ask\./)
    await card.getByRole('button', { name: `Ask for pickup from ${P.murugan.garage.name}` }).click()

    const sheet = page.getByRole('dialog', { name: `Ask ${P.murugan.garage.name} for pickup` })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText(/They collect your car and bring it back · 11(\.\d)? km by road/)).toBeVisible()
    const fee = sheet.locator('[data-request-fee]')
    await expect(fee.getByText('About ₹120', { exact: true })).toBeVisible()
    await expect(fee.getByText('at most ₹150', { exact: true })).toBeVisible()
    await expect(fee).toContainText('The garage confirms the fee, up to 25% more. You see it before you pay.')
    await expect(sheet.getByText('The pickup fee is shown before you pay')).toBeVisible()

    await sheet.getByRole('button', { name: new RegExp(P.murugan.wash.name) }).click()
    const windows = sheet.getByRole('group', { name: 'Time window' })
    await windows.getByRole('button', { name: 'Tomorrow 9–12', exact: true }).click()
    await expect(sheet.getByRole('button', { name: /14, 2nd Main Rd, Saraswathipuram/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByText('Ask for pickup: free to ask, no payment until they say yes.')).toBeVisible()
    await sheet.getByRole('button', { name: 'Send request' }).click()
    await expect(sheet.getByRole('heading', { name: 'Request sent' })).toBeVisible()

    const [sent] = await sql<{ status: string; booking_type: string; suggested_fee: string; max_fee: string; vendor_id: string }[]>`
      select status, booking_type, suggested_fee, max_fee, vendor_id from booking_requests
       where user_id = ${P.customer.id} order by created_at desc limit 1
    `
    expect(sent).toMatchObject({ status: 'pending', booking_type: 'pickup', vendor_id: P.murugan.garage.id })
    expect(Number(sent.suggested_fee)).toBe(P.murugan.garage.suggested)
    expect(Number(sent.max_fee)).toBe(P.murugan.garage.max)

    // The waiting card says the fee, then the customer cancels it.
    await sheet.getByRole('link', { name: 'See your request' }).click()
    await expect(page).toHaveURL(/\/requests$/)
    const waiting = page.getByRole('region', { name: `Waiting for ${P.murugan.garage.name}` })
    await expect(waiting.locator('[data-request-fee]')).toHaveText('Pickup fee: about ₹120, at most ₹150. They confirm it.')
    await waiting.getByRole('button', { name: 'Cancel request' }).click()
    await expect(page.getByText('Request cancelled').first()).toBeVisible()
  })
})
