/**
 * The owner deletes anything (owner, 10 Nov 2026): hard deletes beside the
 * soft actions the rest of the team has. As the owner ('admin', E2E Admin):
 * a review from the garage's Reviews tab (the rating moves), a complaint from
 * its page (its number typed), a promo code already used (Delete anyway; the
 * booking keeps its figures), one printed coupon code beside Void (typed in
 * full), and a customer's account from the new Customers page (a booking
 * still on is cancelled first; a garage owner is refused). Then, at the API,
 * the rest: a notice, a job photo, a "book directly" report, a gift nobody
 * redeemed, a reward challenge, a zone's sign-up and the zone itself though
 * in use, a team login (never your own, never the owner's), a printed coupon
 * batch with a redeemed code (its codes, redemptions and bonus stamps go
 * through the real foreign keys), and redo claims (only once the redo
 * booking is gone). Each delete is audited; a second is a 404.
 *
 * Deleting a customer's account leaves their paid booking a refund owed that
 * nothing sends by itself (owner, 10 Nov 2026: "Not automatically"); and a
 * test garage with a payout is erased completely by the owner's Delete
 * forever, its payout with it, each line kept in the money record.
 *
 * Only OWNER_DELETE's rows are deleted. The teammate's side (no buttons, 403)
 * is owner-delete-bookings.spec.ts's.
 */
import { request as playwrightRequest } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { forgetOtps, sql } from '../../support/db'
import { ADMIN_LOGINS, OWNER_DELETE } from '../../support/seed-ids'
import {
  couponKeys,
  deriveCouponCode,
  formatCouponCode,
} from '../../../server/src/lib/coupons'

const O = OWNER_DELETE
const OWNER_DELETE_API = `${API}/api/v1/admin/owner-delete`

/** Code number `seq` of the seeded batch, as printed, under the secret the API reads. */
const printedCode = (seq: number) =>
  formatCouponCode(
    deriveCouponCode(
      couponKeys(
        process.env.COUPON_SECRET?.trim() ||
          process.env.JWT_SECRET ||
          'dev-jwt-secret-change-me'
      ).codeKey,
      O.coupons.batchId,
      seq
    )
  )

const exists = async (table: string, id: string) =>
  (await sql.unsafe(`select 1 from ${table} where id = $1`, [id])).length > 0

const audited = async (action: string, key: string, id: string) =>
  (
    await sql<{ actor_name: string }[]>`
      select actor_name from admin_audit_log where action = ${action} and summary->>${key} = ${id}
    `
  )[0]?.actor_name ?? null

test.use({ storageState: asRole('admin') })

test.describe('the owner deletes anything, from the panel @p0', () => {
  test('a review, beside Hide: gone, and the garage page reads its rating without it', async ({
    page,
  }) => {
    await page.goto(`/vendors/${O.garage.id}/edit?tab=reviews`)
    await expect(
      page.getByText('Seeded: the owner deletes this review.')
    ).toBeVisible()
    await page
      .getByRole('button', { name: /^Delete the 2-star review by / })
      .click()
    const sheet = page.getByRole('dialog', { name: 'Delete this review?' })
    await expect(sheet.getByText("This can't be undone.")).toBeVisible()
    await sheet.getByRole('button', { name: 'Delete review' }).click()
    await expect(sheet).toBeHidden()
    await expect(
      page.getByText('Seeded: the owner deletes this review.')
    ).toHaveCount(0)
    await expect(
      page.getByText('Seeded: nobody deletes this review.')
    ).toBeVisible()

    expect(await exists('reviews', O.review)).toBe(false)
    expect(await audited('review_deleted', 'reviewId', O.review)).toBe(
      'E2E Admin'
    )
    // The public list no longer has it.
    const list = await page.request.get(
      `${API}/api/v1/reviews/vendors/${O.garage.id}`
    )
    expect(JSON.stringify((await list.json()).data)).not.toContain(O.review)
  })

  test('a complaint, with its number typed', async ({ page }) => {
    const [{ number }] = await sql<
      { number: number }[]
    >`select number from complaints where id = ${O.complaint}`
    const label = `C-${String(number).padStart(6, '0')}`
    await page.goto(`/complaints/${O.complaint}`)
    await page.getByRole('button', { name: 'Delete complaint…' }).click()
    const sheet = page.getByRole('dialog', {
      name: `Delete complaint ${label}?`,
    })
    const confirm = sheet.getByRole('button', { name: 'Delete complaint' })
    await expect(confirm).toBeDisabled()
    await sheet.getByLabel(`Type ${label} to confirm`).fill(label.toLowerCase())
    await confirm.click()
    await expect(page).toHaveURL(/\/complaints$/)

    expect(await exists('complaints', O.complaint)).toBe(false)
    expect(await audited('complaint_deleted', 'complaintId', O.complaint)).toBe(
      'E2E Admin'
    )
    // Its number is not reused: the sequence carries on.
    const [{ next }] = await sql<
      { next: string }[]
    >`select last_value::text as next from complaint_number_seq`
    expect(Number(next)).toBeGreaterThanOrEqual(number)
  })

  test('a promo code already used: Delete anyway, and the booking keeps what it was charged', async ({
    page,
  }) => {
    await page.goto('/discounts')
    await page
      .getByRole('button', { name: `Delete ${O.discount.code} anyway` })
      .click()
    const sheet = page.getByRole('dialog', {
      name: `Delete ${O.discount.code} although it was used?`,
    })
    await expect(sheet.getByText(/It was used on\s*1\s*booking/)).toBeVisible()
    await sheet
      .getByLabel(`Type ${O.discount.code} to confirm`)
      .fill(O.discount.code)
    await sheet.getByRole('button', { name: 'Delete code' }).click()
    await expect(sheet).toBeHidden()

    expect(await exists('discounts', O.discount.id)).toBe(false)
    const [booking] = await sql<
      {
        amount: string
        discount_amount: string
        discount_code: string
        discount_id: string | null
      }[]
    >`
      select amount, discount_amount, discount_code, discount_id from bookings where id = ${O.bookings.discounted}
    `
    expect(booking).toEqual({
      amount: '400.00',
      discount_amount: '50.00',
      discount_code: O.discount.code,
      discount_id: null,
    })
    expect(
      (
        await sql`select 1 from discount_redemptions where booking_id = ${O.bookings.discounted}`
      ).length
    ).toBe(0)
    expect(
      await audited('discount_deleted_in_use', 'discountId', O.discount.id)
    ).toBe('E2E Admin')
  })

  test('one printed coupon code, beside Void: typed in full, and only that code goes', async ({
    page,
  }) => {
    const C = O.coupons
    await page.goto(`/discounts/coupons/${C.batchId}`)
    await expect(page.getByRole('heading', { name: C.name })).toBeVisible()
    await page.getByRole('button', { name: 'Delete a code…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete a code' })
    const confirm = dialog.getByRole('button', { name: 'Delete code' })
    await expect(confirm).toBeDisabled()
    // A real code from no batch of these (seq 7 was never made): said, and
    // nothing goes.
    await dialog.getByLabel('The code').fill(printedCode(7))
    await confirm.click()
    await expect(dialog.getByRole('alert')).toHaveText(
      "That code isn't in this batch."
    )
    await dialog.getByLabel('The code').fill(printedCode(1))
    await confirm.click()
    await expect(dialog).toBeHidden()

    expect(await exists('coupon_codes', C.freeCode)).toBe(false)
    expect(await audited('coupon_code_deleted', 'codeId', C.freeCode)).toBe(
      'E2E Admin'
    )
    // The batch and its redeemed code are untouched.
    expect(await exists('coupon_batches', C.batchId)).toBe(true)
    expect(await exists('coupon_codes', C.redeemedCode)).toBe(true)
  })

  test('a customer account from the Customers page: what is open is said first, and the booking still on is cancelled', async ({
    page,
  }) => {
    await page.goto('/customers')
    await page
      .getByLabel('Phone number or name')
      .fill(O.leaving.phone.slice(-6))
    await page
      .getByRole('link', { name: `Open ${O.leaving.name}, ${O.leaving.phone}` })
      .click()
    await expect(
      page.getByRole('heading', { name: O.leaving.name })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Delete customer account…' }).click()
    const sheet = page.getByRole('dialog', {
      name: `Delete ${O.leaving.name}'s account?`,
    })
    const ref = O.bookings.leavingOpen.slice(0, 8).toUpperCase()
    await expect(
      sheet.getByText(
        `Booking #${ref} is still on. It is cancelled first without telling the customer or the garage; a paid one becomes a refund owed on the Refunds page, to send by hand.`
      )
    ).toBeVisible()
    const confirm = sheet.getByRole('button', { name: 'Delete account' })
    await expect(confirm).toBeDisabled()
    await sheet
      .getByLabel(`Type ${O.leaving.phone} to confirm`)
      .fill(O.leaving.phone)
    await confirm.click()
    // Done means the sheet closed and the page went back to the list (the
    // customer's own page is /customers/<id>, which a bare /customers/ matches
    // before the delete has even answered).
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/\/customers(\?[^/]*)?$/)

    const [user] = await sql<
      { name: string; deleted: boolean; phone: string }[]
    >`
      select name, deleted_at is not null as deleted, phone from users where id = ${O.leaving.id}
    `
    expect(user).toMatchObject({ name: 'Deleted account', deleted: true })
    expect(user!.phone).toMatch(/^deleted-/)
    const [booking] = await sql<
      { status: string; cancelled_by: string; on_behalf: string }[]
    >`
      select status, cancelled_by, cancelled_on_behalf_of as on_behalf from bookings where id = ${O.bookings.leavingOpen}
    `
    expect(booking).toEqual({
      status: 'cancelled',
      cancelled_by: 'admin',
      on_behalf: 'detlio',
    })
    // Not refunded automatically (owner, 10 Nov 2026): the payment is still
    // paid, nothing was sent or tried at Razorpay (a try is a refund record
    // too), and it waits on the Refunds page for a person.
    const [payment] = await sql<
      { status: string; refunded_amount: string | null }[]
    >`
      select status, refunded_amount from payments where booking_id = ${O.bookings.leavingOpen}
    `
    expect(payment.status).toBe('paid')
    expect(Number(payment.refunded_amount ?? 0)).toBe(0)
    expect(
      (
        await sql`select 1 from refund_records where booking_id = ${O.bookings.leavingOpen}`
      ).length
    ).toBe(0)
    const owed = await page.request.get(
      `${API}/api/v1/admin/refunds?status=owed`
    )
    expect(owed.status()).toBe(200)
    const list = (await owed.json()).data as Array<{
      kind: string
      id: string
      amountOwed: string
    }>
    expect(
      list.find((r) => r.kind === 'booking' && r.id === O.bookings.leavingOpen)
    ).toMatchObject({ amountOwed: '450.00' })
    expect(
      await audited('customer_account_deleted', 'userId', O.leaving.id)
    ).toBe('E2E Admin')
    // Gone from the search, and its page is a 404.
    expect(
      (
        await page.request.get(`${API}/api/v1/admin/customers/${O.leaving.id}`)
      ).status()
    ).toBe(404)
  })

  test('a garage owner is refused, with no button', async ({ page }) => {
    const preview = await page.request.get(
      `${API}/api/v1/admin/customers/${O.owner.id}/deletion`
    )
    expect((await preview.json()).data).toMatchObject({
      canDelete: false,
      block: {
        code: 'VENDOR_OWNER_ACCOUNT',
        message:
          'This person owns a garage. Remove them from the garage first.',
      },
    })
    await page.goto(`/customers/${O.owner.id}`)
    await expect(
      page.getByText(
        'This person owns a garage. Remove them from the garage first.'
      )
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Delete customer account…' })
    ).toHaveCount(0)
    const refused = await page.request.delete(
      `${API}/api/v1/admin/customers/${O.owner.id}`,
      {
        data: { confirmText: O.owner.phone },
      }
    )
    expect(refused.status()).toBe(409)
    expect((await refused.json()).code).toBe('VENDOR_OWNER_ACCOUNT')
  })
})

test.describe('the owner deletes anything, at the API @p0', () => {
  test('a notice, a job photo and a "book directly" report: each audited, and a second delete is a 404', async ({
    page,
  }) => {
    for (const [path, table, id, action, key] of [
      ['notices', 'notices', O.notice, 'notice_deleted', 'noticeId'],
      ['job-photos', 'job_photos', O.jobPhoto, 'job_photo_deleted', 'photoId'],
      [
        'bypass-reports',
        'bypass_reports',
        O.bypassReport,
        'bypass_report_deleted',
        'reportId',
      ],
    ] as const) {
      const done = await page.request.delete(
        `${OWNER_DELETE_API}/${path}/${id}`,
        { data: {} }
      )
      expect(done.status()).toBe(200)
      expect(await done.json()).toMatchObject({
        success: true,
        data: { id, deleted: true },
      })
      expect(await exists(table, id)).toBe(false)
      expect(await audited(action, key, id)).toBe('E2E Admin')
      const again = await page.request.delete(
        `${OWNER_DELETE_API}/${path}/${id}`,
        { data: {} }
      )
      expect(again.status()).toBe(404)
      expect((await again.json()).success).toBe(false)
    }
  })

  test('a gift nobody redeemed and a reward challenge, each with its name typed', async ({
    page,
  }) => {
    const [{ number }] = await sql<
      { number: number }[]
    >`select number from gifts where id = ${O.gift}`
    const giftNumber = `G-${String(number).padStart(6, '0')}`
    const wrong = await page.request.delete(
      `${OWNER_DELETE_API}/gifts/${O.gift}`,
      { data: { confirmText: 'G-1' } }
    )
    expect(wrong.status()).toBe(400)
    expect((await wrong.json()).code).toBe('CONFIRM_TEXT_MISMATCH')
    expect(
      (
        await page.request.delete(`${OWNER_DELETE_API}/gifts/${O.gift}`, {
          data: { confirmText: giftNumber },
        })
      ).status()
    ).toBe(200)
    expect(await exists('gifts', O.gift)).toBe(false)

    const challenge = await page.request.delete(
      `${OWNER_DELETE_API}/reward-challenges/${O.challenge.id}`,
      {
        data: { confirmText: O.challenge.title },
      }
    )
    expect(challenge.status()).toBe(200)
    expect(await exists('reward_challenges', O.challenge.id)).toBe(false)
  })

  test('a zone: one sign-up removed, then the zone itself though in use', async ({
    page,
  }) => {
    const list = await page.request.get(
      `${OWNER_DELETE_API}/zones/${O.zone.id}/signups`
    )
    const signups = (await list.json()).data.signups as Array<{
      userId: string
      phone: string | null
    }>
    const mine = signups.find((row) => row.userId === O.customer.id)
    // The last four digits only.
    expect(mine?.phone).toBe(`••••${O.customer.phone.slice(-4)}`)
    const removed = await page.request.delete(
      `${OWNER_DELETE_API}/zones/${O.zone.id}/signups/${O.customer.id}`,
      {
        data: {},
      }
    )
    expect(removed.status()).toBe(200)
    expect(
      (
        await sql`select 1 from zone_signups where zone_id = ${O.zone.id} and user_id = ${O.customer.id}`
      ).length
    ).toBe(0)

    const use = await page.request.get(
      `${API}/api/v1/admin/coverage/zones/${O.zone.id}/use`
    )
    expect((await use.json()).data.zone).toEqual({
      id: O.zone.id,
      name: O.zone.name,
    })
    const gone = await page.request.delete(
      `${API}/api/v1/admin/coverage/zones/${O.zone.id}/anyway`,
      {
        data: { confirmText: O.zone.name },
      }
    )
    expect(gone.status()).toBe(200)
    expect(await exists('zones', O.zone.id)).toBe(false)
    expect(
      (await sql`select 1 from zone_signups where zone_id = ${O.zone.id}`)
        .length
    ).toBe(0)
    expect(await audited('zone_deleted_in_use', 'zoneId', O.zone.id)).toBe(
      'E2E Admin'
    )
  })

  test("a team login: never the owner's, and someone else's goes with its username typed", async ({
    page,
  }) => {
    const owners = await page.request.delete(
      `${OWNER_DELETE_API}/admin-logins/${ADMIN_LOGINS.e2e.id}`,
      {
        data: { confirmText: ADMIN_LOGINS.e2e.username },
      }
    )
    expect(owners.status()).toBe(409)
    expect((await owners.json()).code).toBe('ADMIN_LOGIN_SELF')

    const done = await page.request.delete(
      `${OWNER_DELETE_API}/admin-logins/${O.doomedLogin.id}`,
      {
        data: { confirmText: O.doomedLogin.username },
      }
    )
    expect(done.status()).toBe(200)
    expect(await exists('admin_logins', O.doomedLogin.id)).toBe(false)
    expect(
      await audited('admin_login_deleted', 'loginId', O.doomedLogin.id)
    ).toBe('E2E Admin')
  })
  test('a printed coupon batch with a redeemed code: its codes, the redemption and the bonus stamps go with it', async ({
    page,
  }) => {
    const C = O.coupons
    const wrong = await page.request.delete(
      `${OWNER_DELETE_API}/coupon-batches/${C.batchId}`,
      { data: { confirmText: 'E2E owner delete' } }
    )
    expect(wrong.status()).toBe(400)
    expect((await wrong.json()).code).toBe('CONFIRM_TEXT_MISMATCH')

    const done = await page.request.delete(
      `${OWNER_DELETE_API}/coupon-batches/${C.batchId}`,
      { data: { confirmText: C.name } }
    )
    expect(done.status()).toBe(200)
    expect(await done.json()).toMatchObject({
      success: true,
      data: { id: C.batchId, deleted: true },
    })
    expect(await exists('coupon_batches', C.batchId)).toBe(false)
    expect(
      (await sql`select 1 from coupon_codes where batch_id = ${C.batchId}`)
        .length
    ).toBe(0)
    expect(await exists('coupon_redemptions', C.redemption)).toBe(false)
    expect(await exists('reward_stamps', C.stamp)).toBe(false)
    expect(await audited('coupon_batch_deleted', 'batchId', C.batchId)).toBe(
      'E2E Admin'
    )
    const again = await page.request.delete(
      `${OWNER_DELETE_API}/coupon-batches/${C.batchId}`,
      { data: { confirmText: C.name } }
    )
    expect(again.status()).toBe(404)
  })

  test('redo claims: refused while the redo booking is there, deleted once it is gone', async ({
    page,
  }) => {
    const kept = await page.request.delete(
      `${OWNER_DELETE_API}/guarantee-claims/${O.claimWithRedo}`,
      {
        data: {
          confirmText: O.bookings.claimedRedo.slice(0, 8).toUpperCase(),
        },
      }
    )
    expect(kept.status()).toBe(409)
    expect(await kept.json()).toMatchObject({
      success: false,
      code: 'GUARANTEE_REDO_EXISTS',
    })
    expect(await exists('guarantee_claims', O.claimWithRedo)).toBe(true)

    const done = await page.request.delete(
      `${OWNER_DELETE_API}/guarantee-claims/${O.claim}`,
      { data: { confirmText: O.bookings.claimed.slice(0, 8).toLowerCase() } }
    )
    expect(done.status()).toBe(200)
    expect(await done.json()).toMatchObject({
      success: true,
      data: { id: O.claim, deleted: true },
    })
    expect(await exists('guarantee_claims', O.claim)).toBe(false)
    // The claimed booking stays: only the claim goes.
    expect(await exists('bookings', O.bookings.claimed)).toBe(true)
    expect(await audited('guarantee_claim_deleted', 'claimId', O.claim)).toBe(
      'E2E Admin'
    )
  })
})

test.describe('a test garage with a payout, deleted forever by the owner @p0', () => {
  const G = O.paidGarage

  test('erased completely: the payout goes too, each line in the money record, and its owner has no garage left', async ({
    page,
  }) => {
    await page.goto('/vendors?show=bin')
    const card = page.getByRole('row', { name: G.name, exact: true })
    await card.getByRole('button', { name: `Delete ${G.name} forever` }).click()
    const sheet = page.getByRole('dialog', {
      name: `Delete ${G.name} forever`,
    })
    // The live job's line says where its payout goes; the payout's own line
    // says it goes too, and no hidden record is kept for it.
    await expect(
      sheet.getByText(
        `(${G.payout.reference}), ₹420. The payout is deleted with the garage; the money record keeps it.`
      )
    ).toBeVisible()
    await expect(
      sheet.getByText(
        'Its payout goes too; each line on it is kept in the money record (Refunds → Deleted team tests).'
      )
    ).toBeVisible()
    await expect(
      sheet.getByText(
        'Its payouts stay on record, so the garage is kept as a hidden record for them.'
      )
    ).toHaveCount(0)
    await sheet.getByLabel('Type the garage name to confirm').fill(G.name)
    await sheet.getByRole('button', { name: 'Delete forever' }).click()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: `${G.name} was deleted forever.` })
    ).toBeVisible()

    // Gone outright: the garage, its bookings, its payout and its lines.
    const count = async (query: Promise<{ n: string }[]>) =>
      Number((await query)[0].n)
    expect(
      await count(
        sql`select count(*)::text as n from vendors where id = ${G.id}`
      )
    ).toBe(0)
    expect(
      await count(sql`
        select count(*)::text as n from bookings
         where id in (${O.bookings.paidLive}, ${O.bookings.paidFake})
      `)
    ).toBe(0)
    expect(
      await count(
        sql`select count(*)::text as n from vendor_payouts where id = ${G.payout.id}`
      )
    ).toBe(0)
    expect(
      await count(
        sql`select count(*)::text as n from vendor_payout_items where payout_id = ${G.payout.id}`
      )
    ).toBe(0)
    const [audit] = await sql<{ actor_name: string; outcome: string }[]>`
      select actor_name, summary->>'outcome' as outcome from admin_audit_log
       where action = 'garage_deleted' and summary->>'vendorId' = ${G.id}
    `
    expect(audit).toEqual({ actor_name: 'E2E Admin', outcome: 'hard_delete' })

    // The money trail: each line of the payout (adding up to what it paid),
    // with its date and reference, and the live payment, not refunded.
    const lines = await sql<
      { amount: string; state: string; note: string; reason: string }[]
    >`
      select amount::text, state, note, reason from deleted_test_payments
       where kind = 'payout' and vendor_payout_id = ${G.payout.id}
       order by amount desc
    `
    expect(lines.map((row) => [row.amount, row.state])).toEqual([
      [G.payout.lines[0], 'paid_out'],
      [G.payout.lines[1], 'paid_out'],
    ])
    for (const row of lines) {
      expect(row.note).toContain(`Paid out to ${G.name} on `)
      expect(
        row.note.endsWith(
          `(${G.payout.reference}); payout of ₹800 deleted with the garage`
        )
      ).toBe(true)
      expect(row.reason).toBe(
        `Deleted forever with the garage ${G.name}: Test garage with a payout`
      )
    }
    const [payment] = await sql<{ state: string; amount: string }[]>`
      select state, amount::text from deleted_test_payments
       where kind = 'booking' and root_booking_id = ${O.bookings.paidLive}
    `
    expect(payment).toEqual({ state: 'not_refunded', amount: '450.00' })

    // Its owner had no other garage: no seat, and no garage-app login.
    expect(
      await count(
        sql`select count(*)::text as n from user_member_mapping where vendor_id = ${G.id}`
      )
    ).toBe(0)
    await forgetOtps(G.owner.phone)
    const ctx = await playwrightRequest.newContext({
      storageState: { cookies: [], origins: [] },
    })
    const send = await ctx.post(`${API}/api/v1/auth/otp/send`, {
      data: { phone: G.owner.phone, purpose: 'login', audience: 'vendor' },
    })
    expect({ status: send.status(), json: await send.json() }).toMatchObject({
      status: 403,
      json: { success: false, code: 'NOT_A_VENDOR' },
    })
    await ctx.dispose()
  })
})
