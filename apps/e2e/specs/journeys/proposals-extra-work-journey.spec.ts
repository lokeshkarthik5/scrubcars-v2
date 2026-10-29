/**
 * Suggested times and extra work (0041), across the garage portal, the
 * customer app and the API, at VENDORS.proposals (fixtures in the reserved
 * 2100–2199 range).
 *
 * A garage that can't do a booking's time suggests two others from its own
 * free times; the customer picks one on their booking page and the booking
 * moves there, already accepted, with its payment. Another customer says
 * none work, which cancels as the garage's decline with the payment owed
 * back in full. On a job under way the garage asks for extra work; it can't
 * complete the job while that waits; the customer approves it by paying with
 * the (stubbed) Razorpay sheet, and the garage sees it approved. The closing
 * assertions are on the database, where both apps agree.
 */
import { test, expect } from '../../support/fixtures'
import { answerCookieQuestion } from '../../support/consent'
import { API, loginViaApi, statePath } from '../../support/auth'
import {
  getBooking,
  getCharges,
  getPayment,
  getTimeProposals,
  movedTo,
} from '../../support/db'
import { openActors } from '../../support/journey'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

const GARAGE = VENDORS.proposals.id
const HEADERS = { 'X-Vendor-Id': GARAGE }

/**
 * The seed books these for tomorrow (IST hours, on the seed's clock). The
 * day is read back from the booking itself, so a run that crosses midnight
 * UTC between the seed and the test still asks about the booked day.
 */
async function bookedDay(bookingId: string): Promise<string> {
  const row = await getBooking(bookingId)
  return istDay(new Date(row!.scheduled_at))
}

/** That day at an IST hour. */
const atHour = (day: string, hour: number) =>
  new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+05:30`)

const istDay = (date: Date) =>
  date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

test.describe('garage suggests another time @p0', () => {
  test('two times offered, the customer picks one, and the booking is confirmed there', async ({
    browser,
  }) => {
    const { customer, vendorCtx, close } = await openActors(
      browser,
      'customer-proposalPicker',
      GARAGE,
      'vendor-proposals'
    )
    const bookingId = BOOKINGS.proposalPick
    const day = await bookedDay(bookingId)
    const first = atHour(day, 14)
    const second = atHour(day, 16)

    // ── the garage's own free times for this job ───────────────────────────
    const slots = await vendorCtx.request.get(
      `${API}/api/v1/vendors/me/bookings/${bookingId}/time-proposal/slots?date=${istDay(first)}`,
      { headers: HEADERS }
    )
    expect(slots.ok()).toBe(true)
    const free: string[] = (await slots.json()).data.slots
    const times = free.map((slot) => new Date(slot).getTime())
    expect(times).toContain(first.getTime())
    expect(times).toContain(second.getTime())
    // Never the booked time itself.
    expect(times).not.toContain(atHour(day, 10).getTime())

    // ── the garage suggests two of them ────────────────────────────────────
    const suggested = await vendorCtx.request.post(
      `${API}/api/v1/vendors/me/bookings/${bookingId}/time-proposal`,
      {
        headers: HEADERS,
        data: {
          slots: [second.toISOString(), first.toISOString()],
          note: 'Both bays are busy at 10',
        },
      }
    )
    expect(suggested.status()).toBe(201)
    const suggestedBooking = (await suggested.json()).data
    expect(suggestedBooking.timeProposal.status).toBe('open')
    expect(
      suggestedBooking.timeProposal.options.map((o: string) =>
        new Date(o).getTime()
      )
    ).toEqual([first.getTime(), second.getTime()])

    // While it waits, the garage can neither accept nor suggest again.
    const accept = await vendorCtx.request.patch(
      `${API}/api/v1/bookings/${bookingId}/accept`,
      {
        headers: HEADERS,
      }
    )
    expect(accept.status()).toBe(409)
    expect((await accept.json()).code).toBe('TIME_PROPOSAL_OPEN')

    // Nobody else can answer it.
    const stranger = await loginViaApi(CUSTOMERS.proposalDecliner.phone)
    const stolen = await stranger.post(
      `${API}/api/v1/bookings/${bookingId}/time-proposal/choose`,
      {
        data: { slot: first.toISOString() },
      }
    )
    expect(stolen.status()).toBe(404)
    await stranger.dispose()

    // ── the customer picks the first on their booking page ─────────────────
    await customer.goto(`/bookings/${bookingId}`)
    await expect(
      customer.getByRole('heading', { name: /can't do 10:00 am — pick another time/ })
    ).toBeVisible()
    await expect(customer.getByText('Both bays are busy at 10')).toBeVisible()
    await customer.getByRole('button', { name: /^Book .+, 2:00 pm$/ }).click()

    await expect
      .poll(async () => (await movedTo(bookingId))?.status)
      .toBe('confirmed')
    const moved = (await movedTo(bookingId))!
    expect(moved.scheduled_at.getTime()).toBe(first.getTime())
    expect(moved.accepted_at).not.toBeNull()
    expect(moved.original_booking_id).toBe(bookingId)
    // The garage's move does not use up the customer's reschedules.
    expect(moved.reschedule_count).toBe(0)
    await expect(customer).toHaveURL(new RegExp(`/bookings/${moved.id}$`))

    // The old booking is retired as moved; the payment went with it.
    expect((await getBooking(bookingId))?.status).toBe('cancelled')
    expect((await getPayment(moved.id))?.status).toBe('paid')
    const [proposal] = await getTimeProposals(bookingId)
    expect(proposal.status).toBe('accepted')
    expect(proposal.result_booking_id).toBe(moved.id)
    expect(proposal.chosen_slot?.getTime()).toBe(first.getTime())

    await close()
  })

  test('none work: cancelled as the garage’s decline, refunded in full', async ({
    browser,
  }) => {
    const vendorCtx = await browser.newContext({
      storageState: statePath('vendor-proposals'),
    })
    await answerCookieQuestion(vendorCtx)
    const customer = await loginViaApi(CUSTOMERS.proposalDecliner.phone)
    const bookingId = BOOKINGS.proposalDecline
    const evening = atHour(await bookedDay(bookingId), 18)

    const suggested = await vendorCtx.request.post(
      `${API}/api/v1/vendors/me/bookings/${bookingId}/time-proposal`,
      { headers: HEADERS, data: { slots: [evening.toISOString()] } }
    )
    expect(suggested.status()).toBe(201)

    const declined = await customer.post(
      `${API}/api/v1/bookings/${bookingId}/time-proposal/decline`
    )
    expect(declined.ok()).toBe(true)
    const booking = (await declined.json()).data
    expect(booking.status).toBe('cancelled')
    expect(booking.refund).toMatchObject({ status: 'owed', amount: '500.00' })

    const row = await getBooking(bookingId)
    expect(row?.cancelled_by).toBe('vendor')
    expect((await getTimeProposals(bookingId))[0].status).toBe('declined')

    // Answered: it can't be picked any more.
    const late = await customer.post(
      `${API}/api/v1/bookings/${bookingId}/time-proposal/choose`,
      {
        data: { slot: evening.toISOString() },
      }
    )
    expect(late.status()).toBe(409)
    expect((await late.json()).code).toBe('TIME_PROPOSAL_CLOSED')

    await customer.dispose()
    await vendorCtx.close()
  })
})

test.describe('extra work approved and paid in the app @p0', () => {
  test('the garage asks, the customer pays, the garage sees it approved', async ({
    browser,
  }) => {
    const { customer, vendor, vendorCtx, close } = await openActors(
      browser,
      'customer-extraWorkPayer',
      GARAGE,
      'vendor-proposals'
    )
    const bookingId = BOOKINGS.extraWorkJob

    // ── the garage asks ────────────────────────────────────────────────────
    const asked = await vendorCtx.request.post(
      `${API}/api/v1/vendors/me/bookings/${bookingId}/extra-work`,
      {
        headers: HEADERS,
        data: {
          description: 'Replace front wiper blades',
          amount: 450,
          note: 'Both blades are torn',
        },
      }
    )
    expect(asked.status()).toBe(201)
    const work = (await asked.json()).data
    expect(work).toMatchObject({
      description: 'Replace front wiper blades',
      amount: '450.00',
      state: 'awaiting',
    })

    // It can't complete the job while the customer hasn't answered.
    const early = await vendorCtx.request.patch(
      `${API}/api/v1/bookings/${bookingId}/complete`,
      {
        headers: HEADERS,
      }
    )
    expect(early.status()).toBe(409)
    expect((await early.json()).code).toBe('EXTRA_WORK_AWAITING')

    // ── the customer approves it by paying ─────────────────────────────────
    await customer.goto(`/bookings/${bookingId}`)
    await expect(
      customer.getByRole('heading', { name: 'Extra work' })
    ).toBeVisible()
    await expect(customer.getByText('Replace front wiper blades')).toBeVisible()
    await customer.getByRole('button', { name: /^Approve & pay ₹450/ }).click()

    await expect
      .poll(async () => (await getCharges(bookingId))[0]?.status)
      .toBe('paid')
    const [paid] = await getCharges(bookingId)
    expect(paid.id).toBe(work.id)
    expect(paid.kind).toBe('extra_work')
    expect(paid.amount_due).toBe('450.00')
    expect(paid.gateway_order_id).toMatch(/^order_e2e_/)
    expect(paid.gateway_payment_id).toMatch(/^pay_e2e_/)
    await expect(customer.getByText(/Approved and paid on/)).toBeVisible()

    // ── the garage sees it approved, and can finish the job ────────────────
    await vendor.goto(`/bookings/${bookingId}`)
    // The job page's Extra work row says where it stands.
    await expect(
      vendor.getByText(
        /Replace front wiper blades · Approved & paid — go ahead/
      )
    ).toBeVisible()

    const done = await vendorCtx.request.patch(
      `${API}/api/v1/bookings/${bookingId}/complete`,
      {
        headers: HEADERS,
      }
    )
    expect(done.ok()).toBe(true)
    expect((await getBooking(bookingId))?.status).toBe('completed')

    await close()
  })
})
