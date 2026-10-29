/**
 * Pre-iOS, part A (0065): deleting a Test booking that took real money, all
 * refunded, as a team test. From its own page (with a reason; everything it
 * left for the garage and the customer goes with it) and from Start pilot
 * clean (ticked by hand, with a reason). Its payment is written to the
 * hidden ledger first, which Refunds → Done downloads as CSV.
 *
 * Only PRE_IOS.bookings.teamTest and pilotTeamTest are deleted. Start pilot
 * clean lists every booking marked Test, which other specs mark too, so the
 * run unticks everything and ticks its own alone (as data-reset.spec.ts).
 * A Test booking with live money not refunded is admin-round-bookings'.
 */
import { readFileSync } from 'node:fs'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { PRE_IOS } from '../../support/seed-ids'

const reference = (id: string) => id.slice(0, 8).toUpperCase()
const exists = async (table: string, column: string, id: string) =>
  (await sql.unsafe(`select 1 from ${table} where ${column} = $1`, [id])).length > 0

const TEAM_TEST_LINE = 'Real payment, refunded: deleted as team test, money record kept.'

test.use({ storageState: asRole('admin') })

test.describe('delete as team test @p0', () => {
  test('from its page: the reason, then everything on it goes, and its payment is kept in the ledger', async ({
    page,
  }) => {
    const id = PRE_IOS.bookings.teamTest
    const ref = reference(id)
    for (const [table, column, row] of [
      ['complaints', 'id', PRE_IOS.teamTestComplaint],
      ['bypass_reports', 'id', PRE_IOS.teamTestBypass],
      ['booking_requests', 'id', PRE_IOS.teamTestRequest],
      ['booking_intents', 'id', PRE_IOS.teamTestIntent],
    ] as const) {
      expect(await exists(table, column, row)).toBe(true)
    }

    await page.goto(`/bookings/${id}`)
    await expect(page.getByRole('heading', { name: `Booking #${ref}` })).toBeVisible()
    await page.getByRole('button', { name: 'Delete test booking…' }).click()
    const dialog = page.getByRole('dialog', { name: `Delete test booking #${ref}` })
    await expect(dialog.getByText(TEAM_TEST_LINE)).toBeVisible()
    await expect(dialog.getByText('This deletes, for good:')).toBeVisible()
    for (const line of [
      '1 booking',
      '1 complaint',
      '1 “book directly” report',
      '1 visit request',
      '1 real payment (refunded; kept in the money record)',
    ]) {
      await expect(dialog.getByText(line, { exact: true })).toBeVisible()
    }

    // The phrase alone is not enough: a real payment needs its reason.
    const confirm = dialog.getByRole('button', { name: 'Delete 1 booking' })
    await dialog.getByLabel('Type DELETE 1 BOOKING to confirm').fill('DELETE 1 BOOKING')
    await expect(confirm).toBeDisabled()
    const reason = dialog.getByLabel('Why is this a team test?')
    await reason.fill('ab')
    await expect(confirm).toBeDisabled()
    await reason.fill('Owner checked the live keys, refunded')
    await expect(confirm).toBeEnabled()
    await confirm.click()

    await expect(dialog.getByText('Done. Deleted by E2E Admin.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(/\/bookings$/)

    // Gone for the garage and the customer alike.
    expect(await exists('bookings', 'id', id)).toBe(false)
    for (const [table, column, row] of [
      ['complaints', 'id', PRE_IOS.teamTestComplaint],
      ['bypass_reports', 'id', PRE_IOS.teamTestBypass],
      ['booking_requests', 'id', PRE_IOS.teamTestRequest],
      ['booking_intents', 'id', PRE_IOS.teamTestIntent],
      ['refund_records', 'booking_id', id],
      ['payments', 'booking_id', id],
    ] as const) {
      expect(await exists(table, column, row)).toBe(false)
    }

    // The money record, with who and why.
    const [ledger] = await sql<
      {
        kind: string
        razorpay_payment_id: string
        razorpay_order_id: string
        gateway_mode: string
        amount: string
        refunded_amount: string
        reason: string
        deleted_by_name: string
        refunds: Array<{ refundRef: string; gatewayStatus: string }>
      }[]
    >`
      select kind, razorpay_payment_id, razorpay_order_id, gateway_mode, amount, refunded_amount,
             reason, deleted_by_name, refunds
        from deleted_test_payments where root_booking_id = ${id}
    `
    expect(ledger).toMatchObject({
      kind: 'booking',
      razorpay_payment_id: 'pay_LivePreIos1',
      razorpay_order_id: 'order_LivePreIos1',
      gateway_mode: 'live',
      amount: '450.00',
      refunded_amount: '450.00',
      reason: 'Owner checked the live keys, refunded',
      deleted_by_name: 'E2E Admin',
    })
    expect(ledger!.refunds).toEqual([
      expect.objectContaining({ refundRef: 'rfnd_LivePreIos1', gatewayStatus: 'processed' }),
    ])
    const [audit] = await sql<{ action: string }[]>`
      select action from admin_audit_log
       where action = 'test_booking_deleted' and detail->'chains'->0->>'rootId' = ${id}
    `
    expect(audit).toEqual({ action: 'test_booking_deleted' })

    // Refunds → Done downloads the ledger.
    await page.goto('/refunds?status=done')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Deleted team tests (CSV)' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^detlio-deleted-team-tests-\d{4}-\d{2}-\d{2}\.csv$/)
    const csv = readFileSync((await download.path())!, 'utf8')
    expect(csv).toContain('Deleted at,Deleted by,Reason,Booking')
    expect(csv).toContain(`#${ref}`)
    expect(csv).toContain('pay_LivePreIos1')
    expect(csv).toContain('"Owner checked the live keys, refunded"')
    await expect(page.getByRole('status').filter({ hasText: /^Downloaded \d+ payments?\.$/ })).toBeVisible()
  })

  test('from Start pilot clean: ticked by hand, never by Tick all, and deleted with a reason', async ({
    page,
  }) => {
    const id = PRE_IOS.bookings.pilotTeamTest
    const ref = reference(id)

    await page.goto('/data-reset')
    await page.getByRole('radio', { name: 'Only bookings marked Test' }).click()
    await page.getByRole('button', { name: /Show what.s in scope/ }).click()
    const box = page.getByRole('checkbox', { name: `Delete booking #${ref}` })
    // Offered, not ticked on the first look.
    await expect(box).toBeEnabled()
    await expect(box).not.toBeChecked()
    const row = page.getByRole('listitem').filter({ has: box })
    await expect(row.getByText(TEAM_TEST_LINE)).toBeVisible()
    // Tick all takes test money only.
    await page.getByRole('button', { name: 'Tick all' }).click()
    await expect(box).not.toBeChecked()

    await page.getByRole('button', { name: 'Tick none' }).click()
    await box.check()
    await page.getByRole('button', { name: 'Dry run' }).click()
    await expect(page.getByText('1 booking', { exact: true })).toBeVisible()
    await expect(
      page.getByText('1 real payment (refunded; kept in the money record)', { exact: true })
    ).toBeVisible()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download list (CSV)' }).click(),
    ])
    const csv = readFileSync((await download.path())!, 'utf8')
    expect(csv).toContain(`#${ref},"Deleted. Real payment, refunded: deleted as team test, money record kept"`)
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByLabel('I have a database backup from today').check()
    await page.getByLabel('Type DELETE 1 BOOKING to confirm').fill('DELETE 1 BOOKING')
    const confirm = page.getByRole('button', { name: 'Delete 1 booking' })
    await expect(confirm).toBeDisabled()
    await page.getByLabel('Why is this a team test?').fill('Pilot clean: team’s ₹450 wash')
    await expect(confirm).toBeEnabled()
    await confirm.click()

    await expect(page.getByText('Done. Deleted by E2E Admin.')).toBeVisible()
    expect(await exists('bookings', 'id', id)).toBe(false)
    const [ledger] = await sql<{ reason: string; razorpay_payment_id: string }[]>`
      select reason, razorpay_payment_id from deleted_test_payments where root_booking_id = ${id}
    `
    expect(ledger).toEqual({ reason: 'Pilot clean: team’s ₹450 wash', razorpay_payment_id: 'pay_LivePreIos2' })
  })
})
