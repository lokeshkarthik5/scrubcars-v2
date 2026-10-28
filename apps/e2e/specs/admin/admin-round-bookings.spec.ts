/**
 * The admin round's bookings (0061): the list's Slot column with when the
 * booking was made under it (in the side panel and on the page too), and
 * Delete test booking, which takes the booking's whole chain with its note
 * and the complaint about it after the typed phrase, and refuses a booking
 * with real money on it, saying why.
 *
 * Only CUSTOMERS.adminRound's bookings at VENDORS.roundA are read or
 * deleted (BOOKINGS.round*). Delete test booking works whether or not Start
 * pilot clean is switched on: this stack has it on, so the "off" case is the
 * route test apps/server/src/modules/data-reset/test-booking.routes.test.ts.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS, ROUND } from '../../support/seed-ids'

/** "#AD200003": the reference as the panel shows it. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

const bookingExists = async (id: string) =>
  (await sql`select 1 from bookings where id = ${id}`).length > 0
const complaintExists = async (id: string) =>
  (await sql`select 1 from complaints where id = ${id}`).length > 0
const notesOf = async (bookingId: string) =>
  (await sql`select 1 from booking_notes where booking_id = ${bookingId}`)
    .length

test.use({ storageState: asRole('admin') })

test.describe('the admin round: bookings @p0', () => {
  test('the list says Slot, with when it was booked under it, as do the side panel and the page', async ({
    page,
  }) => {
    const ref = reference(BOOKINGS.roundSlot)
    await page.goto(`/bookings?q=%23${ref}`)
    const link = page.getByRole('link', {
      name: `Open booking #${ref} for ${CUSTOMERS.adminRound.name}`,
    })
    await expect(link).toBeVisible()

    // The column is the appointment, named so; "When" is gone.
    await expect(page.getByRole('columnheader', { name: 'Slot' })).toBeVisible()
    await expect(
      page.getByRole('columnheader', { name: 'When', exact: true })
    ).toHaveCount(0)
    // Booked a day before the seed ran.
    const booked = /^Booked yesterday, \d{1,2}:\d{2} [ap]m$/
    const row = page.getByRole('row').filter({ has: link })
    await expect(row.getByText(booked)).toBeVisible()

    await page.getByRole('button', { name: `Details for #${ref}` }).click()
    const details = page.getByRole('complementary', { name: 'Booking details' })
    await expect(details.getByText(booked)).toBeVisible()
    await details.getByRole('link', { name: 'Open full page' }).click()

    await expect(
      page.getByRole('heading', { name: `Booking #${ref}` })
    ).toBeVisible()
    await expect(page.getByText(booked)).toBeVisible()
  })

  test('Delete test booking takes the booking with its note and its complaint, after the typed phrase', async ({
    page,
  }) => {
    const id = BOOKINGS.roundDelete
    const ref = reference(id)
    expect(await complaintExists(ROUND.complaint)).toBe(true)
    expect(await notesOf(id)).toBeGreaterThan(0)

    await page.goto(`/bookings/${id}`)
    await expect(
      page.getByRole('heading', { name: `Booking #${ref}` })
    ).toBeVisible()
    await expect(
      page.getByRole('switch', { name: 'Mark as test' })
    ).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: 'Delete test booking…' }).click()
    const dialog = page.getByRole('dialog', {
      name: `Delete test booking #${ref}`,
    })
    await expect(dialog.getByText('This deletes, for good:')).toBeVisible()
    await expect(dialog.getByText('1 booking', { exact: true })).toBeVisible()
    await expect(dialog.getByText('1 complaint', { exact: true })).toBeVisible()
    await expect(dialog.getByText('1 team note', { exact: true })).toBeVisible()
    // One test booking: no backup tick and no list to download, only the phrase.
    await expect(
      dialog.getByLabel('I have a database backup from today')
    ).toHaveCount(0)
    await expect(
      dialog.getByRole('button', { name: 'Download list (CSV)' })
    ).toHaveCount(0)

    const confirm = dialog.getByRole('button', { name: 'Delete 1 booking' })
    await expect(confirm).toBeDisabled()
    const phrase = dialog.getByLabel('Type DELETE 1 BOOKING to confirm')
    await phrase.fill('delete 1 booking')
    await expect(confirm).toBeDisabled()
    await phrase.fill('DELETE 1 BOOKING')
    await expect(confirm).toBeEnabled()
    await confirm.click()

    await expect(dialog.getByText('Done. Deleted by E2E Admin.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(/\/bookings$/)

    expect(await bookingExists(id)).toBe(false)
    expect(await complaintExists(ROUND.complaint)).toBe(false)
    expect(await notesOf(id)).toBe(0)
    // Recorded as its own action, signed by the session.
    const [audit] = await sql<{ action: string; actor_name: string }[]>`
      select action, actor_name from admin_audit_log
       where action = 'test_booking_deleted' and detail->'chains'->0->>'rootId' = ${id}
    `
    expect(audit).toEqual({
      action: 'test_booking_deleted',
      actor_name: 'E2E Admin',
    })
  })

  test('a Test booking paid with real money is kept, and says why', async ({
    page,
  }) => {
    const id = BOOKINGS.roundLive
    const ref = reference(id)
    await page.goto(`/bookings/${id}`)
    await page.getByRole('button', { name: 'Delete test booking…' }).click()
    const dialog = page.getByRole('dialog', {
      name: `Delete test booking #${ref}`,
    })
    await expect(dialog.getByRole('alert')).toHaveText(
      "This booking can't be deleted. Real payment — kept: Razorpay says this was a live payment."
    )
    await expect(
      dialog.getByRole('button', { name: /^Delete 1 booking/ })
    ).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Go back' }).click()
    await expect(dialog).toHaveCount(0)

    // At the API, the delete is refused with the reason whatever is sent.
    const preview = await page.request.post(
      `${API}/api/v1/admin/bookings/${id}/test-delete/preview`,
      { data: {} }
    )
    expect(preview.status()).toBe(200)
    const dryRun = (await preview.json()).data
    expect(dryRun.chains[0].kept.code).toBe('live')
    const refused = await page.request.post(
      `${API}/api/v1/admin/bookings/${id}/test-delete`,
      {
        data: {
          selectionHash: dryRun.selectionHash,
          confirmText: 'DELETE 1 BOOKING',
          unknownIds: [],
        },
      }
    )
    expect(refused.status()).toBe(409)
    expect(await refused.json()).toMatchObject({ code: 'TEST_BOOKING_KEPT' })
    expect(await bookingExists(id)).toBe(true)
  })

  test('a booking that is not there is a 404, and a customer gets no further than an admin check', async ({
    page,
  }) => {
    const missing = await page.request.post(
      `${API}/api/v1/admin/bookings/00000000-0000-4000-8000-0000000fffff/test-delete/preview`,
      { data: {} }
    )
    expect(missing.status()).toBe(404)

    const customer = await loginViaApi(CUSTOMERS.adminRound.phone)
    const response = await customer.post(
      `${API}/api/v1/admin/bookings/${BOOKINGS.roundLive}/test-delete/preview`,
      {
        data: {},
      }
    )
    expect(response.status()).toBe(403)
    await customer.dispose()
  })
})
