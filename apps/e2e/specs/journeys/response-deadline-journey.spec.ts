/**
 * The garage response deadline (0042), across the API, the cron and the
 * customer app, at VENDORS.response (fixtures in the reserved 2200–2299
 * range). AUTO_CANCEL_UNANSWERED is on in E2E (.env.e2e).
 *
 * BOOKINGS.notAccepted is paid and pending; the spec puts its garage's
 * deadline to accept 15 minutes in the past, inside the cron lock. The garage's Accept is refused with a 409 before the
 * cron has run; the pending-digest run cancels it as the garage's, "Not
 * accepted in time", with the payment owed back in full; Accept is still
 * refused after; and the customer's booking page says the garage didn't
 * accept in time, that the full refund is on its way, and offers the
 * garage's neighbour as another garage to book.
 */
import { test, expect } from '../../support/fixtures'
import { answerCookieQuestion } from '../../support/consent'
import { API, loginViaApi, statePath } from '../../support/auth'
import { getBooking, getPayment, sql, withCronLock } from '../../support/db'
import { USERS_ORIGIN } from '../../support/journey'
import { blockThirdParties, dismissLocationPrompt } from '../../support/network'
import { BOOKINGS, CUSTOMERS, STAFF, VENDORS } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

const DIGEST = `${API}/api/v1/ops/pending-digest`
const SECRET = process.env.CRON_SECRET ?? ''
const BOOKING = BOOKINGS.notAccepted
const HEADERS = { 'X-Vendor-Id': VENDORS.response.id }

test.describe('garage response deadline @p0', () => {
  test('an overdue paid booking is cancelled by the cron and refunded, and the customer is pointed elsewhere', async ({
    browser,
    request,
  }) => {
    test.skip(SECRET.length < 32, 'CRON_SECRET is not set for this run')
    const garage = await loginViaApi(STAFF.responseOwner.phone, 'vendor')

    // Made overdue here, inside the cron lock, and held until this spec's own
    // run: another spec's run would otherwise cancel it first.
    await withCronLock(async () => {
      await sql`update bookings set respond_by = now() - interval '15 minutes' where id = ${BOOKING}`

      // ── past the deadline, before the cron: Accept is refused ──────────────
      const early = await garage.patch(`${API}/api/v1/bookings/${BOOKING}/accept`, { headers: HEADERS })
      expect(early.status()).toBe(409)
      expect((await early.json()).code).toBe('RESPONSE_TIME_PASSED')
      // And so is suggesting other times instead.
      const suggest = await garage.post(`${API}/api/v1/vendors/me/bookings/${BOOKING}/time-proposal`, {
        headers: HEADERS,
        data: { slots: [new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()] },
      })
      expect(suggest.status()).toBe(409)
      expect((await suggest.json()).code).toBe('RESPONSE_TIME_PASSED')
      expect((await getBooking(BOOKING))?.status).toBe('pending')

      // ── the scheduler's run cancels it ─────────────────────────────────────
      const run = await request.post(DIGEST, { headers: { authorization: `Bearer ${SECRET}` } })
      expect(run.status()).toBe(200)
      const { data } = await run.json()
      expect(data.notAccepted.enabled).toBe(true)
      expect(data.notAccepted.cancelled).toBeGreaterThanOrEqual(1)
    })

    const row = await getBooking(BOOKING)
    expect(row?.status).toBe('cancelled')
    expect(row?.cancelled_by).toBe('vendor')
    expect(row?.cancellation_reason).toBe('Not accepted in time')
    const [missed] = await sql<{ response_missed_at: Date | null }[]>`
      select response_missed_at from bookings where id = ${BOOKING}
    `
    expect(missed.response_missed_at).not.toBeNull()
    // AUTO_REFUNDS is off here: the payment stays paid, owed back in full.
    expect((await getPayment(BOOKING))?.status).toBe('paid')

    // ── still refused after, with the same words ───────────────────────────
    const late = await garage.patch(`${API}/api/v1/bookings/${BOOKING}/accept`, { headers: HEADERS })
    expect(late.status()).toBe(409)
    expect((await late.json()).code).toBe('RESPONSE_TIME_PASSED')
    await garage.dispose()

    // ── the customer: owed in full, and other garages ──────────────────────
    const customerApi = await loginViaApi(CUSTOMERS.notAccepted.phone)
    const detail = (await (await customerApi.get(`${API}/api/v1/bookings/${BOOKING}`)).json()).data
    expect(detail.notAcceptedInTime).toBe(true)
    expect(detail.refund).toMatchObject({ status: 'owed', amount: '600.00' })

    const others = await customerApi.get(`${API}/api/v1/bookings/${BOOKING}/other-garages`)
    expect(others.ok()).toBe(true)
    const suggestions = (await others.json()).data
    expect(suggestions.bookingType).toBe('dropin')
    const ids = suggestions.items.map((item: { id: string }) => item.id)
    expect(ids).toContain(VENDORS.responseOther.id)
    expect(ids).not.toContain(VENDORS.response.id)
    expect(ids.length).toBeLessThanOrEqual(3)
    await customerApi.dispose()

    // Nobody else's to read.
    const stranger = await loginViaApi(CUSTOMERS.proposalDecliner.phone)
    expect((await stranger.get(`${API}/api/v1/bookings/${BOOKING}/other-garages`)).status()).toBe(404)
    await stranger.dispose()

    const ctx = await browser.newContext({ storageState: statePath('customer-notAccepted'), baseURL: USERS_ORIGIN })
    await answerCookieQuestion(ctx)
    await dismissLocationPrompt(ctx)
    await blockThirdParties(ctx)
    const page = await ctx.newPage()
    await page.goto(`/bookings/${BOOKING}`)
    await expect(page.getByRole('heading', { name: `${VENDORS.response.name} didn't accept in time` })).toBeVisible()
    await expect(page.getByText('Your full refund is on its way (5–7 working days).')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Book another garage' })).toBeVisible()
    const otherGarages = page.getByRole('region', { name: 'Book another garage' })
    await expect(otherGarages.getByRole('heading', { name: VENDORS.responseOther.name })).toBeVisible()
    await expect(otherGarages.locator(`a[href^="/garage/${VENDORS.responseOther.id}"]`)).toBeVisible()
    await ctx.close()
  })
})
