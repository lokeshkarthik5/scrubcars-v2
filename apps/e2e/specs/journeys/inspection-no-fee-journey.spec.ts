/**
 * On inspection with no fee, and the approx price (0073), across the garage
 * portal and the customer app.
 *
 * The garage adds a service priced on inspection with the fee left empty and
 * an approx price of ₹1,500. The customer's garage page says "Approx ₹1,500 ·
 * price after inspection" (and "Price on inspection" for one with neither,
 * the fee and its approx line for one with a fee); checkout says "Pay after
 * inspection" with ₹0 and books it with nothing paid: no Razorpay sheet, no
 * order, a ₹0 payment. Once the job has started the garage sends the final
 * bill from ₹0, and the customer sees all of it to pay in the app.
 *
 * INSPECTION_NO_FEE: a garage, owner and customer of its own (7400–7449).
 * With E2E_SHOTS_DIR set, 390×844 screenshots of the garage form, the garage
 * page and checkout are written there.
 */
import path from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'
import { bookingsForUser, getFinalBills, getIntent, getPayment, sql } from '../../support/db'
import { openActors } from '../../support/journey'
import { INSPECTION_NO_FEE } from '../../support/seed-ids'

const I = INSPECTION_NO_FEE

test.describe.configure({ mode: 'serial' })

async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS_DIR
  if (!dir) return
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false })
}

const addedServiceId = async (): Promise<string | undefined> => {
  const rows = await sql<{ id: string }[]>`
    select id from services where vendor_id = ${I.garage.id} and name = ${I.added.name}
  `
  return rows[0]?.id
}

test.describe('on inspection with no fee @p0', () => {
  test('the garage adds one with no fee and an approx price', async ({ browser }) => {
    const { vendor, close } = await openActors(browser, 'customer-inspection', I.garage.id, 'vendor-inspection')
    await vendor.setViewportSize({ width: 390, height: 844 })
    await vendor.goto('/services')

    await vendor.getByLabel('Service name').fill(I.added.name)
    await vendor.getByRole('button', { name: 'On inspection', exact: true }).click()
    await expect(vendor.getByText('Priced after seeing the car; inspection fee optional')).toBeVisible()

    const fee = vendor.getByLabel('Inspection fee (optional)')
    const approx = vendor.getByLabel('Approx price (optional)')
    await expect(fee).toHaveValue('')
    await expect(
      vendor.getByText('Leave the fee empty for a free inspection. The approx price is only a guide; you send the final bill after seeing the car.')
    ).toBeVisible()

    // An approx price of ₹0 is refused in place; empty or above ₹0 is fine.
    await approx.fill('0')
    await expect(vendor.getByRole('alert').filter({ hasText: 'Enter an approx price above ₹0, or leave it empty.' })).toBeVisible()
    await approx.fill(String(I.added.approx))

    const add = vendor.getByRole('button', { name: 'Add service' })
    await expect(add).toBeEnabled()
    await approx.scrollIntoViewIfNeeded()
    await shot(vendor, 'garage-form-on-inspection')
    await add.click()

    await expect
      .poll(async () => {
        const rows = await sql<{ pricing_type: string; price: string; approx_price: string | null }[]>`
          select pricing_type, price, approx_price from services
           where vendor_id = ${I.garage.id} and name = ${I.added.name}
        `
        return rows[0]
      })
      .toEqual({ pricing_type: 'on_inspection', price: '0.00', approx_price: '1500.00' })

    // The garage's own list never says "₹0".
    await expect(vendor.getByText('Approx ₹1,500 · price after inspection').first()).toBeVisible()
    await expect(vendor.getByText('₹0 inspection')).toHaveCount(0)

    // The public API carries the approx price, and null where there is none.
    const services = await (await vendor.request.get(`${API}/api/v1/vendors/${I.garage.id}/services`)).json()
    const byName = new Map(
      services.data.map((s: { name: string; price: string; approxPrice: string | null }) => [s.name, s])
    )
    expect(byName.get(I.added.name)).toMatchObject({ price: '0.00', approxPrice: '1500.00' })
    expect(byName.get(I.noFee.name)).toMatchObject({ price: '0.00', approxPrice: null })
    expect(byName.get(I.withFee.name)).toMatchObject({ price: '299.00', approxPrice: '2500.00' })
    await close()
  })

  test('the customer sees the price words and books it with nothing to pay', async ({ browser }) => {
    const serviceId = await addedServiceId()
    expect(serviceId).toBeTruthy()
    const { customer, vendor, close } = await openActors(browser, 'customer-inspection', I.garage.id, 'vendor-inspection')
    await customer.setViewportSize({ width: 390, height: 844 })

    // ── the garage page ─────────────────────────────────────────────────────
    await customer.goto(`/garage/${I.garage.id}`)
    // The page also keeps a hidden copy of each card: only what shows counts.
    const shown = (text: string) => customer.getByText(text, { exact: true }).filter({ visible: true })
    const card = customer.getByRole('button', { name: `View details for ${I.added.name}` })
    await expect(card).toBeVisible()
    await expect(shown('Approx ₹1,500 · price after inspection').first()).toBeVisible()
    await expect(shown('Price on inspection').first()).toBeVisible()
    await expect(shown('₹299 inspection').first()).toBeVisible()
    await expect(shown('Approx ₹2,500 · price after inspection').first()).toBeVisible()
    await expect(shown('₹0')).toHaveCount(0)
    await card.scrollIntoViewIfNeeded()
    await shot(customer, 'customer-garage-page')

    // ── the API refuses the ways round checkout ────────────────────────────
    const at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    at.setUTCHours(5, 30, 0, 0)
    const body = {
      vendorId: I.garage.id,
      serviceIds: [serviceId],
      vehicleId: I.customer.vehicleId,
      bookingType: 'dropin',
      scheduledAt: at.toISOString(),
      paymentMethod: 'online',
    }
    const withCode = await customer.request.post(`${API}/api/v1/booking-intents`, {
      data: { ...body, discountCode: 'NOTHINGTOTAKE' },
    })
    expect(withCode.status()).toBe(400)
    expect((await withCode.json()).code).toBe('DISCOUNT_NOTHING_TO_PAY')
    const payLater = await customer.request.post(`${API}/api/v1/bookings`, { data: body })
    expect(payLater.status()).toBe(400)
    expect((await payLater.json()).code).toBe('FREE_BOOKING_NEEDS_CHECKOUT')

    // ── checkout ───────────────────────────────────────────────────────────
    await customer.goto(`/book/${I.garage.id}?service=${serviceId}`)
    await customer.getByRole('button', { name: /, tomorrow$/ }).click()
    const slot = customer.getByRole('button', { name: /^\d{1,2}:\d{2}\s(am|pm)$/ }).first()
    await slot.click()
    await expect(slot).toHaveAttribute('aria-pressed', 'true')

    await expect(customer.getByText('Pay after inspection').first()).toBeVisible()
    await expect(
      customer.getByText('No inspection fee. After seeing your car the garage sends the price in the app, and you pay it here.')
    ).toBeVisible()
    // No code to offer: there is nothing for one to come off.
    await expect(customer.getByRole('button', { name: /Coupons and offers/ })).toHaveCount(0)
    const book = customer.getByRole('button', { name: 'Book now', exact: true })
    await expect(book).toBeVisible()
    await shot(customer, 'customer-checkout')
    await book.click()

    await customer.waitForURL(/\/bookings\/[0-9a-f-]+/)
    // No payment sheet ever opened.
    expect(
      await customer.evaluate(
        () => (window as unknown as { __e2ePayment?: { openCount: number } }).__e2ePayment?.openCount ?? 0
      )
    ).toBe(0)

    const [booking] = await bookingsForUser(I.customer.id)
    expect(booking).toMatchObject({ subtotal_amount: '0.00', amount: '0.00', status: 'pending' })
    const payment = await getPayment(booking.id)
    expect(payment).toMatchObject({ status: 'paid', amount: '0.00', gateway_txn_id: null })
    // The checkout opened no Razorpay order.
    const [intent] = await sql<{ id: string; gateway_txn_id: string | null }[]>`
      select id, gateway_txn_id from booking_intents where booking_id = ${booking.id}
    `
    expect(intent.gateway_txn_id).toBeNull()
    expect((await getIntent(intent.id))?.status).toBe('consumed')

    await expect(customer.getByText('Pay after inspection').first()).toBeVisible()
    // The booking page's row says the price is to come, never ₹0.
    await expect(customer.getByText('Price after inspection', { exact: true }).first()).toBeVisible()

    // ── My bookings: its ticket never says ₹0 or "Paid" ────────────────────
    await customer.goto('/bookings')
    await expect(customer.getByRole('link', { name: new RegExp(`^${I.added.name} at `) }).first()).toBeVisible()
    await expect(customer.getByText('₹0', { exact: true })).toHaveCount(0)
    await expect(customer.getByText('Paid', { exact: true })).toHaveCount(0)

    // ── the garage's new booking card: its price is the bill to come ───────
    await vendor.goto('/bookings?tab=new')
    const garageCard = vendor.getByRole('article', { name: `New booking from ${I.customer.name}` }).first()
    await expect(garageCard.getByText('Price on inspection · bill not sent')).toBeVisible()
    await expect(garageCard.getByText('₹0', { exact: true })).toHaveCount(0)
    await close()
  })

  test('the garage sends the final bill from ₹0, and the customer has all of it to pay', async ({ browser }) => {
    const { customer, vendor, close } = await openActors(browser, 'customer-inspection', I.garage.id, 'vendor-inspection')
    const [booking] = await bookingsForUser(I.customer.id)
    // Done with no bill yet: My bookings says the price is to come.
    await sql`update bookings set status = 'completed', completed_at = now(), respond_by = null where id = ${booking.id}`
    await customer.goto('/bookings?tab=past')
    await expect(customer.getByText('Price after inspection', { exact: true }).first()).toBeVisible()
    await expect(customer.getByText('₹0', { exact: true })).toHaveCount(0)

    // Accepted and started: a bill is raised once the car has been seen.
    await sql`
      update bookings set status = 'in_progress', accepted_at = now(), started_at = now(), respond_by = null
       where id = ${booking.id}
    `
    const name = I.customer.name

    await vendor.goto(`/bookings/${booking.id}`)
    await vendor.getByRole('button', { name: `Raise final bill for ${name}` }).click()
    const sheet = vendor.getByRole('dialog', { name: `Final bill for ${name}` })
    await expect(sheet.getByLabel('Line 1', { exact: true })).toHaveValue(I.added.name)
    // Nothing was paid at booking: the line starts empty, never "0".
    await expect(sheet.getByLabel('Line 1 amount in rupees')).toHaveValue('')
    await expect(sheet.getByText(`${name} pays it in the Detlio app.`)).toBeVisible()
    await sheet.getByLabel('Line 1 amount in rupees').fill('1800')
    await expect(sheet.getByText('₹1,800').first()).toBeVisible()
    await sheet.getByRole('button', { name: 'Send final bill' }).click()

    await expect.poll(async () => (await getFinalBills(booking.id))[0]?.status).toBe('due')
    const [bill] = await getFinalBills(booking.id)
    expect(bill).toMatchObject({ total_amount: '1800.00', paid_before: '0.00', amount_due: '1800.00' })

    await customer.goto(`/bookings/${booking.id}`)
    await expect(customer.getByRole('heading', { name: 'Final bill' })).toBeVisible()
    await expect(customer.getByRole('button', { name: 'Pay ₹1,800' })).toBeVisible()

    // My bookings: its ticket says no "Paid" while the bill is due…
    await customer.goto('/bookings')
    await expect(customer.getByRole('link', { name: new RegExp(`^${I.added.name} at `) }).first()).toBeVisible()
    await expect(customer.getByText('Paid', { exact: true })).toHaveCount(0)
    // …and once done, its row says the bill.
    await sql`update bookings set status = 'completed', completed_at = now() where id = ${booking.id}`
    await customer.goto('/bookings?tab=past')
    await expect(customer.getByText('₹1,800', { exact: true }).first()).toBeVisible()
    await expect(customer.getByText('Price after inspection', { exact: true })).toHaveCount(0)
    await close()
  })
})
