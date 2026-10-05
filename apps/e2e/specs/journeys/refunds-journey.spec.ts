/**
 * Refunds owed and Mark refunded, and the no-show money rules, across the
 * admin panel, the customer app and the garage portal.
 *
 * Every row is CUSTOMERS.refunds' at VENDORS.refunds, seeded the way the app
 * itself leaves them (see seedBookingRows): a booking Detlio cancelled three
 * days ago and one an hour ago, a customer no-show, a garage no-show, a
 * booking the customer moved, and a checkout whose payment became no
 * booking. Ops finds them on the Refunds page, refunds the first in full,
 * and the customer's page says so. The rules themselves are unit-tested in
 * apps/server/src/lib/refunds.test.ts; this pins that the list, the write,
 * the customer's words and the garage's earnings all follow them.
 *
 * Other seeded refunds (another customer's failed checkout, bookings the
 * admin specs cancel) can be on the list too, so nothing here counts it.
 */
import type { Browser } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi, setActiveVendor, statePath } from '../../support/auth'
import { bookingNotes, getIntent, getPayment } from '../../support/db'
import { USERS_ORIGIN, VENDORS_ORIGIN } from '../../support/journey'
import { blockThirdParties, dismissLocationPrompt } from '../../support/network'
import { BOOKING_INTENTS, BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

const ADMIN_ORIGIN = 'http://localhost:3002'
const REFUNDS = `${API}/api/v1/admin/refunds`
const REFUND_ID = 'rfnd_E2EREFUND0001'

/** "#5EFD0001": the reference as ops reads it out. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

/** The admin panel is a desktop surface, whatever this project's device is. */
async function openAdmin(browser: Browser) {
  const ctx = await browser.newContext({
    storageState: statePath('admin'),
    baseURL: ADMIN_ORIGIN,
    viewport: { width: 1280, height: 900 },
  })
  await blockThirdParties(ctx)
  return { ctx, page: await ctx.newPage() }
}

async function openCustomer(browser: Browser) {
  const ctx = await browser.newContext({
    storageState: statePath('customer-refunds'),
    baseURL: USERS_ORIGIN,
    viewport: { width: 412, height: 915 },
    isMobile: true,
  })
  await dismissLocationPrompt(ctx)
  await blockThirdParties(ctx)
  return { ctx, page: await ctx.newPage() }
}

test.describe.configure({ mode: 'serial' })

test.describe('refunds @p0', () => {
  test('the Owed list has the cancelled paid booking and the failed checkout, and not a customer no-show or a moved booking', async ({
    browser,
  }) => {
    const { ctx, page } = await openAdmin(browser)

    // The API first: what it says is owed, and why.
    const response = await ctx.request.get(`${REFUNDS}?status=owed`)
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    const owed = body.data as Array<Record<string, unknown>>
    const find = (kind: string, id: string) => owed.find((r) => r.kind === kind && r.id === id)

    expect(find('booking', BOOKINGS.refundDetlio)).toMatchObject({
      bookingId: BOOKINGS.refundDetlio,
      reference: reference(BOOKINGS.refundDetlio),
      customer: { name: CUSTOMERS.refunds.name, phone: CUSTOMERS.refunds.phone },
      garageName: VENDORS.refunds.name,
      amountPaid: '499.00',
      amountRefunded: '0.00',
      amountOwed: '499.00',
      razorpayPaymentId: 'pay_seed_refund_detlio',
      reason: 'Cancelled by Detlio',
      refundedAt: null,
    })
    expect(find('booking', BOOKINGS.refundGarageNoShow)).toMatchObject({
      amountOwed: '499.00',
      reason: 'Garage no-show',
    })
    expect(find('checkout', BOOKING_INTENTS.refundOwed)).toMatchObject({
      bookingId: null,
      amountOwed: '499.00',
      razorpayPaymentId: 'pay_seed_refund_checkout',
      reason: expect.stringMatching(/^Paid, no booking: the garage was booked up/),
    })
    // The customer no-show keeps the payment; the moved booking's payment
    // went with the move, and the booking it moved to is still on.
    for (const id of [BOOKINGS.refundCustomerNoShow, BOOKINGS.refundMovedFrom, BOOKINGS.refundMovedTo]) {
      expect(find('booking', id), id).toBeUndefined()
    }

    // The page.
    await page.goto('/refunds')
    const list = page.getByRole('list', { name: 'Refunds owed' })
    const card = list
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: `Open booking #${reference(BOOKINGS.refundDetlio)}` }) })
    await expect(card).toBeVisible()
    await expect(card.getByText('Cancelled by Detlio', { exact: true })).toBeVisible()
    // Paid four days ago, cancelled three days ago: owed for three days,
    // which is past the two-day mark.
    await expect(card.getByText('owed 3 days')).toBeVisible()
    await expect(card.getByRole('link', { name: `Call ${CUSTOMERS.refunds.name}, ${CUSTOMERS.refunds.phone}` })).toBeVisible()
    await expect(
      card.getByRole('button', { name: 'Copy Razorpay payment id pay_seed_refund_detlio' })
    ).toBeVisible()

    // The checkout has no booking to link to; its payment id is how ops finds it.
    await expect(list.getByText('pay_seed_refund_checkout')).toBeVisible()
    await expect(page.getByRole('link', { name: `Open booking #${reference(BOOKINGS.refundCustomerNoShow)}` })).toHaveCount(0)
    await expect(page.getByRole('link', { name: `Open booking #${reference(BOOKINGS.refundMovedFrom)}` })).toHaveCount(0)

    await ctx.close()
  })

  test('marking it refunded in full records it once, moves it to Done, and tells the customer', async ({
    browser,
  }) => {
    const id = BOOKINGS.refundDetlio
    const ref = reference(id)
    const { ctx, page } = await openAdmin(browser)

    await page.goto('/refunds')
    await page.getByRole('button', { name: `Mark refunded: #${ref}, ₹499 owed` }).click()

    const dialog = page.getByRole('dialog', { name: `Mark refunded: #${ref}` })
    // Everything still owed, to start with.
    await expect(dialog.getByLabel('Amount refunded (₹)')).toHaveValue('499')
    const confirm = dialog.getByRole('button', { name: 'Mark refunded', exact: true })
    await expect(confirm).toBeDisabled()

    // A payment id pasted by mistake is caught before it is saved.
    await dialog.getByLabel('Razorpay refund id').fill('pay_seed_refund_detlio')
    await expect(dialog.getByText(/isn't a Razorpay refund id/)).toBeVisible()
    await expect(confirm).toBeDisabled()

    await dialog.getByLabel('Razorpay refund id').fill(REFUND_ID)
    await dialog.getByLabel('Note for the team (optional)').fill('Refunded after the call')
    await confirm.click()
    await expect(dialog).toBeHidden()

    // Recorded: the payment is refunded, with the refund id and who did it.
    await expect.poll(async () => (await getPayment(id))?.status).toBe('refunded')
    const payment = await getPayment(id)
    expect(payment?.refunded_amount).toBe('499.00')
    expect(payment?.refund_ref).toBe(REFUND_ID)
    expect(payment?.refunded_by).toBe('admin')
    expect(payment?.refunded_at).not.toBeNull()
    expect(payment?.refund_note).toBe('Refunded after the call')
    // And the booking's notes say so, as every ops action does.
    expect((await bookingNotes(id)).map((note) => note.body)).toContain(
      `Refunded ₹499 of the booking payment in Razorpay (${REFUND_ID}).\nRefunded after the call`
    )

    // Off the Owed list, onto Done.
    await expect(page.getByRole('link', { name: `Open booking #${ref}` })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Done' }).click()
    const done = page
      .getByRole('list', { name: 'Refunds done' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: `Open booking #${ref}` }) })
    await expect(done.getByText(REFUND_ID)).toBeVisible()
    await expect(done.getByText('by admin')).toBeVisible()

    // A second record of the same refund is refused, not added on.
    const again = await ctx.request.post(REFUNDS, {
      data: { kind: 'booking', id, amount: 499, refundRef: 'rfnd_E2EREFUND0002' },
    })
    expect(again.status()).toBe(409)
    expect(await again.json()).toEqual({
      success: false,
      message: 'This has already been refunded in full.',
      code: 'ALREADY_REFUNDED',
    })
    expect((await getPayment(id))?.refund_ref).toBe(REFUND_ID)

    // The admin booking says so too.
    await page.goto(`/bookings/${id}`)
    await expect(page.getByRole('heading', { name: 'Refund', exact: true })).toBeVisible()
    // The refund id is in the booking's notes too, so it is found by its copy button.
    await expect(
      page.getByRole('button', { name: `Copy Razorpay refund id ${REFUND_ID}` })
    ).toBeVisible()
    await ctx.close()

    // The customer's booking page and list.
    const customer = await openCustomer(browser)
    await customer.page.goto(`/bookings/${id}`)
    // The date is today's. en-IN writes September as "Sept" in current ICU
    // (Chromium, Node) and "Sep" in older ones, so the month is three or
    // four letters.
    await expect(
      customer.page.getByText(
        /^Refunded ₹499 on \d{1,2} [A-Z][a-z]{2,3} \d{4}\. It can take 5–7 working days to show in your account\.$/
      )
    ).toBeVisible()
    // A cancelled booking is under Past.
    await customer.page.goto('/bookings?tab=past')
    await expect(customer.page.getByText('Refunded', { exact: true })).toBeVisible()
    await customer.ctx.close()
  })

  test('a refund that is not owed, too large, or under a used refund id is refused', async ({ browser }) => {
    const { ctx } = await openAdmin(browser)
    const post = (data: Record<string, unknown>) => ctx.request.post(REFUNDS, { data })

    // A customer no-show keeps the payment.
    const noShow = await post({ kind: 'booking', id: BOOKINGS.refundCustomerNoShow, amount: 499, refundRef: 'rfnd_E2ENOSHOW01' })
    expect(noShow.status()).toBe(400)
    expect((await noShow.json()).code).toBe('REFUND_NOT_DUE')

    // More than was paid.
    const tooMuch = await post({ kind: 'booking', id: BOOKINGS.refundGarageNoShow, amount: 500, refundRef: 'rfnd_E2ETOOMUCH1' })
    expect(tooMuch.status()).toBe(400)
    expect(await tooMuch.json()).toEqual({
      success: false,
      message: "That's more than is still owed. At most ₹499 can be recorded.",
      code: 'REFUND_TOO_MUCH',
    })

    // A refund id already recorded on another booking.
    const reused = await post({ kind: 'booking', id: BOOKINGS.refundGarageNoShow, amount: 499, refundRef: REFUND_ID })
    expect(reused.status()).toBe(409)
    expect((await reused.json()).code).toBe('REFUND_REF_USED')

    // Not a refund id at all, and neither a refund id nor a way it was paid back.
    expect((await post({ kind: 'booking', id: BOOKINGS.refundGarageNoShow, amount: 499, refundRef: 'pay_123' })).status()).toBe(400)
    expect((await post({ kind: 'booking', id: BOOKINGS.refundGarageNoShow, amount: 499 })).status()).toBe(400)

    // Nothing was written by any of them.
    expect((await getPayment(BOOKINGS.refundGarageNoShow))?.refunded_amount).toBeNull()
    expect((await getPayment(BOOKINGS.refundCustomerNoShow))?.refunded_amount).toBeNull()

    // A failed checkout refunded outside Razorpay, in part: the rest stays owed.
    // Sent as the dialog sends it, with what had been refunded when it opened.
    const partRefund = {
      kind: 'checkout',
      id: BOOKING_INTENTS.refundOwed,
      amount: 200,
      outsideRazorpayNote: 'UPI, the customer asked',
      expectedRefunded: 0,
    }
    const part = await post(partRefund)
    expect(part.status()).toBe(201)
    expect((await part.json()).data).toMatchObject({
      kind: 'checkout',
      amountRefunded: '200.00',
      amountOwed: '299.00',
      refundRef: null,
      outsideRazorpay: true,
    })
    const intent = await getIntent(BOOKING_INTENTS.refundOwed)
    expect(intent?.status).toBe('failed')
    expect(intent?.refunded_amount).toBe('200.00')
    expect(intent?.refund_note).toBe('Refunded outside Razorpay: UPI, the customer asked')

    // The same request again (its answer lost, ops clicks again) is refused,
    // not recorded as a second ₹200: there is no refund id to catch it by,
    // but what had been refunded is no longer what the dialog saw.
    const retry = await post(partRefund)
    expect(retry.status()).toBe(409)
    expect((await retry.json()).code).toBe('REFUND_STATE_CHANGED')
    expect((await getIntent(BOOKING_INTENTS.refundOwed))?.refunded_amount).toBe('200.00')

    // Only admins can read or write any of it.
    const customer = await loginViaApi(CUSTOMERS.refunds.phone)
    expect((await customer.get(`${REFUNDS}?status=owed`)).status()).toBe(403)
    expect(
      (await customer.post(REFUNDS, { data: { kind: 'booking', id: BOOKINGS.refundGarageNoShow, amount: 1, refundRef: 'rfnd_X' } })).status()
    ).toBe(403)

    // The customer's payload says where the money stands, and nothing of the
    // team's: no refund id, note or name.
    const owedPayload = await (await customer.get(`${API}/api/v1/bookings/${BOOKINGS.refundDetlioStays}`)).json()
    expect(owedPayload.data.refund).toEqual({
      status: 'owed',
      amount: '499.00',
      amountRefunded: '0.00',
      refundedAt: null,
    })
    const refundedPayload = await (await customer.get(`${API}/api/v1/bookings/${BOOKINGS.refundDetlio}`)).json()
    expect(refundedPayload.data.refund).toMatchObject({ status: 'refunded', amountRefunded: '499.00' })
    expect(JSON.stringify(refundedPayload)).not.toContain(REFUND_ID)
    expect(JSON.stringify(refundedPayload)).not.toContain('refundedBy')
    const noShowPayload = await (await customer.get(`${API}/api/v1/bookings/${BOOKINGS.refundCustomerNoShow}`)).json()
    expect(noShowPayload.data.refund.status).toBe('none')
    await customer.dispose()
    await ctx.close()
  })

  test('the customer is told about a refund owed, and never on their own no-show', async ({ browser }) => {
    const { ctx, page } = await openCustomer(browser)
    const owedLine =
      'Our team will refund your payment to your original payment method within 5–7 working days.'

    await page.goto(`/bookings/${BOOKINGS.refundDetlioStays}`)
    await expect(page.getByText('Cancelled by Detlio', { exact: true })).toBeVisible()
    await expect(page.getByText(owedLine)).toBeVisible()

    await page.goto(`/bookings/${BOOKINGS.refundCustomerNoShow}`)
    await expect(page.getByText(/this payment isn't refunded/)).toBeVisible()
    await expect(page.getByText(owedLine)).toHaveCount(0)
    await expect(page.getByText(/^Refunded ₹/)).toHaveCount(0)

    await ctx.close()
  })

  test("the garage is paid for a customer's no-show, not for its own, and keeps its cancelled bookings", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: statePath('vendor-refunds'),
      baseURL: VENDORS_ORIGIN,
      viewport: { width: 412, height: 915 },
      isMobile: true,
    })
    await setActiveVendor(ctx, VENDORS.refunds.id)
    await blockThirdParties(ctx)
    const page = await ctx.newPage()

    // The page first: it refreshes the session the API call below uses.
    await page.goto('/earnings')
    await expect(page.getByText('Customer no-show', { exact: true })).toBeVisible()

    const response = await ctx.request.get(`${API}/api/v1/vendors/me/earnings?period=week`, {
      headers: { 'X-Vendor-Id': VENDORS.refunds.id },
    })
    expect(response.status()).toBe(200)
    const { data } = await response.json()
    // Every booking at this garage is the seed's, so its earnings are exact:
    // the customer no-show at the normal payout, the garage no-show and every
    // cancellation at nothing.
    expect(data.summary.totalEarned).toBe(499)
    expect(data.summary.jobsDone).toBe(0)
    expect(data.jobs).toEqual([
      expect.objectContaining({
        id: BOOKINGS.refundCustomerNoShow,
        amount: 499,
        settled: true,
        kind: 'customer_no_show',
      }),
    ])

    // Refunded in full by the test before, the booking is still the garage's
    // record of a cancelled job: it stays on the Cancelled tab.
    const cancelled = await ctx.request.get(`${API}/api/v1/bookings/vendor?status=cancelled`, {
      headers: { 'X-Vendor-Id': VENDORS.refunds.id },
    })
    expect(cancelled.status()).toBe(200)
    const cancelledIds = ((await cancelled.json()).data as Array<{ id: string }>).map((b) => b.id)
    expect(cancelledIds).toContain(BOOKINGS.refundDetlio)
    expect(cancelledIds).toContain(BOOKINGS.refundGarageNoShow)
    expect((await getPayment(BOOKINGS.refundDetlio))?.status).toBe('refunded')

    await ctx.close()
  })
})
