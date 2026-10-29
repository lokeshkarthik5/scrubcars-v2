/**
 * Start pilot clean, at the admin API: the dry run, the refusals, and a
 * delete that takes exactly what the dry run showed and keeps real money.
 *
 * The E2E stack runs with ADMIN_DATA_RESET=on, so the switch-off case (every
 * route a 404) is unit-tested instead, in
 * apps/server/src/middleware/feature-switch.middleware.test.ts; this file
 * checks the switch reads as on. The rules themselves (chains, money,
 * receipts, the fingerprint) are unit-tested in lib/data-reset.test.ts.
 *
 * Only CUSTOMERS.dataReset's rows at VENDORS.reset are ever deleted: every
 * delete names its chains (`only`, or one booking), so a run never reaches
 * another spec's bookings, which all sit before "now" too. See
 * BOOKINGS.reset* for what each fixture is for. Razorpay is never asked
 * (E2E_FAKE_PAYMENTS): a payment with no recorded mode is unknown, and kept.
 */
import { randomUUID } from 'node:crypto'
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { getReceiptNumber, sql } from '../../support/db'
import { ADMIN_LOGINS, BOOKING_INTENTS, BOOKINGS, CUSTOMERS } from '../../support/seed-ids'

const RESET = `${API}/api/v1/admin/data-reset`

/** The chains the bulk delete names: two to delete, four that must stay. */
const CHAINS = [
  BOOKINGS.resetRefunded,
  BOOKINGS.resetMovedFrom,
  BOOKINGS.resetLive,
  BOOKINGS.resetUnknown,
  BOOKINGS.resetNextReceipt,
  BOOKINGS.resetOpenOrder,
]
const CHECKOUTS = [BOOKING_INTENTS.resetFailed, BOOKING_INTENTS.resetAbandoned]

const bookingExists = async (id: string) =>
  (await sql`select 1 from bookings where id = ${id}`).length === 1
const intentExists = async (id: string) =>
  (await sql`select 1 from booking_intents where id = ${id}`).length === 1

test.use({ storageState: asRole('admin') })

test.describe('start pilot clean, API @p0', () => {
  test('the switch is on in this stack', async ({ page }) => {
    const response = await page.request.get(`${RESET}/config`)
    expect(response.status()).toBe(200)
    const { success, data } = await response.json()
    expect(success).toBe(true)
    // No Razorpay here: fake payments, so nothing is ever looked up.
    expect(data).toMatchObject({ enabled: true, keyMode: 'fake', maxChainsPerRun: 300 })
  })

  test('a customer gets no further than an admin check', async () => {
    const customer = await loginViaApi(CUSTOMERS.dataReset.phone)
    const response = await customer.post(`${RESET}/preview`, {
      data: { scope: { kind: 'marked_test' } },
    })
    expect(response.status()).toBe(403)
    await customer.dispose()
  })

  test('a cutoff run lists the fixtures, keeps real money, and counts what the ticked ones delete', async ({
    page,
  }) => {
    const cutoff = new Date().toISOString()

    // The first look: everything before now, every deletable row ticked.
    const first = await page.request.post(`${RESET}/preview`, {
      data: { scope: { kind: 'before_cutoff', cutoff } },
    })
    expect(first.status()).toBe(200)
    const listing = (await first.json()).data
    const chain = (id: string) =>
      listing.chains.find((row: { rootId: string }) => row.rootId === id)
    expect(chain(BOOKINGS.resetRefunded)).toMatchObject({
      selected: true,
      kept: null,
      money: 'test',
      receiptNumber: 'DTL/22-23/000001',
      refunded: '499.00',
    })
    expect(chain(BOOKINGS.resetMovedFrom)).toMatchObject({
      bookingIds: [BOOKINGS.resetMovedFrom, BOOKINGS.resetMovedTo],
      selected: true,
    })
    expect(chain(BOOKINGS.resetLive)).toMatchObject({
      selected: false,
      money: 'live',
      kept: { code: 'live', label: 'Real payment — kept' },
    })
    expect(chain(BOOKINGS.resetUnknown)).toMatchObject({
      selected: false,
      money: 'unknown',
      kept: { code: 'unknown', label: 'Real payment — kept' },
    })
    // Nothing paid yet, but its live order could still be captured.
    expect(chain(BOOKINGS.resetOpenOrder)).toMatchObject({
      selected: false,
      money: 'no_money',
      kept: { code: 'open_order', label: 'Payment may still arrive — kept' },
    })
    expect(
      listing.checkouts.filter((row: { id: string }) => CHECKOUTS.includes(row.id))
    ).toHaveLength(2)

    // The dry run of exactly the fixtures.
    const dryRun = await page.request.post(`${RESET}/preview`, {
      data: {
        scope: { kind: 'before_cutoff', cutoff },
        only: { chainIds: CHAINS, checkoutIds: CHECKOUTS },
      },
    })
    expect(dryRun.status()).toBe(200)
    const plan = (await dryRun.json()).data
    expect(plan.counts).toEqual({
      bookings: 2,
      bookingRows: 3,
      bookingItems: 3,
      payments: 3,
      finalBills: 0,
      // The booking's own refund, and the failed checkout's.
      refundRecords: 2,
      photos: 1,
      notes: 1,
      reviews: 0,
      promoUses: 0,
      reschedules: 1,
      // resetRefunded's own checkout, and the two that became no booking.
      checkouts: 3,
      checkoutItems: 3,
      receiptNumbers: 2,
      // Complaints made before the cutoff go only with their own tick, which
      // this dry run leaves off: the complaint journey's must survive it.
      complaints: 0,
      // Usage events too go only with their own tick, left off here.
      analyticsEvents: 0,
      // No garage payout paid these test bookings.
      payouts: 0,
      // 0065: no "book directly" report, visit request or real payment on them.
      bypassReports: 0,
      requests: 0,
      teamTestPayments: 0,
    })
    expect(plan.receiptPlan).toEqual([
      {
        financialYear: '22-23',
        mode: 'restart',
        numbers: ['DTL/22-23/000001'],
        nextNumber: 'DTL/22-23/000001',
        voidsCleared: 1,
        words: 'Numbering restarts at DTL/22-23/000001',
      },
      {
        financialYear: '23-24',
        mode: 'void',
        numbers: ['DTL/23-24/000002'],
        nextNumber: 'DTL/23-24/000003',
        voidsCleared: 0,
        words: 'Receipt DTL/23-24/000002 is kept on record as void. The next receipt is DTL/23-24/000003',
      },
    ])
    expect(plan.confirmPhrase).toBe('DELETE 2 BOOKINGS')
    expect(plan.selectionHash).toMatch(/^[0-9a-f]{64}$/)
    expect(plan.countLines).toContain('2 bookings')

    // The dry run still lists the whole scope, so its CSV can say what
    // happens to every row: the kept with their reasons, the unticked too.
    const row = (id: string) => plan.chains.find((c: { rootId: string }) => c.rootId === id)
    expect(row(BOOKINGS.resetRefunded)).toMatchObject({ selected: true })
    expect(row(BOOKINGS.resetLive)).toMatchObject({ selected: false, kept: { code: 'live' } })
    expect(row(BOOKINGS.resetOpenOrder)).toMatchObject({ selected: false, kept: { code: 'open_order' } })

    // More ticked than one run deletes is cut back by the planner, not
    // refused: here the extra ids are in no scope at all, and change nothing.
    const extra = Array.from({ length: 320 }, () => randomUUID())
    const wide = await page.request.post(`${RESET}/preview`, {
      data: {
        scope: { kind: 'before_cutoff', cutoff },
        only: { chainIds: [...CHAINS, ...extra], checkoutIds: CHECKOUTS },
      },
    })
    expect(wide.status()).toBe(200)
    expect((await wide.json()).data).toMatchObject({
      counts: plan.counts,
      selectionHash: plan.selectionHash,
    })
  })

  test('refusals delete nothing: a stale dry run is a 409, a wrong phrase a 400', async ({ page }) => {
    const cutoff = new Date().toISOString()
    const onlyRefunded = { chainIds: [BOOKINGS.resetRefunded], checkoutIds: [] }
    const narrow = (
      await (
        await page.request.post(`${RESET}/preview`, {
          data: { scope: { kind: 'before_cutoff', cutoff }, only: onlyRefunded },
        })
      ).json()
    ).data

    // The fingerprint of one chain, sent with two ticked: what is deleted is
    // not what was previewed.
    const stale = await page.request.post(`${RESET}/execute`, {
      data: {
        scope: { kind: 'before_cutoff', cutoff },
        only: { chainIds: CHAINS, checkoutIds: CHECKOUTS },
        selectionHash: narrow.selectionHash,
        confirmText: 'DELETE 2 BOOKINGS',
        backupConfirmed: true,
      },
    })
    expect(stale.status()).toBe(409)
    expect(await stale.json()).toEqual({
      success: false,
      message: expect.stringContaining('Something changed since the dry run'),
      code: 'PREVIEW_STALE',
    })

    const wrong = await page.request.post(`${RESET}/execute`, {
      data: {
        scope: { kind: 'before_cutoff', cutoff },
        only: onlyRefunded,
        selectionHash: narrow.selectionHash,
        confirmText: 'DELETE 2 BOOKINGS',
        backupConfirmed: true,
      },
    })
    expect(wrong.status()).toBe(400)
    expect(await wrong.json()).toEqual({
      success: false,
      message: 'Type DELETE 1 BOOKING exactly as shown to confirm.',
      code: 'CONFIRM_PHRASE_MISMATCH',
    })

    // Without the backup box it does not get as far as the plan.
    const noBackup = await page.request.post(`${RESET}/execute`, {
      data: {
        scope: { kind: 'before_cutoff', cutoff },
        only: onlyRefunded,
        selectionHash: narrow.selectionHash,
        confirmText: 'DELETE 1 BOOKING',
        backupConfirmed: false,
      },
    })
    expect(noBackup.status()).toBe(400)

    expect(await bookingExists(BOOKINGS.resetRefunded)).toBe(true)
    expect(await getReceiptNumber(BOOKINGS.resetRefunded)).toMatchObject({ number: 'DTL/22-23/000001' })
  })

  test('the delete takes exactly what the dry run showed, keeps real money, and numbers receipts right', async ({
    page,
  }) => {
    const cutoff = new Date().toISOString()
    const request = {
      scope: { kind: 'before_cutoff', cutoff },
      only: { chainIds: CHAINS, checkoutIds: CHECKOUTS },
    }
    const plan = (await (await page.request.post(`${RESET}/preview`, { data: request })).json()).data

    const done = await page.request.post(`${RESET}/execute`, {
      data: {
        ...request,
        unknownIds: plan.lookups.unknownIds,
        selectionHash: plan.selectionHash,
        confirmText: '  DELETE 2   BOOKINGS ',
        backupConfirmed: true,
      },
    })
    expect(done.status()).toBe(200)
    const { success, data: result } = await done.json()
    expect(success).toBe(true)
    expect(result).toMatchObject({
      by: 'E2E Admin',
      counts: plan.counts,
      receiptPlan: plan.receiptPlan,
      photosRemoved: 1,
    })

    // Gone: the chains, every row of them, their checkouts and refunds.
    for (const id of [BOOKINGS.resetRefunded, BOOKINGS.resetMovedFrom, BOOKINGS.resetMovedTo]) {
      expect(await bookingExists(id), id).toBe(false)
    }
    for (const id of [BOOKING_INTENTS.resetOwn, ...CHECKOUTS]) {
      expect(await intentExists(id), id).toBe(false)
    }
    const refunds = await sql`
      select 1 from refund_records
       where target_id in (${BOOKINGS.resetRefunded}, ${BOOKING_INTENTS.resetFailed})
          or refund_ref in ('rfnd_E2ERESET0001', 'rfnd_E2ERESET0002')
    `
    expect(refunds).toHaveLength(0)
    const orphans = await sql`
      select 1 from job_photos where booking_id = ${BOOKINGS.resetRefunded}
      union all select 1 from booking_notes where booking_id = ${BOOKINGS.resetRefunded}
      union all select 1 from booking_reschedules where original_booking_id = ${BOOKINGS.resetMovedFrom}
    `
    expect(orphans).toHaveLength(0)

    // Kept: real money, the unconfirmed one and the open order, with their
    // numbers.
    for (const id of [
      BOOKINGS.resetLive,
      BOOKINGS.resetUnknown,
      BOOKINGS.resetNextReceipt,
      BOOKINGS.resetOpenOrder,
    ]) {
      expect(await bookingExists(id), id).toBe(true)
    }
    expect(await getReceiptNumber(BOOKINGS.resetLive)).toMatchObject({ number: 'DTL/23-24/000001' })

    // 22-23 restarted: no number, no void and no counter left in it.
    const year2223 = await sql`
      select 'number' from receipt_numbers where financial_year = '22-23'
      union all select 'void' from receipt_number_voids where financial_year = '22-23'
      union all select 'counter' from receipt_counters where financial_year = '22-23'
    `
    expect(year2223).toHaveLength(0)

    // 23-24 kept its series: 000002 is on record as void, by this run.
    const voids = await sql<{ number: string; root_booking_id: string; audit_id: string }[]>`
      select number, root_booking_id, audit_id from receipt_number_voids
       where financial_year = '23-24' order by seq
    `
    expect(voids).toEqual([
      { number: 'DTL/23-24/000002', root_booking_id: BOOKINGS.resetMovedFrom, audit_id: result.auditId },
    ])

    // The audit row, written in the same transaction, with no phone numbers.
    const [audit] = await sql<{ action: string; actor_name: string; actor_sub: string; detail: string }[]>`
      select action, actor_name, actor_sub, detail::text as detail
        from admin_audit_log where id = ${result.auditId}
    `
    // Signed by the personal E2E login (0058), not a typed name.
    expect(audit).toMatchObject({ action: 'test_data_reset', actor_name: 'E2E Admin', actor_sub: `admin:${ADMIN_LOGINS.e2e.id}` })
    expect(audit.detail).toContain(BOOKINGS.resetRefunded)
    // What was kept is on record too, with the reason.
    expect(audit.detail).toContain(BOOKINGS.resetLive)
    expect(audit.detail).toContain('open_order')
    expect(audit.detail).not.toContain(CUSTOMERS.dataReset.phone)

    // The next receipt in 23-24 carries on after the void: the kept booking
    // still owed one gets 000003 when its customer opens it.
    const customer = await loginViaApi(CUSTOMERS.dataReset.phone)
    const receipt = await customer.get(`/api/v1/bookings/${BOOKINGS.resetNextReceipt}/receipt`)
    expect(receipt.status()).toBe(200)
    expect((await receipt.json()).data.receiptNumber).toBe('DTL/23-24/000003')
    await customer.dispose()

    // Running the same dry run again finds nothing left to delete.
    const again = (await (await page.request.post(`${RESET}/preview`, { data: request })).json()).data
    expect(again.counts.bookings).toBe(0)
    expect(again.chains.filter((row: { selected: boolean }) => row.selected)).toHaveLength(0)
  })

  test('one booking: refused until marked Test, then deleted with its chain', async ({ page }) => {
    const id = BOOKINGS.resetSingle
    const scope = { kind: 'chains', bookingIds: [id] }

    const unmarked = (await (await page.request.post(`${RESET}/preview`, { data: { scope } })).json()).data
    expect(unmarked.chains[0]).toMatchObject({
      selected: false,
      kept: { code: 'not_marked', label: 'Not marked as Test — kept' },
    })
    expect(unmarked.counts.bookings).toBe(0)

    const marked = await page.request.post(`${API}/api/v1/admin/bookings/${id}/mark-test`)
    expect(marked.status()).toBe(200)
    expect((await marked.json()).data.markedTest).toMatchObject({ by: 'E2E Admin' })

    // On the list's Test filter, and noted on the booking.
    const listed = await (await page.request.get(`${API}/api/v1/admin/bookings?test=only&q=${id.slice(0, 8)}`)).json()
    expect(listed.data.map((row: { id: string }) => row.id)).toEqual([id])
    const [note] = await sql<{ body: string }[]>`
      select body from booking_notes where booking_id = ${id} order by created_at desc limit 1
    `
    expect(note.body).toBe('Marked as a test booking. It is left out of the pilot numbers.')

    const plan = (await (await page.request.post(`${RESET}/preview`, { data: { scope } })).json()).data
    expect(plan.confirmPhrase).toBe('DELETE 1 BOOKING')
    const done = await page.request.post(`${RESET}/execute`, {
      data: {
        scope,
        selectionHash: plan.selectionHash,
        confirmText: 'DELETE 1 BOOKING',
        backupConfirmed: true,
      },
    })
    expect(done.status()).toBe(200)
    expect(await bookingExists(id)).toBe(false)
  })
})
