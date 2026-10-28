/**
 * Launch day and the referral credit (customer reach, part 2, 0062), through
 * the cron (POST /ops/pending-digest).
 *
 * Ambattur has no garage customers can find: VENDORS.areaLaunch is pinned
 * there but not verified. CUSTOMERS.freeWashLaunch is first on Ambattur's
 * list. Verifying the garage lists it; the next cron run sets the area's
 * live_at once, issues the free wash, and Home shows the launch banner once
 * and the free wash ready; the free wash applies at checkout. A second run
 * changes nothing. The ₹399 wash then costs ₹0: booked with no Razorpay
 * order, paid 0.00, Detlio-funded (the garage is paid the ₹399), the
 * receipt names the free wash, and cancelling it refunds nothing and gives
 * the free wash back.
 *
 * CUSTOMERS.referral recommended VENDORS.reqSecond, which the team linked,
 * and completed a paid booking there: the cron records the ₹100 credit
 * (owed while GIFTS_ENABLED is off, granted while on), once.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql, withCronLock } from '../../support/db'
import { BookingPage } from '../../pages/booking.page'
import { CheckoutPage } from '../../pages/checkout.page'
import { CUSTOMERS, FREE_WASH_AREAS, REFERRAL_BOOKING, REFERRAL_RECOMMENDATION, SERVICES, VENDORS } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

const DIGEST = `${API}/api/v1/ops/pending-digest`
const SECRET = process.env.CRON_SECRET ?? ''

/** Messages about a sign-up go out from 9 am to 8:59 pm IST only. */
function isReachPushHour(): boolean {
  const hour = new Date(Date.now() + (5 * 60 + 30) * 60_000).getUTCHours()
  return hour >= 9 && hour < 21
}

test.describe('launch day @p0', () => {
  test.use({ storageState: asRole('customer-freeWashLaunch') })

  test('the area’s first garage is listed: live once, the free wash issued once, the banner once, the free wash at checkout', async ({ page, request }) => {
    test.skip(SECRET.length < 32, 'CRON_SECRET is not set for this run')
    const area = FREE_WASH_AREAS.launch
    const zoneRow = async () =>
      (await sql<{ live_at: Date | null }[]>`select live_at from zones where slug = ${area.slug}`)[0]!
    const signupRow = async () =>
      (
        await sql<{ discount_id: string | null; free_wash_issued_at: Date | null; launch_push_at: Date | null }[]>`
          select s.discount_id, s.free_wash_issued_at, s.launch_push_at
            from zone_signups s join zones z on z.id = s.zone_id
           where s.user_id = ${CUSTOMERS.freeWashLaunch.id} and z.slug = ${area.slug}
        `
      )[0]!
    expect((await zoneRow()).live_at).toBeNull()
    expect((await signupRow()).discount_id).toBeNull()

    // The garage becomes one customers can find (any path: here, verified).
    await sql`update vendors set is_verified = true where id = ${VENDORS.areaLaunch.id}`
    const run = await withCronLock(() => request.post(DIGEST, { headers: { authorization: `Bearer ${SECRET}` } }))
    expect(run.status()).toBe(200)

    const liveAt = (await zoneRow()).live_at
    expect(liveAt).not.toBeNull()
    const issued = await signupRow()
    expect(issued.discount_id).not.toBeNull()
    expect(issued.free_wash_issued_at).not.toBeNull()
    if (isReachPushHour()) expect(issued.launch_push_at).not.toBeNull()
    const [discount] = await sql<{ source: string; amount_off: string; funded_by: string; service_category: string; ends_at: Date; per_user_limit: number }[]>`
      select source, amount_off, funded_by, service_category, ends_at, per_user_limit from discounts where id = ${issued.discount_id}
    `
    expect(discount).toMatchObject({ source: 'free_wash', amount_off: '499.00', funded_by: 'platform', service_category: 'car_wash', per_user_limit: 1 })
    expect(Math.round((discount.ends_at.getTime() - liveAt!.getTime()) / (24 * 60 * 60 * 1000))).toBe(30)

    // Idempotent: a second run sets nothing again and issues nothing more.
    await withCronLock(() => request.post(DIGEST, { headers: { authorization: `Bearer ${SECRET}` } }))
    expect((await zoneRow()).live_at!.getTime()).toBe(liveAt!.getTime())
    expect((await signupRow()).discount_id).toBe(issued.discount_id)
    const [free] = await sql<{ n: number }[]>`
      select count(*)::int as n from discounts where source = 'free_wash' and description like ${`%${area.name}%`}
    `
    expect(free.n).toBe(1)

    // ── Home: the launch banner once, and the free wash ready
    await page.goto('/home')
    const banner = page.getByRole('region', { name: `Detlio is now in ${area.name}` })
    await expect(banner).toBeVisible()
    await expect(page.getByRole('link', { name: /Your free wash is ready/ })).toBeVisible()
    await banner.getByRole('button', { name: 'Close the launch banner' }).click()
    await expect(banner).toBeHidden()
    await page.reload()
    await expect(page.getByRole('region', { name: `Detlio is now in ${area.name}` })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Your free wash is ready/ })).toBeVisible()

    // ── checkout at the new garage: the free wash is one tap, and comes off the wash
    await page.goto(`/book/${VENDORS.areaLaunch.id}?service=${SERVICES.areaLaunchWash.id}`)
    const chip = page.getByRole('button', { name: 'Free wash · up to ₹499' })
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page.getByText('Free wash applied')).toBeVisible()
    // A ₹399 wash: free means free, all of it comes off and nothing is left to pay.
    await expect(page.getByText('Saves ₹399', { exact: false })).toBeVisible()

    // ── booked with no payment: no Razorpay order, ₹0, and the garage still paid in full by Detlio
    await new CheckoutPage(page).pickTomorrowSlot()
    await expect(page.getByText('Your free wash covers it: nothing to pay.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Book your free wash' }).click()
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/)
    const bookingId = /\/bookings\/([0-9a-f-]{36})/.exec(page.url())![1]!
    const [booked] = await sql<{
      status: string
      amount: string
      subtotal_amount: string
      discount_amount: string
      discount_id: string | null
      discount_funded_by: string | null
      pay_status: string
      pay_amount: string
      credit_amount: string
      gateway_txn_id: string | null
      order_id: string | null
    }[]>`
      select b.status, b.amount, b.subtotal_amount, b.discount_amount, b.discount_id, b.discount_funded_by,
             p.status as pay_status, p.amount as pay_amount, p.credit_amount, p.gateway_txn_id,
             i.gateway_txn_id as order_id
        from bookings b
        join payments p on p.booking_id = b.id
        join booking_intents i on i.booking_id = b.id
       where b.id = ${bookingId}
    `
    expect(booked).toMatchObject({
      // The garage still accepts it, as any booking.
      status: 'pending',
      amount: '0.00',
      subtotal_amount: '399.00',
      discount_amount: '399.00',
      discount_id: issued.discount_id,
      // Detlio-funded: the garage is paid the full ₹399.
      discount_funded_by: 'platform',
      pay_status: 'paid',
      pay_amount: '0.00',
      credit_amount: '0.00',
      gateway_txn_id: null,
      // No Razorpay order was ever opened.
      order_id: null,
    })
    await expect(page.getByText('Nothing to pay')).toBeVisible()
    // Used: Home no longer offers it.
    await page.goto('/home')
    await expect(page.getByRole('link', { name: /Your free wash is ready/ })).toHaveCount(0)

    // ── the receipt names the free wash and ₹0
    await page.goto(`/bookings/${bookingId}/receipt`)
    await expect(page.getByText(/^Free wash \(FW-/)).toBeVisible()
    await expect(page.getByText('Free wash: nothing to pay')).toBeVisible()

    // ── cancelled before the garage accepts: nothing to refund, and the free wash is back
    const booking = new BookingPage(page)
    await booking.goto(bookingId)
    await booking.openCancel()
    await expect(page.getByText('Nothing was charged, so there is nothing to refund.', { exact: false })).toBeVisible()
    await booking.confirmCancel()
    await expect(page.getByText(/Cancelled by you/i)).toBeVisible()
    const refunds = await sql<{ n: number }[]>`select count(*)::int as n from refund_records where booking_id = ${bookingId}`
    expect(refunds[0]!.n).toBe(0)
    await page.goto('/home')
    await expect(page.getByRole('link', { name: /Your free wash is ready/ })).toBeVisible()
  })
})

test.describe('the referral credit @p0', () => {
  test('a linked garage, live, and a paid booking there: ₹100 of credit, once', async ({ request }) => {
    test.skip(SECRET.length < 32, 'CRON_SECRET is not set for this run')
    const rec = async () =>
      (
        await sql<{ credit_status: string | null; credit_amount: string | null; credit_booking_id: string | null }[]>`
          select credit_status, credit_amount, credit_booking_id from garage_recommendations where id = ${REFERRAL_RECOMMENDATION}
        `
      )[0]!
    // Another spec's cron run may have got here first: either way, one credit.
    await withCronLock(() => request.post(DIGEST, { headers: { authorization: `Bearer ${SECRET}` } }))
    const after = await rec()
    expect(['owed', 'granted']).toContain(after.credit_status)
    expect(after.credit_amount).toBe('100.00')
    expect(after.credit_booking_id).toBe(REFERRAL_BOOKING)

    await withCronLock(() => request.post(DIGEST, { headers: { authorization: `Bearer ${SECRET}` } }))
    expect(await rec()).toEqual(after)
    const ledger = await sql<{ n: number }[]>`
      select count(*)::int as n from gift_credit_entries where user_id = ${CUSTOMERS.referral.id} and kind = 'referral_reward'
    `
    expect(ledger[0]!.n).toBe(after.credit_status === 'granted' ? 1 : 0)
  })
})
