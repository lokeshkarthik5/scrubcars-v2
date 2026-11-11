/**
 * The owner deletes any booking marked Test (owner, 10 Nov 2026: "even mark
 * real bookings as test & delete them, as we will be doing a couple of tests
 * end to end fully with accepting & everything").
 *
 * The owner ('admin', E2E Admin) marks an accepted booking paid with live
 * money as Test from the bookings list, and deletes it from there: the dry
 * run says it is still on and that ₹450 was really paid and not refunded;
 * the reason and the booking's reference are typed; the payment goes to the
 * money record as not refunded; the booking is gone for the customer, the
 * garage and admin alike; and its hour is free again. A teammate who is not
 * the owner ('admin-teammate') still gets the old refusal.
 *
 * Only OWNER_DELETE's rows are read or deleted.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { OWNER_DELETE } from '../../support/seed-ids'

const O = OWNER_DELETE
const reference = (id: string) => id.slice(0, 8).toUpperCase()

/** The garage's free at-garage times on a day, as the customer app reads them. */
async function freeSlots(
  request: APIRequestContext,
  date: string
): Promise<string[]> {
  const response = await request.get(
    `${API}/api/v1/vendors/${O.garage.id}/slots`,
    {
      params: { date, service_id: O.garage.serviceId, booking_type: 'dropin' },
    }
  )
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { data: { slots: string[] } }).data.slots
}

test.describe('the owner deletes a real booking marked Test @p0', () => {
  test.use({ storageState: asRole('admin') })

  test('marked and deleted from the list: the money line, the reference, the ledger, and gone everywhere', async ({
    page,
    request,
  }) => {
    const id = O.bookings.live
    const ref = reference(id)
    // The slot it holds, read back rather than recomputed around midnight.
    const [held] = await sql<{ scheduled_at: Date; day: string }[]>`
      select scheduled_at, to_char(scheduled_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day
        from bookings where id = ${id}
    `
    const slot = new Date(held!.scheduled_at).toISOString()
    expect(await freeSlots(request, held!.day)).not.toContain(slot)

    await page.goto(`/bookings?q=%23${ref}`)
    await page.getByRole('button', { name: `Details for #${ref}` }).click()
    const details = page.getByRole('complementary', { name: 'Booking details' })
    await details.getByRole('button', { name: 'Mark as test…' }).click()
    const sheet = page.getByRole('dialog', {
      name: `Mark #${ref} as a test booking?`,
    })
    await expect(sheet.getByText('real money', { exact: false })).toBeVisible()
    await sheet.getByRole('button', { name: 'Mark as test' }).click()
    await expect(sheet).toBeHidden()

    await details.getByRole('button', { name: 'Delete test booking…' }).click()
    const dialog = page.getByRole('dialog', {
      name: `Delete test booking #${ref}`,
    })
    await expect(
      dialog.getByText(
        'This booking is still on. Deleting it removes it for the customer and the garage without telling them.'
      )
    ).toBeVisible()
    await expect(
      dialog.getByText(
        "₹450 was really paid and has not been refunded (Razorpay pay_LiveOwnerDel1). Deleting doesn't refund it — refund it in Razorpay first if the money should go back."
      )
    ).toBeVisible()
    await expect(
      dialog.getByText(
        '1 real payment (not refunded; kept in the money record)',
        { exact: true }
      )
    ).toBeVisible()

    // The reason and the reference, not the phrase.
    const confirm = dialog.getByRole('button', {
      name: `Delete booking #${ref}`,
    })
    const typed = dialog.getByLabel(
      `Type the booking reference ${ref} to confirm`
    )
    await typed.fill(ref.toLowerCase())
    await expect(confirm).toBeDisabled()
    await dialog
      .getByLabel('Why is it being deleted?')
      .fill('End-to-end test with accepting')
    await expect(confirm).toBeEnabled()
    await typed.fill('DE1E0000')
    await expect(confirm).toBeDisabled()
    await typed.fill(`#${ref}`)
    await confirm.click()
    await expect(dialog.getByText('Done. Deleted by E2E Admin.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Done' }).click()
    // The list is read again and the panel closes: the row and its details
    // go, rather than staying until the next refocus.
    await expect(dialog).toBeHidden()
    await expect(details).toBeHidden()
    await expect(
      page.getByRole('button', { name: `Details for #${ref}` })
    ).toHaveCount(0)

    // The money record: really paid, not refunded, with who and why.
    const [ledger] = await sql<
      {
        kind: string
        state: string
        amount: string
        refunded_amount: string
        razorpay_payment_id: string
        reason: string
        deleted_by_name: string
      }[]
    >`
      select kind, state, amount, refunded_amount, razorpay_payment_id, reason, deleted_by_name
        from deleted_test_payments where root_booking_id = ${id}
    `
    expect(ledger).toEqual({
      kind: 'booking',
      state: 'not_refunded',
      amount: '450.00',
      refunded_amount: '0.00',
      razorpay_payment_id: 'pay_LiveOwnerDel1',
      reason: 'End-to-end test with accepting',
      deleted_by_name: 'E2E Admin',
    })
    const [audit] = await sql<{ by_owner: boolean }[]>`
      select (summary->>'byOwner')::boolean as by_owner from admin_audit_log
       where action = 'test_booking_deleted' and detail->'chains'->0->>'rootId' = ${id}
    `
    expect(audit).toEqual({ by_owner: true })

    // Gone for admin, the customer and the garage.
    expect(
      (await page.request.get(`${API}/api/v1/admin/bookings/${id}`)).status()
    ).toBe(404)
    const customer = await loginViaApi(O.customer.phone)
    expect((await customer.get(`${API}/api/v1/bookings/${id}`)).status()).toBe(
      404
    )
    await customer.dispose()
    const garage = await loginViaApi(O.owner.phone, 'vendor')
    expect(
      (
        await garage.get(`${API}/api/v1/bookings/${id}`, {
          headers: { 'x-vendor-id': O.garage.id },
        })
      ).status()
    ).toBe(404)
    await garage.dispose()

    // Its hour is free again.
    expect(await freeSlots(request, held!.day)).toContain(slot)
  })
})

test.describe('anyone but the owner keeps the old rules @p0', () => {
  test.use({ storageState: asRole('admin-teammate') })

  test('a Test booking with live money not refunded is refused, saying why', async ({
    page,
  }) => {
    const id = O.bookings.teammateLive
    const ref = reference(id)
    expect(
      (await (await page.request.get(`${API}/api/v1/admin/me`)).json()).data
        .canDeleteAnything
    ).toBe(false)

    await page.goto(`/bookings/${id}`)
    await page.getByRole('button', { name: 'Delete test booking…' }).click()
    const dialog = page.getByRole('dialog', {
      name: `Delete test booking #${ref}`,
    })
    await expect(dialog.getByRole('alert')).toHaveText(
      "This booking can't be deleted. Real payment — refund it first: Refund ₹450 first. A booking marked Test that took real money can be deleted as a team test only once every rupee is refunded."
    )

    const preview = await page.request.post(
      `${API}/api/v1/admin/bookings/${id}/test-delete/preview`,
      { data: {} }
    )
    const dryRun = (await preview.json()).data
    expect(dryRun.chains[0].kept.code).toBe('refund_first')
    expect(dryRun.confirmKind).toBe('phrase')
    const refused = await page.request.post(
      `${API}/api/v1/admin/bookings/${id}/test-delete`,
      {
        data: {
          selectionHash: dryRun.selectionHash,
          confirmText: ref,
          reason: 'Trying anyway',
          unknownIds: [],
        },
      }
    )
    expect(refused.status()).toBe(409)
    expect(await refused.json()).toMatchObject({
      success: false,
      code: 'TEST_BOOKING_KEPT',
    })
    expect((await sql`select 1 from bookings where id = ${id}`).length).toBe(1)
  })

  test('sees none of the owner-only buttons, and the API refuses the deletes', async ({
    page,
  }) => {
    // Rows nobody deletes, so this never races the owner's deletes elsewhere.
    await page.goto(`/complaints/${O.keptComplaint}`)
    await expect(
      page.getByRole('heading', { name: /^Complaint C-/ })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Delete complaint…' })
    ).toHaveCount(0)

    await page.goto(`/customers/${O.customer.id}`)
    await expect(
      page.getByRole('heading', { name: O.customer.name })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Delete customer account…' })
    ).toHaveCount(0)

    await page.goto(`/vendors/${O.garage.id}/edit?tab=reviews`)
    await expect(
      page.getByText('Seeded: nobody deletes this review.')
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /^Delete the \d-star review/ })
    ).toHaveCount(0)

    await page.goto(`/bookings?q=%23${reference(O.bookings.teammateLive)}`)
    await page
      .getByRole('button', {
        name: `Details for #${reference(O.bookings.teammateLive)}`,
      })
      .click()
    // The list's Delete test booking is everyone's; the server says no (above).
    await expect(
      page
        .getByRole('complementary', { name: 'Booking details' })
        .getByRole('button', { name: 'Delete test booking…' })
    ).toBeVisible()

    const refused = await page.request.delete(
      `${API}/api/v1/admin/owner-delete/reviews/${O.review}`,
      { data: {} }
    )
    expect(refused.status()).toBe(403)
    expect(await refused.json()).toEqual({
      success: false,
      message: 'Only the owner can delete this.',
      code: 'ADMIN_OWNER_ONLY',
    })
  })
})
