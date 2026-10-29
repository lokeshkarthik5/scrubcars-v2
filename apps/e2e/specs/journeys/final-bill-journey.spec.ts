/**
 * Job records and the final bill of an inspection job, across the garage
 * portal and the customer app.
 *
 * The customer prepaid ₹299 for an inspection at INSPECT. The garage raises
 * the final bill in its portal; above the fee, the customer sees it on their
 * booking and pays the balance with the (stubbed) Razorpay sheet; at or below
 * it, there is nothing more to pay. A third job is accepted, photographed,
 * started and completed through the portal, and each step's time is on the
 * booking afterwards. A fourth bill is paid with the app never confirming it,
 * so the Razorpay webhook settles it — from the order id alone, as a payment
 * can arrive without its order's notes. The closing assertions are on the
 * database, which is the only place both apps agree.
 */
import { createHmac } from 'node:crypto'
import { answerCookieQuestion } from '../../support/consent'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi, statePath } from '../../support/auth'
import {
  bookingNotes,
  getBooking,
  getFinalBills,
  getJobPhotos,
} from '../../support/db'
import { openActors } from '../../support/journey'
import { lastPaymentOptions } from '../../support/network'
import { BOOKINGS, CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

const PIXEL = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/pixel.png'
)
const ADMIN_ORIGIN = 'http://localhost:3002'

test.describe.configure({ mode: 'serial' })

test.describe('final bill @p0', () => {
  test('a bill above the inspection fee is paid in the app', async ({
    browser,
  }) => {
    const { customer, vendor, close } = await openActors(
      browser,
      'customer-billPayer',
      VENDORS.inspect.id,
      'vendor-inspect'
    )
    const name = CUSTOMERS.billPayer.name

    // ── the garage raises the bill, from the job's page ────────────────────
    await vendor.goto(`/bookings/${BOOKINGS.billDue}`)
    await vendor
      .getByRole('button', { name: `Raise final bill for ${name}` })
      .click()

    const sheet = vendor.getByRole('dialog', { name: `Final bill for ${name}` })
    // A first bill starts from what was booked, so the inspection the
    // customer already paid for is on it and is not lost from the total.
    await expect(sheet.getByLabel('Line 1', { exact: true })).toHaveValue(
      SERVICES.inspectFee.name
    )
    await expect(sheet.getByLabel('Line 1 amount in rupees')).toHaveValue('299')
    await expect(
      sheet.getByText(`Paid at booking for: ${SERVICES.inspectFee.name} ₹299`)
    ).toBeVisible()
    await sheet.getByRole('button', { name: 'Add line' }).click()
    await sheet
      .getByLabel('Line 2', { exact: true })
      .fill('Rear bumper dent repair')
    await sheet.getByLabel('Line 2 amount in rupees').fill('1900')
    await sheet.getByRole('button', { name: 'Add line' }).click()
    await sheet.getByLabel('Line 3', { exact: true }).fill('Paint and polish')
    await sheet.getByLabel('Line 3 amount in rupees').fill('301.50')

    // The live figures are what the customer will be asked: 2500.50 − 299.
    await expect(sheet.getByText('Customer pays in the app')).toBeVisible()
    await expect(sheet.getByText('₹2,201.50')).toBeVisible()
    await sheet.getByRole('button', { name: 'Send final bill' }).click()

    await expect
      .poll(async () => (await getFinalBills(BOOKINGS.billDue))[0]?.status)
      .toBe('due')
    const [raised] = await getFinalBills(BOOKINGS.billDue)
    expect(raised.total_amount).toBe('2500.50')
    expect(raised.paid_before).toBe('299.00')
    expect(raised.amount_due).toBe('2201.50')
    expect(raised.lines).toEqual([
      { description: SERVICES.inspectFee.name, amount: '299.00' },
      { description: 'Rear bumper dent repair', amount: '1900.00' },
      { description: 'Paint and polish', amount: '301.50' },
    ])

    // An unpaid bill can still be replaced from the job's page.
    await expect(
      vendor.getByRole('button', { name: `Replace final bill for ${name}` })
    ).toBeVisible()

    // ── nobody else can see it or pay it ───────────────────────────────────
    const stranger = await loginViaApi(CUSTOMERS.billStranger.phone)
    const strangerPay = await stranger.post(
      `${API}/api/v1/bookings/${BOOKINGS.billDue}/charges/${raised.id}/pay`
    )
    expect(strangerPay.status()).toBe(404)
    expect(await strangerPay.json()).toEqual({
      success: false,
      message: 'Bill not found',
      code: 'CHARGE_NOT_FOUND',
    })
    expect(
      (
        await stranger.get(`${API}/api/v1/bookings/${BOOKINGS.billDue}`)
      ).status()
    ).toBe(404)
    await stranger.dispose()

    // ── the customer sees the bill and pays the balance ────────────────────
    await customer.goto(`/bookings/${BOOKINGS.billDue}`)
    await expect(
      customer.getByRole('heading', { name: 'Final bill' })
    ).toBeVisible()
    await expect(customer.getByText('Rear bumper dent repair')).toBeVisible()
    await expect(customer.getByText('−₹299')).toBeVisible()
    await customer.getByRole('button', { name: 'Pay ₹2,201.50' }).click()

    await expect
      .poll(async () => (await getFinalBills(BOOKINGS.billDue))[0]?.status)
      .toBe('paid')
    const options = await lastPaymentOptions(customer)
    expect(options?.amount).toBe(220150)
    expect(String(options?.order_id)).toMatch(/^order_e2e_/)

    const [paid] = await getFinalBills(BOOKINGS.billDue)
    expect(paid.id).toBe(raised.id)
    expect(paid.gateway_order_id).toBe(options?.order_id)
    expect(paid.gateway_payment_id).toMatch(/^pay_e2e_/)
    expect(paid.paid_at).not.toBeNull()

    // "Paid on 5 Oct" — not the booking's own "Paid online" above it — and
    // the figure is what was paid, no longer "To pay".
    await expect(customer.getByText(/Paid on \d{1,2} \w{3,4}/)).toBeVisible()
    await expect(
      customer.getByText('Paid in the app', { exact: true })
    ).toBeVisible()
    await expect(customer.getByText('To pay', { exact: true })).toHaveCount(0)
    await expect(customer.getByRole('button', { name: /^Pay / })).toHaveCount(0)

    // Paying again is refused rather than opening a second order.
    const again = await customer.request.post(
      `${API}/api/v1/bookings/${BOOKINGS.billDue}/charges/${raised.id}/pay`
    )
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('CHARGE_ALREADY_PAID')

    // ── the garage sees it paid, and can no longer change it ───────────────
    await vendor.reload()
    await expect(vendor.getByText(/Paid in app/)).toBeVisible()
    await expect(
      vendor.getByRole('button', { name: `Replace final bill for ${name}` })
    ).toHaveCount(0)

    // ── ops sees the bill and the payment id to find it by ─────────────────
    const adminCtx = await browser.newContext({
      storageState: statePath('admin'),
      baseURL: ADMIN_ORIGIN,
    })
    await answerCookieQuestion(adminCtx)
    const admin = await adminCtx.newPage()
    await admin.goto(`/bookings/${BOOKINGS.billDue}`)
    await expect(
      admin.getByText('Paid in the app', { exact: true })
    ).toBeVisible()
    await expect(
      admin.getByRole('button', {
        name: `Copy Razorpay payment id ${paid.gateway_payment_id}`,
      })
    ).toBeVisible()
    await adminCtx.close()

    await close()
  })

  test('a bill no more than the fee leaves nothing to pay', async ({
    browser,
  }) => {
    const { customer, vendor, close } = await openActors(
      browser,
      'customer-billSmall',
      VENDORS.inspect.id,
      'vendor-inspect'
    )
    const name = CUSTOMERS.billSmall.name

    await vendor.goto(`/bookings/${BOOKINGS.billNone}`)
    await vendor
      .getByRole('button', { name: `Raise final bill for ${name}` })
      .click()

    const sheet = vendor.getByRole('dialog', { name: `Final bill for ${name}` })
    await sheet
      .getByLabel('Line 1', { exact: true })
      .fill('Minor dent, pushed out')
    await sheet.getByLabel('Line 1 amount in rupees').fill('150')
    await expect(sheet.getByText('Nothing more to pay')).toBeVisible()
    await sheet.getByRole('button', { name: 'Send final bill' }).click()

    await expect
      .poll(async () => (await getFinalBills(BOOKINGS.billNone))[0]?.status)
      .toBe('not_needed')
    const [bill] = await getFinalBills(BOOKINGS.billNone)
    expect(bill.amount_due).toBe('0.00')
    expect(bill.gateway_order_id).toBeNull()

    await customer.goto(`/bookings/${BOOKINGS.billNone}`)
    await expect(
      customer.getByRole('heading', { name: 'Final bill' })
    ).toBeVisible()
    await expect(customer.getByText(/Nothing more to pay/)).toBeVisible()
    await expect(customer.getByRole('button', { name: /^Pay / })).toHaveCount(0)

    // And the API agrees: there is no order to open.
    const pay = await customer.request.post(
      `${API}/api/v1/bookings/${BOOKINGS.billNone}/charges/${bill.id}/pay`
    )
    expect(pay.status()).toBe(400)
    expect((await pay.json()).code).toBe('CHARGE_NOT_DUE')

    await close()
  })
})

test.describe('final bill webhook @p0', () => {
  /** A payment.captured delivery as Razorpay signs it, with no notes on the payment. */
  const deliver = (payment: {
    id: string
    orderId: string
    amountPaise: number
  }) => {
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: payment.id,
            order_id: payment.orderId,
            status: 'captured',
            amount: payment.amountPaise,
          },
        },
      },
    })
    const signature = createHmac(
      'sha256',
      process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
    )
      .update(body)
      .digest('hex')
    return { body, signature }
  }

  test('a bill the app never confirmed is settled by the webhook from its order id', async ({
    browser,
  }) => {
    const bookingId = BOOKINGS.billWebhook
    const vendorCtx = await browser.newContext({
      storageState: statePath('vendor-inspect'),
    })
    await answerCookieQuestion(vendorCtx)
    const customer = await loginViaApi(CUSTOMERS.billWebhook.phone)

    const raised = await vendorCtx.request.post(
      `${API}/api/v1/vendors/me/bookings/${bookingId}/final-bill`,
      {
        headers: { 'X-Vendor-Id': VENDORS.inspect.id },
        data: {
          lines: [
            { description: SERVICES.inspectFee.name, amount: 299 },
            { description: 'Door ding repair', amount: 1200 },
          ],
        },
      }
    )
    expect(raised.ok()).toBe(true)
    const bill = (await raised.json()).data
    expect(bill.status).toBe('due')
    expect(bill.amountDue).toBe('1200.00')

    // The customer opens the checkout, pays, and their app never comes back.
    const pay = await customer.post(
      `${API}/api/v1/bookings/${bookingId}/charges/${bill.id}/pay`
    )
    expect(pay.ok()).toBe(true)
    const order = (await pay.json()).data
    expect(order.amount).toBe(120000)

    const post = (delivery: { body: string; signature: string }) =>
      customer.post(`${API}/api/v1/payments/webhook`, {
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': delivery.signature,
        },
        data: delivery.body,
      })

    const first = deliver({
      id: 'pay_e2e_webhook_1',
      orderId: order.orderId,
      amountPaise: 120000,
    })
    const settled = await post(first)
    expect(settled.status()).toBe(200)
    expect(await settled.json()).toEqual({
      success: true,
      data: { handled: true, event: 'payment.captured' },
    })

    const [paid] = await getFinalBills(bookingId)
    expect(paid.id).toBe(bill.id)
    expect(paid.status).toBe('paid')
    expect(paid.gateway_payment_id).toBe('pay_e2e_webhook_1')

    // Razorpay redelivers: nothing changes and nothing is noted.
    expect((await post(first)).status()).toBe(200)
    expect((await getFinalBills(bookingId))[0].gateway_payment_id).toBe(
      'pay_e2e_webhook_1'
    )
    expect(await bookingNotes(bookingId)).toHaveLength(0)

    // A second payment on the paid bill is a refund to do, noted once for
    // ops however many times it is delivered.
    const second = deliver({
      id: 'pay_e2e_webhook_2',
      orderId: order.orderId,
      amountPaise: 120000,
    })
    expect((await post(second)).status()).toBe(200)
    expect((await post(second)).status()).toBe(200)
    const notes = await bookingNotes(bookingId)
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toContain(
      'Payment pay_e2e_webhook_2 landed for a final bill that was already paid'
    )
    expect((await getFinalBills(bookingId))[0].gateway_payment_id).toBe(
      'pay_e2e_webhook_1'
    )

    await customer.dispose()
    await vendorCtx.close()
  })
})

test.describe('job records @p0', () => {
  test('each step is timed, and a before photo reaches the customer', async ({
    browser,
  }) => {
    const { customer, vendor, vendorCtx, close } = await openActors(
      browser,
      'customer-jobRecords',
      VENDORS.inspect.id,
      'vendor-inspect'
    )
    const name = CUSTOMERS.jobRecords.name

    await vendor.goto('/bookings?tab=new')
    await vendor
      .getByRole('button', { name: `Accept booking for ${name}` })
      .click()
    // Accept waits five seconds behind its Undo (0066).
    await expect
      .poll(async () => (await getBooking(BOOKINGS.jobRecords))?.accepted_at, { timeout: 15_000 })
      .not.toBeNull()

    // A before photo, from acceptance on, on the job's page. The input is
    // inside its tile; the portal shrinks it to a JPEG before it uploads.
    await vendor.goto(`/bookings/${BOOKINGS.jobRecords}`)
    await vendor
      .getByLabel(`Add before photos for ${name}`)
      .setInputFiles(PIXEL)
    await expect
      .poll(async () => (await getJobPhotos(BOOKINGS.jobRecords)).length)
      .toBe(1)
    const [photo] = await getJobPhotos(BOOKINGS.jobRecords)
    expect(photo.stage).toBe('before')
    expect(photo.storage_key).toMatch(
      new RegExp(
        `^vendors/${VENDORS.inspect.id}/job-photos/${BOOKINGS.jobRecords}/[0-9a-f-]+\\.jpg$`
      )
    )
    // Private (.env.e2e sets R2_DOCS_BUCKET): the row holds the key, never an
    // address, and nothing is at the public photo bucket's address for it.
    // The garage's own list hands out a short-lived signed link that opens.
    expect(photo.url).toBe(photo.storage_key)
    expect(
      (
        await vendor.request.get(
          `http://localhost:9000/detlio-e2e/${photo.storage_key}`
        )
      ).status()
    ).not.toBe(200)
    const listed = await vendorCtx.request.get(
      `${API}/api/v1/vendors/me/bookings/${BOOKINGS.jobRecords}/photos`,
      {
        headers: { 'X-Vendor-Id': VENDORS.inspect.id },
      }
    )
    expect(listed.status()).toBe(200)
    const [shown] = ((await listed.json()) as { data: Array<{ url: string }> })
      .data
    expect(shown!.url).toContain('X-Amz-Signature')
    expect((await vendor.request.get(shown!.url)).status()).toBe(200)

    // A key from anywhere but this job's folder is refused.
    const forged = await vendorCtx.request.post(
      `${API}/api/v1/vendors/me/bookings/${BOOKINGS.jobRecords}/photos`,
      {
        headers: { 'X-Vendor-Id': VENDORS.inspect.id },
        data: { stage: 'before', key: `vendors/${VENDORS.main.id}/logo/x.jpg` },
      }
    )
    expect(forged.status()).toBe(400)
    expect(await forged.json()).toEqual({
      success: false,
      message: 'That upload is not for this job',
      code: 'INVALID_JOB_PHOTO_KEY',
    })

    // Not yet shown to the customer: the work has not started.
    await customer.goto(`/bookings/${BOOKINGS.jobRecords}`)
    await expect(customer.getByText('Your slot is reserved')).toBeVisible()
    await expect(
      customer.getByRole('heading', { name: 'Job photos' })
    ).toHaveCount(0)

    await vendor.getByRole('button', { name: `Start job for ${name}` }).click()
    // Five seconds of Undo first.
    await expect
      .poll(async () => (await getBooking(BOOKINGS.jobRecords))?.started_at, {
        timeout: 15_000,
      })
      .not.toBeNull()
    // The job's own page lists when each step happened.
    await expect(
      vendor.getByRole('button', { name: `Complete job for ${name}` })
    ).toBeVisible()
    await expect(
      vendor.getByText(/^Accepted .+ · Started .+[ap]m$/)
    ).toBeVisible()

    // Once it has, the photo is on the customer's booking, full size on tap.
    await customer.reload()
    await expect(
      customer.getByRole('heading', { name: 'Job photos' })
    ).toBeVisible()
    await customer
      .getByRole('button', { name: 'View before photo 1 of 1' })
      .click()
    await expect(
      customer.getByRole('dialog', { name: 'Before photo 1 of 1' })
    ).toBeVisible()
    await customer.getByRole('button', { name: 'Close' }).click()

    // No photos are needed to finish a job.
    await vendor
      .getByRole('button', { name: `Complete job for ${name}` })
      .click()
    await expect
      .poll(async () => (await getBooking(BOOKINGS.jobRecords))?.completed_at, {
        timeout: 15_000,
      })
      .not.toBeNull()

    const done = await getBooking(BOOKINGS.jobRecords)
    expect(done?.status).toBe('completed')
    expect(done!.accepted_at!.getTime()).toBeLessThanOrEqual(
      done!.started_at!.getTime()
    )
    expect(done!.started_at!.getTime()).toBeLessThanOrEqual(
      done!.completed_at!.getTime()
    )

    // The customer's timeline carries a time under each of its four steps
    // ("10:42 am", or "4 Oct, 10:42 am" for one on another day — and en-IN
    // writes September "Sept").
    await customer.reload()
    await expect(customer.getByText('Your car is ready')).toBeVisible()
    await expect(
      customer
        .getByRole('list', { name: 'Booking progress' })
        .getByText(/^(\d{1,2} \w{3,4}, )?\d{1,2}:\d{2} [ap]m$/)
    ).toHaveCount(4)

    await close()
  })
})
