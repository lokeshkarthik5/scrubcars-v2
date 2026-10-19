/**
 * Admin booking operations: finding a booking, internal notes, cancelling on
 * someone's behalf, and no-shows.
 *
 * The rules live in adminService (apps/server/src/modules/admin) and the pure
 * helpers in lib/booking-ops.ts. Every action here leaves an internal note,
 * and notes must never reach a customer or a garage, so the note test reads
 * the customer's own API payload as well as the database.
 *
 * Every booking is CUSTOMERS.adminOps' at MAIN, one per action, each with a
 * reference of its own (see refId in e2e-ids.ts) — the fixture ids otherwise
 * all share "E2E00000".
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { bookingNotes, getBooking, getPayment } from '../../support/db'
import { BOOKINGS, CUSTOMERS } from '../../support/seed-ids'

/** "#AD5EA7C1": the reference as customers read it out. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

/**
 * The customer's own view of a booking, through the customer API.
 *
 * A fresh login each time rather than the saved customer-adminOps state: that
 * access token lives 15 minutes from global setup, this file runs after every
 * users and vendors spec, and a bare request context has no app to refresh
 * the token for it — so a slow run would fail here on a 401.
 */
async function customerPayload(bookingId: string) {
  const customer = await loginViaApi(CUSTOMERS.adminOps.phone)
  try {
    const response = await customer.get(`/api/v1/bookings/${bookingId}`)
    expect(response.status()).toBe(200)
    return await response.json()
  } finally {
    await customer.dispose()
  }
}

test.use({ storageState: asRole('admin') })

test.describe('admin bookings @p0', () => {
  test('the list finds a booking by its reference and by the customer phone', async ({
    page,
  }) => {
    const ref = reference(BOOKINGS.adminOpsWaiting)
    const row = page.getByRole('link', {
      name: `Open booking #${ref} for ${CUSTOMERS.adminOps.name}`,
    })

    await page.goto('/bookings')
    await expect(page.getByText(/₹/).first()).toBeVisible()

    // Read out over the phone with the hash, so it is typed that way too.
    await page.getByLabel('Search bookings').fill(`#${ref}`)
    await expect(row).toBeVisible()
    // The only booking with this reference, so the search narrowed to it.
    await expect(
      page.getByRole('link', { name: /^Open booking #/ })
    ).toHaveCount(1)
    // Pending and paid 45 minutes ago: past the 30-minute mark.
    await expect(page.getByText(/Waiting\s+\d/).first()).toBeVisible()
    await expect(page.getByText('pay_seed_ops_waiting')).toBeVisible()
    // The search lives in the URL, so coming back from a booking keeps it.
    await expect(page).toHaveURL(new RegExp(`q=%23${ref}`))

    // A phone number in the format a caller gives it.
    const phone = CUSTOMERS.adminOps.phone
    await page
      .getByLabel('Search bookings')
      .fill(`+91 ${phone.slice(0, 5)} ${phone.slice(5)}`)
    // The reference results stay on screen while the phone search loads, so
    // the row above proves nothing. Wait for the phone query to reach the
    // URL, then for a booking only the phone can match: every adminOps
    // booking is this customer's, and the reference search left this one out.
    await expect(page).toHaveURL(/q=%2B91/)
    await expect(
      page.getByRole('link', {
        name: `Open booking #${reference(BOOKINGS.adminOpsNotes)} for ${CUSTOMERS.adminOps.name}`,
      })
    ).toBeVisible()
    await expect(row).toBeVisible()

    await row.click()
    // The list's search rides along, for the back arrow.
    await expect(page).toHaveURL(
      new RegExp(`/bookings/${BOOKINGS.adminOpsWaiting}\\?back=`)
    )
    await expect(
      page.getByRole('heading', { name: `Booking #${ref}` })
    ).toBeVisible()

    // The on-screen back arrow returns to the same search, not the whole list.
    await page.getByRole('link', { name: 'Go back' }).click()
    await expect(page).toHaveURL(/\/bookings\?q=%2B91/)
    await expect(page.getByLabel('Search bookings')).toHaveValue(
      `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
    )
  })

  test('a note is saved, signed, and never reaches the customer', async ({
    page,
  }) => {
    const id = BOOKINGS.adminOpsNotes
    const body = `Customer called about parking at the gate ${Date.now()}`

    await page.goto(`/bookings/${id}`)
    await expect(
      page.getByText('Only the Detlio team sees these.', { exact: false })
    ).toBeVisible()

    await page.getByLabel('Add a note').fill(body)
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByText(body)).toBeVisible()

    // Persisted, and signed by the personal E2E login the admin state uses (0058).
    await expect.poll(async () => (await bookingNotes(id))[0]?.body).toBe(body)
    expect((await bookingNotes(id))[0].author).toBe('E2E Admin')

    await page.reload()
    await expect(page.getByText(body)).toBeVisible()

    // The customer's payload has no notes at all, not merely not this one.
    const payload = await customerPayload(id)
    expect(payload.success).toBe(true)
    expect(payload.data).not.toHaveProperty('notes')
    expect(JSON.stringify(payload)).not.toContain(body)
  })

  test('ops cancels a booking on the garage’s behalf, with a reason', async ({
    page,
  }) => {
    const id = BOOKINGS.adminOpsCancel
    const reason = 'Garage called: power cut all day'

    await page.goto(`/bookings/${id}`)
    await page.getByRole('button', { name: 'Cancel booking…' }).click()

    const dialog = page.getByRole('dialog', {
      name: `Cancel booking #${reference(id)}`,
    })
    // Focus moves into the dialog, not left on the button behind it.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.closest('[role="dialog"]') !== null
        )
      )
      .toBe(true)
    const confirm = dialog.getByRole('button', {
      name: 'Cancel booking',
      exact: true,
    })
    // Nothing is pre-chosen: whose call it was is always a decision.
    await expect(confirm).toBeDisabled()
    await dialog.getByRole('radio', { name: 'The garage' }).check()
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Reason').fill(reason)
    // Paid online, so the dialog says a refund is due before the click.
    await expect(
      dialog.getByText(/was paid online\. Refund it in Razorpay/)
    ).toBeVisible()
    await confirm.click()

    await expect(dialog).toBeHidden()
    await expect(
      page.getByText("Cancelled by Detlio at the garage's request").first()
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Cancel booking…' })
    ).toHaveCount(0)

    const row = await getBooking(id)
    expect(row?.status).toBe('cancelled')
    expect(row?.cancelled_by).toBe('admin')
    expect(row?.cancelled_on_behalf_of).toBe('garage')
    expect(row?.cancellation_reason).toBe(reason)
    expect(row?.cancelled_at).not.toBeNull()
    expect(row?.no_show).toBeNull()
    // The action left its own note behind.
    expect((await bookingNotes(id)).map((note) => note.body)).toContain(
      `Cancelled on behalf of the garage. Reason: ${reason}`
    )

    // The customer is told who and why.
    const payload = await customerPayload(id)
    expect(payload.data.cancelledBy).toBe('admin')
    expect(payload.data.cancelledOnBehalfOf).toBe('garage')
    expect(payload.data.cancellationReason).toBe(reason)
  })

  test('a customer no-show cancels the booking and keeps the payment', async ({
    page,
  }) => {
    const id = BOOKINGS.adminOpsNoShow

    await page.goto(`/bookings/${id}`)
    await page.getByRole('button', { name: 'Mark no-show…' }).click()

    const dialog = page.getByRole('dialog', { name: /as a no-show/ })
    await dialog
      .getByRole('radio', { name: "The customer didn't turn up" })
      .check()
    // The money consequence is spelled out before the click.
    await expect(
      dialog.getByText(/The payment is kept\. No refund/)
    ).toBeVisible()
    await dialog
      .getByRole('button', { name: 'Mark no-show', exact: true })
      .click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText('Customer no-show').first()).toBeVisible()

    const row = await getBooking(id)
    expect(row?.status).toBe('cancelled')
    expect(row?.cancelled_by).toBe('admin')
    expect(row?.cancelled_on_behalf_of).toBe('detlio')
    expect(row?.no_show).toBe('customer')
    expect(row?.no_show_marked_at).not.toBeNull()
    // Per the policy: the garage held the slot, so the money stays.
    expect((await getPayment(id))?.status).toBe('paid')

    const payload = await customerPayload(id)
    expect(payload.data.noShow).toBe('customer')
  })

  test('a no-show is refused before the start time', async ({ page }) => {
    const id = BOOKINGS.adminOpsTooEarly

    // The page does not offer it…
    await page.goto(`/bookings/${id}`)
    await expect(
      page.getByText('A no-show can be marked once the start time has passed.')
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Mark no-show…' })
    ).toHaveCount(0)

    // …and the server holds the line on its own.
    const response = await page.request.post(
      `${API}/api/v1/admin/bookings/${id}/no-show`,
      {
        data: { party: 'customer' },
      }
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('NO_SHOW_TOO_EARLY')
    expect(body.message).toMatch(/start time has passed/i)

    const row = await getBooking(id)
    expect(row?.status).toBe('confirmed')
    expect(row?.no_show).toBeNull()
    expect(await bookingNotes(id)).toHaveLength(0)
  })

  test('a cancellation without a reason is refused', async ({ page }) => {
    const id = BOOKINGS.adminOpsTooEarly

    const response = await page.request.post(
      `${API}/api/v1/admin/bookings/${id}/cancel`,
      {
        data: { onBehalfOf: 'detlio', reason: '   ' },
      }
    )
    expect(response.status()).toBe(400)
    expect((await getBooking(id))?.status).toBe('confirmed')
  })
})
