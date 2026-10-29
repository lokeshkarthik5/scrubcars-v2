/**
 * Garage payouts: admin records a payout for what a garage is owed, the
 * bookings it covers are paid exactly once, and the garage's Earnings shows
 * them as Paid with the payout's reference.
 *
 * Every booking here is CUSTOMERS.payouts' at VENDORS.payouts, which nobody
 * else books: a finished ₹500 wash and a customer no-show (paid as if the
 * job happened), both inside the garage's first 25 (no commission), and one
 * still to come. The money rules are unit-tested in
 * apps/server/src/lib/payouts.test.ts; this checks them end to end.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { answerCookieQuestion } from '../../support/consent'
import { API, setActiveVendor, statePath } from '../../support/auth'
import { sql } from '../../support/db'
import { VENDORS_ORIGIN } from '../../support/journey'
import { BOOKINGS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const GARAGE = VENDORS.payouts
const GARAGE_PAYOUTS = `${API}/api/v1/admin/payouts/vendors/${GARAGE.id}`
const STATEMENT = `${API}/api/v1/vendors/me/earnings/statement`
const UTR = 'E2EUTR2026101700'

/** "#A7A00001": the reference as both apps show it. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

test.describe.serial('garage payouts @p0', () => {
  test.beforeAll(async () => {
    // As seeded, whatever an earlier attempt left: nothing paid out yet.
    await sql`delete from vendor_payouts where vendor_id = ${GARAGE.id}`
  })

  test('the garage is owed its two finished bookings, free of commission, and nothing yet for the one to come', async ({
    page,
  }) => {
    const response = await page.request.get(GARAGE_PAYOUTS)
    expect(response.status()).toBe(200)
    const { data } = await response.json()
    expect(data.payable).toEqual({ amount: 1000, bookings: 2, refusal: null })
    expect(data.summary.balanceDue).toBe(1000)
    expect(data.due.map((line: { bookingId: string }) => line.bookingId).sort()).toEqual(
      [BOOKINGS.payoutDone, BOOKINGS.payoutNoShow].sort()
    )
    for (const line of data.due) {
      expect(line.commission.freePosition).not.toBeNull()
      expect(line.commission.amount).toBe(0)
      expect(line.share).toBe(500)
      expect(line.status).toBe('due')
    }
    expect(data.due.find((line: { kind: string }) => line.kind === 'customer_no_show')).toBeTruthy()
    expect(data.account.upiId).toBe('payoutsgarage@okaxis')

    // The list masks how the garage is paid.
    const list = await page.request.get(`${API}/api/v1/admin/payouts`)
    expect(list.status()).toBe(200)
    const row = (await list.json()).data.garages.find(
      (g: { garage: { id: string } }) => g.garage.id === GARAGE.id
    )
    expect(row.account).toEqual({ method: 'upi', masked: 'pa•••@okaxis' })
  })

  test('admin records the payout from the garage’s page', async ({ page }) => {
    await page.goto(`/payouts/${GARAGE.id}`)
    await expect(page.getByRole('heading', { name: GARAGE.name })).toBeVisible()
    await page.getByRole('button', { name: 'Record payout of ₹1,000' }).click()

    const dialog = page.getByRole('dialog', { name: `Record payout: ${GARAGE.name}` })
    await expect(dialog).toBeVisible()
    // The UPI id on file picks the method.
    await expect(dialog.getByLabel('Paid by')).toHaveValue('upi')
    await dialog.getByLabel('UPI transaction id').fill(UTR)
    // No name to type: the dialog says who signs it (0058).
    await expect(dialog.getByText('Signed as E2E Admin')).toBeVisible()
    await dialog.getByRole('button', { name: 'Record ₹1,000' }).click()

    await expect(page.getByText('Payout of ₹1,000 recorded')).toBeVisible()
    await expect(page.getByText('Nothing is due to this garage now.')).toBeVisible()
    await expect(page.getByText(UTR).first()).toBeVisible()

    const [payout] = await sql<{ amount: string; reference: string; recorded_by: string; method: string }[]>`
      select amount::text, reference, recorded_by, method from vendor_payouts where vendor_id = ${GARAGE.id}
    `
    expect(payout).toEqual({ amount: '1000.00', reference: UTR, recorded_by: 'E2E Admin', method: 'upi' })
    const items = await sql<{ booking_id: string; amount: string }[]>`
      select i.booking_id, i.amount::text from vendor_payout_items i
        join vendor_payouts p on p.id = i.payout_id
       where p.vendor_id = ${GARAGE.id}
       order by i.booking_id
    `
    expect(items).toEqual(
      [BOOKINGS.payoutDone, BOOKINGS.payoutNoShow].sort().map((id) => ({ booking_id: id, amount: '500.00' }))
    )
  })

  test('the same bookings are never paid twice', async ({ page }) => {
    const again = await page.request.post(GARAGE_PAYOUTS, {
      data: {
        amount: 1000,
        upTo: new Date().toISOString(),
        method: 'upi',
        reference: 'E2EUTRAGAIN0001',
        paidAt: new Date().toISOString(),
      },
    })
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('PAYOUT_NOTHING_DUE')
  })

  test('the garage’s Earnings shows both as Paid, with the reference', async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: statePath('vendor-payouts'),
      baseURL: VENDORS_ORIGIN,
      viewport: { width: 412, height: 915 },
      isMobile: true,
    })
    await answerCookieQuestion(ctx)
    await setActiveVendor(ctx, GARAGE.id)
    const page = await ctx.newPage()

    await page.goto('/earnings')
    for (const id of [BOOKINGS.payoutDone, BOOKINGS.payoutNoShow]) {
      const card = page.getByRole('group', { name: `Booking #${reference(id)}` })
      await expect(card.getByText('Paid', { exact: true })).toBeVisible()
      await expect(card.getByText(UTR)).toBeVisible()
    }
    await expect(page.getByText('Free — booking 1 of your first 25')).toBeVisible()
    await expect(page.getByText('Paid this month')).toBeVisible()

    // Its own garage only: the statement answers for the tenant, never another.
    const own = await ctx.request.get(STATEMENT, { headers: { 'X-Vendor-Id': GARAGE.id } })
    expect(own.status()).toBe(200)
    const { data } = await own.json()
    expect(data.summary.balanceDue).toBe(0)
    expect(data.lines.every((line: { status: string }) => line.status === 'paid')).toBe(true)
    const other = await ctx.request.get(STATEMENT, { headers: { 'X-Vendor-Id': VENDORS.main.id } })
    expect(other.status()).toBe(404)
    await ctx.close()
  })

  test('an operator never sees the money', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: statePath('vendor-operator') })
    await answerCookieQuestion(ctx)
    const response = await ctx.request.get(STATEMENT, { headers: { 'X-Vendor-Id': VENDORS.main.id } })
    expect(response.status()).toBe(403)
    await ctx.close()
  })
})
