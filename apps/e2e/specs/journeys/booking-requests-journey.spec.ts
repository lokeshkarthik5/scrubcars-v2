/**
 * "Request a visit" (customer reach, part 2, 0062), across the customer app,
 * the garage portal, the API and the cron.
 *
 * Around REQ_HOME: VENDORS.reqFirst (~8.7 km north) and VENDORS.reqSecond
 * (~12.2 km south) both come to the door within 5 km, so neither covers the
 * request customers' homes and both are "just outside" (fixtures 4400–4499).
 *
 * 1. Send → the garage accepts with a ₹100 travel fee and a start time →
 *    the customer confirms and pays: one booking, the travel fee its own
 *    line, the request converted.
 * 2. The garage's "Can't" passes the request to the next nearest garage;
 *    that one's two hours run out (the cron) and the request ends, with
 *    what to do next.
 * 3. The API's rules: a yes that is not confirmed lapses, the 30-minute
 *    alert is claimed once, two open requests at most, and a booking
 *    outside a garage's reach only for its own accepted request.
 */
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql, withCronLock } from '../../support/db'
import { openActors } from '../../support/journey'
import { CUSTOMERS, REQ_HOME, SERVICES, STAFF, VENDORS } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

const DIGEST = `${API}/api/v1/ops/pending-digest`
const SECRET = process.env.CRON_SECRET ?? ''

/** Tomorrow in IST, as the request windows key days. */
function tomorrowIst(): string {
  const ist = new Date(Date.now() + (5 * 60 + 30) * 60_000 + 24 * 60 * 60_000)
  return ist.toISOString().slice(0, 10)
}

/** Where the customer stands: their home, as a phone fix. */
async function standAtHome(ctx: BrowserContext) {
  await ctx.addInitScript((at) => {
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: { location: { ...at, label: 'Home', source: 'gps', updatedAt: Date.now() }, promptDismissedAt: Date.now() },
        version: 0,
      })
    )
  }, REQ_HOME)
}

async function runCron(request: APIRequestContext) {
  // Inside the cron lock (support/db.ts withCronLock): never between another spec's setup and its own run.
  const run = await withCronLock(() => request.post(DIGEST, { headers: { authorization: `Bearer ${SECRET}` } }))
  expect(run.status()).toBe(200)
  return (await run.json()).data as { requests: { alerted: number; passedOn: number; ended: number; lapsed: number } }
}

async function createRequest(
  api: APIRequestContext,
  customer: { vehicleId: string; addressId: string },
  vendorId: string,
  serviceId: string
) {
  return api.post(`${API}/api/v1/users/me/requests`, {
    data: {
      vendorId,
      bookingType: 'doorstep',
      serviceIds: [serviceId],
      vehicleId: customer.vehicleId,
      addressId: customer.addressId,
      window: { date: tomorrowIst(), part: 'morning' },
    },
  })
}

const garageCard = (page: Page, service: string) =>
  page.locator('[data-request-card]').filter({ hasText: service })

test.describe('requests to a garage just outside its area @p0', () => {
  test('send, the garage says yes with a travel fee, the customer confirms and pays', async ({ browser }) => {
    const actors = await openActors(browser, 'customer-request', VENDORS.reqFirst.id, 'vendor-requests')
    await standAtHome(actors.customerCtx)
    const { customer, vendor } = actors

    // ── the Doorstep list: both garages just outside, with the request button
    await customer.goto('/garages?mode=doorstep')
    const outside = customer.getByRole('region', { name: 'Just outside their area' })
    await expect(outside).toBeVisible()
    await expect(outside.locator('[data-just-outside]').filter({ hasText: VENDORS.reqSecond.name })).toBeVisible()
    await outside.getByRole('button', { name: `Request a visit from ${VENDORS.reqFirst.name}` }).click()

    // ── the sheet: service, window, address, promises, Send
    const sheet = customer.getByRole('dialog', { name: `Request ${VENDORS.reqFirst.name}` })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('No payment now')).toBeVisible()
    await expect(sheet.getByText('They reply within 2 hours, or we ask the next garage')).toBeVisible()
    await expect(sheet.getByText('Any travel fee is shown before you pay')).toBeVisible()
    await sheet.getByRole('button', { name: new RegExp(SERVICES.reqFirstWash.name) }).click()
    await expect(sheet.getByRole('button', { name: new RegExp(SERVICES.reqFirstWash.name) })).toHaveAttribute('aria-pressed', 'true')
    // Priced for their sedan.
    await expect(sheet.getByRole('button', { name: new RegExp(SERVICES.reqFirstWash.name) })).toContainText('₹1,800')
    const windows = sheet.getByRole('group', { name: 'Time window' })
    await windows.getByRole('button', { name: 'Tomorrow 9–12', exact: true }).click()
    await expect(windows.getByRole('button', { name: 'Tomorrow 9–12', exact: true })).toHaveAttribute('aria-pressed', 'true')
    // Their pinned home is chosen for them.
    await expect(sheet.getByRole('button', { name: /1, Request Street/ })).toHaveAttribute('aria-pressed', 'true')
    await sheet.getByRole('button', { name: 'Send request' }).click()
    await expect(sheet.getByRole('heading', { name: 'Request sent' })).toBeVisible()

    const [sent] = await sql<{ id: string; status: string; respond_by: Date; zone_slug: string | null; outside_km: string; travel_fee: string | null }[]>`
      select id, status, respond_by, zone_slug, outside_km, travel_fee from booking_requests
       where user_id = ${CUSTOMERS.request.id} order by created_at desc limit 1
    `
    expect(sent.status).toBe('pending')
    expect(Number(sent.outside_km)).toBeGreaterThan(3)
    expect(Number(sent.outside_km)).toBeLessThan(4.5)
    expect(sent.respond_by.getTime() - Date.now()).toBeLessThanOrEqual(2 * 60 * 60 * 1000 + 5_000)

    // "See your request": the waiting card with its clock.
    await sheet.getByRole('link', { name: 'See your request' }).click()
    await expect(customer).toHaveURL(/\/requests$/)
    const waiting = customer.getByRole('region', { name: `Waiting for ${VENDORS.reqFirst.name}` })
    await expect(waiting).toBeVisible()
    await expect(waiting.getByLabel('Time left for the garage')).toHaveText(/^\d:\d{2}:\d{2}$|^\d{1,2}:\d{2}$/)
    await expect(waiting.getByRole('button', { name: 'Cancel request' })).toBeVisible()

    // Home's live status.
    await customer.goto('/home')
    await expect(customer.getByRole('link', { name: /Your request.*Req First Garage · waiting/ })).toBeVisible()

    // ── the garage: Requests inbox, a travel fee and a start time, Accept
    await vendor.goto('/home')
    await vendor.getByRole('link', { name: /Requests/ }).first().click()
    await expect(vendor).toHaveURL(/\/requests$/)
    const card = garageCard(vendor, SERVICES.reqFirstWash.name)
    await expect(card).toBeVisible()
    await expect(card.getByText(/beyond your 5 km/)).toBeVisible()
    // The owner seat sees what it earns: inside its free 25, the whole price.
    await expect(card.getByText('You earn ₹1,800 + any travel fee')).toBeVisible()
    // Never the customer's address or name before it is a booking.
    await expect(card.getByText('Request Street')).toHaveCount(0)
    await expect(card.getByText(CUSTOMERS.request.name)).toHaveCount(0)
    await card.getByRole('radiogroup', { name: 'Travel fee' }).getByRole('radio', { name: '+₹100' }).click()
    await card.getByRole('radiogroup', { name: 'Start time' }).getByRole('radio').first().click()
    await card.getByRole('button', { name: 'Accept' }).click()
    await expect(vendor.getByText(/Accepted\. The customer has until/)).toBeVisible()

    const [accepted] = await sql<{ status: string; travel_fee: string; accepted_start_at: Date; confirm_by: Date }[]>`
      select status, travel_fee, accepted_start_at, confirm_by from booking_requests where id = ${sent.id}
    `
    expect(accepted.status).toBe('accepted')
    expect(accepted.travel_fee).toBe('100.00')
    expect(accepted.confirm_by.getTime()).toBeLessThanOrEqual(accepted.accepted_start_at.getTime() - 30 * 60_000)

    // ── the customer: Home says confirm by; the request page's Confirm & pay
    await customer.goto('/home')
    await expect(customer.getByRole('link', { name: /Accepted: confirm by/ })).toBeVisible()
    await customer.goto('/requests')
    await customer.getByRole('link', { name: 'Confirm & pay ₹1,900' }).click()
    await expect(customer).toHaveURL(new RegExp(`/book/${VENDORS.reqFirst.id}\\?.*request=${sent.id}`))
    await expect(customer.getByRole('region', { name: new RegExp(`${VENDORS.reqFirst.name} will come`) })).toBeVisible()
    const price = customer.getByRole('region', { name: 'Price' })
    await expect(price.getByText('Travel fee')).toBeVisible()
    await expect(price.getByText('₹1,900')).toBeVisible()
    await expect(customer.getByRole('button', { name: 'Pay ₹1,900' })).toBeVisible()
    await customer.getByRole('button', { name: 'Pay ₹1,900' }).click()
    await customer.waitForURL(/\/bookings\/[0-9a-f-]+/)

    const [converted] = await sql<{ status: string; booking_id: string }[]>`
      select status, booking_id from booking_requests where id = ${sent.id}
    `
    expect(converted.status).toBe('converted')
    const [booking] = await sql<{ amount: string; subtotal_amount: string; travel_fee: string; scheduled_at: Date; booking_type: string; vendor_id: string; status: string; respond_by: Date | null }[]>`
      select amount, subtotal_amount, travel_fee, scheduled_at, booking_type, vendor_id, status, respond_by from bookings where id = ${converted.booking_id}
    `
    // Booked accepted: the garage already said yes to this job and time.
    expect(booking).toMatchObject({ amount: '1900.00', subtotal_amount: '1900.00', travel_fee: '100.00', booking_type: 'doorstep', vendor_id: VENDORS.reqFirst.id, status: 'confirmed', respond_by: null })
    expect(booking.scheduled_at.getTime()).toBe(accepted.accepted_start_at.getTime())

    // The booking page and the receipt show the travel fee as its own line.
    await expect(customer.getByText('Travel fee')).toBeVisible()
    await actors.close()
  })

  test('"Can\'t" passes it to the next nearest garage; when that one runs out of time, the customer is told what next', async ({ browser, request }) => {
    test.skip(SECRET.length < 32, 'CRON_SECRET is not set for this run')
    const api = await loginViaApi(CUSTOMERS.requestForward.phone)
    const created = await createRequest(api, CUSTOMERS.requestForward, VENDORS.reqFirst.id, SERVICES.reqFirstWash.id)
    expect(created.status()).toBe(201)
    const first = (await created.json()).data as { id: string }

    const actors = await openActors(browser, 'customer-requestForward', VENDORS.reqFirst.id, 'vendor-requests')
    const { customer, vendor } = actors
    await vendor.goto('/requests')
    const card = vendor.locator('[data-request-card]').filter({ hasText: SERVICES.reqFirstWash.name }).filter({
      has: vendor.getByRole('button', { name: "Can't" }),
    })
    await card.first().getByRole('button', { name: "Can't" }).click()
    await expect(vendor.getByText('Passed to the next garage')).toBeVisible()

    const chain = await sql<{ id: string; vendor_id: string; status: string; reply: string | null; chain_no: number }[]>`
      select id, vendor_id, status, reply, chain_no from booking_requests
       where id = ${first.id} or root_request_id = ${first.id} order by chain_no
    `
    expect(chain).toHaveLength(2)
    expect(chain[0]).toMatchObject({ status: 'forwarded', reply: 'declined', chain_no: 1 })
    expect(chain[1]).toMatchObject({ vendor_id: VENDORS.reqSecond.id, status: 'pending', chain_no: 2 })

    // The customer follows it to the second garage.
    await customer.goto('/requests')
    await expect(customer.getByRole('region', { name: `Waiting for ${VENDORS.reqSecond.name}` })).toBeVisible()
    await expect(customer.getByText('Tried 2 of 2 nearby garages.')).toBeVisible()

    // ── the second garage's two hours run out: the cron ends it (no third garage)
    await sql`update booking_requests set respond_by = now() - interval '1 minute', created_at = now() - interval '2 hours' where id = ${chain[1].id}`
    const data = await runCron(request)
    expect(data.requests.ended).toBeGreaterThanOrEqual(1)
    const [ended] = await sql<{ status: string; reply: string | null }[]>`select status, reply from booking_requests where id = ${chain[1].id}`
    expect(ended).toMatchObject({ status: 'expired', reply: null })

    await customer.goto('/requests')
    const update = customer.getByRole('region', { name: 'No nearby garage could take it this time' })
    await expect(update).toBeVisible()
    await expect(update.getByText('Tried 2 of 2 nearby garages.', { exact: false })).toBeVisible()
    await update.getByRole('link', { name: 'See garages to visit' }).click()
    await expect(customer).toHaveURL(/\/garages$/)
    await actors.close()
    await api.dispose()
  })

  test('the rules: a yes not confirmed lapses, the 30-minute alert is claimed once, two open at most, and a booking outside a garage’s reach only for its own accepted request', async ({ request }) => {
    test.skip(SECRET.length < 32, 'CRON_SECRET is not set for this run')
    const api = await loginViaApi(CUSTOMERS.requestLapse.phone)
    const garage = await loginViaApi(STAFF.requestOwner.phone, 'vendor')
    const headers = { 'X-Vendor-Id': VENDORS.reqSecond.id }

    // The windows a garage can be asked for are public.
    const windows = await request.get(`${API}/api/v1/booking-requests/windows`, {
      params: { vendorId: VENDORS.reqSecond.id, mode: 'doorstep', durationMins: 60 },
    })
    expect(windows.status()).toBe(200)
    const offered = (await windows.json()).data as { quick: Array<{ date: string; part: string; open: boolean }>; days: unknown[] }
    expect(offered.quick.find((w) => w.date === tomorrowIst() && w.part === 'morning')?.open).toBe(true)
    expect(offered.days).toHaveLength(14)

    // ── 30 minutes with no answer: the team is told, once
    const made = await createRequest(api, CUSTOMERS.requestLapse, VENDORS.reqSecond.id, SERVICES.reqSecondWash.id)
    expect(made.status()).toBe(201)
    const req = (await made.json()).data as { id: string }
    await sql`update booking_requests set created_at = now() - interval '31 minutes' where id = ${req.id}`
    await runCron(request)
    const [alerted] = await sql<{ ops_alerted_at: Date | null }[]>`select ops_alerted_at from booking_requests where id = ${req.id}`
    expect(alerted.ops_alerted_at).not.toBeNull()
    await runCron(request)
    const [again] = await sql<{ ops_alerted_at: Date }[]>`select ops_alerted_at from booking_requests where id = ${req.id}`
    expect(again.ops_alerted_at.getTime()).toBe(alerted.ops_alerted_at!.getTime())

    // ── the garage says yes; a fee other than 0/100/200, or a time it does not offer, is refused
    const starts = (await (await garage.get(`${API}/api/v1/vendors/me/requests/${req.id}/start-times`, { headers })).json()).data.starts as string[]
    expect(starts.length).toBeGreaterThan(0)
    const badFee = await garage.post(`${API}/api/v1/vendors/me/requests/${req.id}/accept`, { headers, data: { startAt: starts[0], travelFee: 150 } })
    expect(badFee.status()).toBe(400)
    const badStart = await garage.post(`${API}/api/v1/vendors/me/requests/${req.id}/accept`, {
      headers,
      data: { startAt: new Date(Date.now() + 9 * 24 * 60 * 60_000).toISOString(), travelFee: 0 },
    })
    expect(badStart.status()).toBe(409)
    // Another garage's request is a 404.
    const notTheirs = await garage.post(`${API}/api/v1/vendors/me/requests/${req.id}/accept`, {
      headers: { 'X-Vendor-Id': VENDORS.reqFirst.id },
      data: { startAt: starts[0], travelFee: 0 },
    })
    expect(notTheirs.status()).toBe(404)
    const yes = await garage.post(`${API}/api/v1/vendors/me/requests/${req.id}/accept`, { headers, data: { startAt: starts[0], travelFee: 200 } })
    expect(yes.status()).toBe(200)

    // ── a booking outside the garage's reach: refused without the request …
    const intent = {
      vendorId: VENDORS.reqSecond.id,
      serviceIds: [SERVICES.reqSecondWash.id],
      vehicleId: CUSTOMERS.requestLapse.vehicleId,
      addressId: CUSTOMERS.requestLapse.addressId,
      bookingType: 'doorstep',
      scheduledAt: starts[0],
      paymentMethod: 'online',
    }
    const plain = await api.post(`${API}/api/v1/booking-intents`, { data: intent })
    expect(plain.status()).toBe(400)
    expect((await plain.json()).code).toBe('OUTSIDE_DOORSTEP_RADIUS')
    // … refused when it is not what was accepted …
    const moved = await api.post(`${API}/api/v1/booking-intents`, {
      data: { ...intent, requestId: req.id, scheduledAt: new Date(Date.parse(starts[0]!) + 30 * 60_000).toISOString() },
    })
    expect(moved.status()).toBe(409)
    expect((await moved.json()).code).toBe('REQUEST_MISMATCH')
    // … and someone else's request is a 404.
    const stranger = await loginViaApi(CUSTOMERS.requestLimit.phone)
    const theirs = await stranger.post(`${API}/api/v1/booking-intents`, {
      data: { ...intent, vehicleId: CUSTOMERS.requestLimit.vehicleId, addressId: CUSTOMERS.requestLimit.addressId, requestId: req.id },
    })
    expect(theirs.status()).toBe(404)

    // ── the yes is not confirmed in time: it lapses, and checkout refuses it
    await sql`update booking_requests set confirm_by = now() - interval '1 minute' where id = ${req.id}`
    const lapsedRun = await runCron(request)
    expect(lapsedRun.requests.lapsed).toBeGreaterThanOrEqual(1)
    const view = (await (await api.get(`${API}/api/v1/users/me/requests/${req.id}`)).json()).data as { state: string }
    expect(view.state).toBe('lapsed')
    const late = await api.post(`${API}/api/v1/booking-intents`, { data: { ...intent, requestId: req.id } })
    expect(late.status()).toBe(409)
    expect((await late.json()).code).toBe('REQUEST_NOT_ACCEPTED')

    // ── two open requests at most
    const one = await createRequest(stranger, CUSTOMERS.requestLimit, VENDORS.reqFirst.id, SERVICES.reqFirstWash.id)
    const two = await createRequest(stranger, CUSTOMERS.requestLimit, VENDORS.reqSecond.id, SERVICES.reqSecondWash.id)
    expect([one.status(), two.status()]).toEqual([201, 201])
    const three = await createRequest(stranger, CUSTOMERS.requestLimit, VENDORS.reqFirst.id, SERVICES.reqFirstWash.id)
    expect(three.status()).toBe(409)
    expect((await three.json()).code).toBe('REQUEST_LIMIT')
    // Cancelling one makes room.
    const cancel = await stranger.post(`${API}/api/v1/users/me/requests/${(await one.json()).data.id}/cancel`)
    expect(cancel.status()).toBe(200)
    expect((await cancel.json()).data.state).toBe('cancelled')

    await Promise.all([api.dispose(), garage.dispose(), stranger.dispose()])
  })
})
