/**
 * Repair & bodywork quotes (0076), across the customer app and the garage
 * portal.
 *
 * The customer opens "Repair quotes" from Home, picks their car, is told a
 * 45-second video is too long, adds a photo instead and says what happened.
 * Detlio's brief (AI_FAKE: FAKE_BRIEF_READING) shows with its box and asks
 * for another angle; the customer edits it and sends it to the nearby
 * garages that take repair quotes. One garage quotes ₹4,000–5,500 for 2
 * days (needs to see the car), the other can't do it. The customer sees the
 * quote and books a visit: a "price on inspection" booking with nothing to
 * pay. A request of their own they cancel.
 *
 * REPAIR_QUOTES: two garages, their owners and a customer of their own
 * (7550–7599). The rules are unit-tested in apps/server/src/lib/repair-quotes.test.ts
 * and the routes in apps/server/src/modules/repair-quotes/repair-quotes.routes.test.ts.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { openActors } from '../../support/journey'
import { REPAIR_QUOTES } from '../../support/seed-ids'

const Q = REPAIR_QUOTES
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')
const PIXEL = path.join(FIXTURES, 'pixel.png')
const CLIP_45 = path.join(FIXTURES, 'clip-45s.webm')
const BRIEF = 'Front bumper, left side: deep scratch with a small dent, paint damaged.'
const EDITED = 'Front bumper, left side: deep scratch and a small dent near the fog lamp.'
const NOTE = 'Scraped a pillar while parking'
const CANCEL_REQUEST = 'e2e00000-0000-4000-8000-000000007640'
/** specs/admin/repair-quotes.spec.ts's own request for the same customer: left alone here. */
const ADMIN_REQUEST = 'e2e00000-0000-4000-8000-000000007641'

test.describe.configure({ mode: 'serial' })

/** The customer stands at the repair garages' point, as the location store keeps it. */
async function standAtRepairPoint(context: BrowserContext) {
  await context.addInitScript((at) => {
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: { location: { ...at, label: 'Mahabalipuram', source: 'gps', updatedAt: Date.now() }, promptDismissedAt: Date.now() },
        version: 0,
      })
    )
  }, Q.point)
}

const latestRequest = async () => {
  const rows = await sql<{ id: string; status: string; brief: string; brief_source: string; photos: Array<{ key: string; kind: string }> }[]>`
    select id, status, brief, brief_source, photos from repair_quote_requests
     where user_id = ${Q.customer.id} and id not in (${CANCEL_REQUEST}, ${ADMIN_REQUEST})
     order by created_at desc limit 1
  `
  return rows[0]
}

test.describe('repair & bodywork quotes @p0', () => {
  test.beforeAll(async () => {
    await sql`delete from repair_quote_requests where user_id = ${Q.customer.id} and id <> ${ADMIN_REQUEST}`
  })

  test('the customer sends a dent with a photo and an edited brief', async ({ browser }) => {
    const { customerCtx, customer, close } = await openActors(browser, 'customer-repair', Q.garage.id, 'vendor-repair')
    await standAtRepairPoint(customerCtx)
    await customer.setViewportSize({ width: 375, height: 812 })

    // ── Home's tile ────────────────────────────────────────────────────────
    await customer.goto('/home')
    const tile = customer.getByRole('link', { name: /Dent or scratch\?.*Repair quotes/ })
    await expect(tile).toBeVisible()
    await expect(tile).toContainText('From garages near you')
    await tile.click()
    await expect(customer).toHaveURL(/\/repair-quotes\/new$/)
    await expect(customer.getByText('Step 1 of 2')).toBeVisible()

    // ── Step 1: car, damage, one line ──────────────────────────────────────
    const car = customer.getByRole('button', { name: /Maruti Swift/ })
    await expect(car).toHaveAttribute('aria-pressed', 'true')
    await expect(car).toContainText('Hatchback · white')
    const next = customer.getByRole('button', { name: 'Next', exact: true })
    await expect(next).toBeDisabled()

    // A video over 30 seconds is refused on the phone.
    await customer.getByLabel('Add video').setInputFiles(CLIP_45)
    await expect(customer.getByRole('alert').filter({ hasText: 'Keep the video to 30 seconds or less' })).toBeVisible()

    await customer.getByLabel('Add photo').setInputFiles(PIXEL)
    await expect(customer.getByRole('img', { name: 'Photo 1' })).toBeVisible()
    await customer.getByRole('button', { name: 'Remove photo 1' }).click()
    await expect(customer.getByRole('img', { name: 'Photo 1' })).toHaveCount(0)
    await customer.getByLabel('Add photo').setInputFiles(PIXEL)
    await expect(customer.getByRole('img', { name: 'Photo 1' })).toBeVisible()

    await customer.getByLabel('What happened?').fill(NOTE)
    await expect(customer.getByText('Garages near Mahabalipuram')).toBeVisible()
    await expect(next).toBeEnabled()
    await next.click()

    // ── Step 2: what garages will see ──────────────────────────────────────
    await expect(customer.getByText('Step 2 of 2')).toBeVisible()
    await expect(customer.getByRole('heading', { name: 'Check before sending' })).toBeVisible()
    const preview = customer.getByRole('region', { name: 'What garages will see' })
    await expect(preview.getByText(BRIEF)).toBeVisible()
    await expect(preview.getByRole('img', { name: 'Your car, with the damage marked' })).toBeVisible()
    await expect(preview.getByText('Scratch + small dent')).toBeVisible()
    await expect(preview.getByText(`“${NOTE}”`)).toBeVisible()

    // The fake reading asks for another angle.
    await expect(customer.getByText('Add another angle?')).toBeVisible()
    await expect(customer.getByText('A close photo from the left side helps garages quote closer.')).toBeVisible()
    await expect(customer.getByLabel('Add another angle')).toBeAttached()

    await preview.getByRole('button', { name: 'Edit' }).click()
    const words = preview.getByRole('textbox', { name: 'What garages will read' })
    await expect(words).toHaveValue(BRIEF)
    await words.fill(EDITED)
    await preview.getByRole('button', { name: 'Done' }).click()
    await expect(preview.getByText(EDITED)).toBeVisible()

    await expect(customer.getByText('Goes to up to 5 garages near you that do bodywork. Your number stays hidden.')).toBeVisible()
    await customer.getByRole('button', { name: 'Send to nearby garages' }).click()

    // ── Waiting ────────────────────────────────────────────────────────────
    await expect(customer).toHaveURL(/\/repair-quotes\/[0-9a-f-]{36}$/)
    await expect(customer.getByRole('heading', { name: 'Sent to 2 garages' })).toBeVisible()
    const asked = customer.getByRole('region', { name: 'Garages asked' })
    await expect(asked.getByText(Q.garage.name)).toBeVisible()
    await expect(asked.getByText(Q.second.name)).toBeVisible()
    await expect(asked.getByText('Waiting')).toHaveCount(2)
    await expect(customer.getByText('Quotes stay open for 48 hours.')).toBeVisible()
    await expect(customer.getByRole('button', { name: 'Cancel request' })).toBeVisible()

    const request = await latestRequest()
    expect(request).toMatchObject({ status: 'open', brief: EDITED, brief_source: 'ai_edited' })
    expect(request!.photos).toHaveLength(1)
    expect(request!.photos[0]!.key).toMatch(/^repair-quotes\/[0-9a-f]{32}\/[0-9a-f-]{36}\.(jpg|png)$/)
    expect(request!.photos[0]!.key).not.toContain(Q.customer.id)
    const quotes = await sql<{ vendor_id: string; minutes: number }[]>`
      select vendor_id, round(extract(epoch from (respond_by - created_at)) / 60)::int as minutes
        from repair_quotes where request_id = ${request!.id} order by distance_km
    `
    expect(quotes.map((q) => q.vendor_id)).toEqual([Q.garage.id, Q.second.id])
    // Open all day: 4 working hours each.
    for (const q of quotes) expect(q.minutes).toBe(240)
    await close()
  })

  test('the garage sees the card with no customer details and sends a quote', async ({ browser }) => {
    const request = await latestRequest()
    const { vendor, close } = await openActors(browser, 'customer-repair', Q.garage.id, 'vendor-repair')
    await vendor.setViewportSize({ width: 390, height: 844 })
    await vendor.goto('/requests')
    await expect(vendor.getByText('Customers ask you to come, or for a repair quote. Nothing is paid until you say yes.')).toBeVisible()
    // Found by its brief: admin's spec may have a request of its own here too.
    const card = vendor.locator('[data-repair-quote-card]').filter({ hasText: EDITED })
    await expect(card).toBeVisible()
    await expect(card.getByText('Repair quote · new')).toBeVisible()
    await expect(card.getByRole('heading', { name: 'Front bumper, left side' })).toBeVisible()
    await expect(card.getByText('Maruti Swift · hatchback')).toBeVisible()
    await expect(card.getByText(/km from you$/)).toBeVisible()
    await expect(card.getByText('Detlio’s summary')).toBeVisible()
    await expect(card.getByText(EDITED)).toBeVisible()
    await expect(card.getByText(`Customer wrote: “${NOTE}”`)).toBeVisible()
    await expect(card.getByRole('button', { name: 'Open picture 1' })).toBeVisible()
    // Never the customer's name or phone before a visit is booked.
    await expect(vendor.getByText(Q.customer.name)).toHaveCount(0)
    await expect(vendor.getByText(Q.customer.phone)).toHaveCount(0)

    await card.getByRole('button', { name: 'Open picture 1' }).click()
    await expect(vendor.getByRole('dialog', { name: 'The damage' })).toBeVisible()
    await vendor.getByRole('button', { name: 'Close' }).click()

    await card.getByRole('link', { name: 'Can do' }).click()
    await expect(vendor).toHaveURL(/\/requests\/repair\/[0-9a-f-]{36}$/)
    await expect(vendor.getByText('Your quote')).toBeVisible()
    await expect(vendor.getByText('left to answer')).toBeVisible()
    const send = vendor.getByRole('button', { name: 'Send quote' })
    await expect(send).toBeDisabled()
    await vendor.getByLabel('Price from (₹)').fill('5500')
    await vendor.getByLabel('Price to (₹)').fill('4000')
    await vendor.getByRole('radio', { name: '2', exact: true }).click()
    await expect(vendor.getByText('The price to must be the same as or above the price from')).toBeVisible()
    await vendor.getByLabel('Price from (₹)').fill('4,000')
    await vendor.getByLabel('Price to (₹)').fill('5,500')
    await expect(vendor.getByRole('switch', { name: 'Need to see the car first' })).toHaveAttribute('aria-checked', 'true')
    await vendor.getByLabel('Note for the customer (optional)').fill('Can match the paint and polish the rest of the bumper.')
    await send.click()
    await expect(vendor).toHaveURL(/\/requests$/)

    await expect
      .poll(async () => {
        const rows = await sql<{ status: string; price_from: number; price_to: number; days: number; needs_inspection: boolean }[]>`
          select status, price_from, price_to, days, needs_inspection from repair_quotes
           where request_id = ${request!.id} and vendor_id = ${Q.garage.id}
        `
        return rows[0]
      })
      .toEqual({ status: 'quoted', price_from: 4000, price_to: 5500, days: 2, needs_inspection: true })

    // Answered once: a second answer is refused.
    const quoteId = (await sql<{ id: string }[]>`select id from repair_quotes where request_id = ${request!.id} and vendor_id = ${Q.garage.id}`)[0]!.id
    const again = await vendor.request.post(`${API}/api/v1/vendors/me/repair-quotes/${quoteId}/answer`, {
      data: { canDo: false },
      headers: { 'X-Vendor-Id': Q.garage.id },
    })
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('REPAIR_QUOTE_ANSWERED')

    // Closed: the quote sent, by its range.
    await vendor.getByRole('radio', { name: 'Closed' }).click()
    const closed = vendor.locator('[data-repair-quote-card]').filter({ hasText: 'Front bumper, left side' }).filter({ hasText: 'Quote sent' })
    await expect(closed).toContainText('₹4,000–5,500')
    await close()
  })

  test('the second garage can’t do it, with a reason', async ({ browser }) => {
    const request = await latestRequest()
    const { vendor, close } = await openActors(browser, 'customer-repair', Q.second.id, 'vendor-repair-second')
    await vendor.goto('/requests')
    const card = vendor.locator('[data-repair-quote-card]').filter({ hasText: EDITED })
    await card.getByRole('button', { name: 'Can’t do' }).click()
    const sheet = vendor.getByRole('dialog', { name: 'Can’t do this repair' })
    await expect(sheet.getByRole('heading', { name: 'Can’t do this repair?' })).toBeVisible()
    await sheet.getByLabel('Reason for the customer (optional)').fill('We don’t do paint work.')
    await sheet.getByRole('button', { name: 'Send', exact: true }).click()
    await expect
      .poll(async () => {
        const rows = await sql<{ status: string; decline_reason: string | null }[]>`
          select status, decline_reason from repair_quotes where request_id = ${request!.id} and vendor_id = ${Q.second.id}
        `
        return rows[0]
      })
      .toEqual({ status: 'declined', decline_reason: 'We don’t do paint work.' })
    await close()
  })

  test('the customer sees the quote and books a visit with nothing to pay', async ({ browser }) => {
    const request = await latestRequest()
    const { customerCtx, customer, close } = await openActors(browser, 'customer-repair', Q.garage.id, 'vendor-repair')
    await standAtRepairPoint(customerCtx)
    await customer.setViewportSize({ width: 375, height: 812 })
    await customer.goto(`/repair-quotes/${request!.id}`)

    await expect(customer.getByRole('heading', { name: '1 quote for your Swift' })).toBeVisible()
    const quote = customer.getByRole('region', { name: Q.garage.name })
    await expect(quote.getByText('Can do')).toBeVisible()
    await expect(quote.getByText('₹4,000–5,500')).toBeVisible()
    await expect(quote.getByText('2 days')).toBeVisible()
    await expect(quote.getByText('Needs to see the car')).toBeVisible()
    await expect(quote.getByText('“Can match the paint and polish the rest of the bumper.”')).toBeVisible()
    // Fewer than 3 billed visits: no badge yet.
    await expect(quote.getByText('Final bills match quotes')).toHaveCount(0)
    await expect(customer.getByText(Q.second.name)).toBeVisible()
    await expect(customer.getByText('“We don’t do paint work.”')).toBeVisible()

    await quote.getByRole('button', { name: `Book a visit at ${Q.garage.name}` }).click()
    const sheet = customer.getByRole('dialog', { name: 'Book a visit' })
    await expect(sheet.getByRole('heading', { name: `Book a visit at ${Q.garage.name}` })).toBeVisible()
    await expect(sheet.getByText('Free', { exact: true })).toBeVisible()
    await expect(sheet.getByText('₹4,000–5,500')).toBeVisible()
    const book = sheet.getByRole('button', { name: 'Book visit · Free' })
    await expect(book).toBeDisabled()
    const first = sheet.getByRole('radiogroup', { name: 'Visit time' }).getByRole('radio').first()
    await first.click()
    await expect(first).toHaveAttribute('aria-checked', 'true')
    await book.click()

    await expect(customer).toHaveURL(/\/bookings\/[0-9a-f-]{36}/)
    const bookingId = customer.url().match(/\/bookings\/([0-9a-f-]{36})/)![1]!
    const rows = await sql<{ service_id: string; booking_type: string; amount: string; status: string }[]>`
      select b.service_id, b.booking_type, p.amount, b.status from bookings b join payments p on p.booking_id = b.id
       where b.id = ${bookingId}
    `
    expect(rows[0]).toMatchObject({ service_id: Q.inspection.id, booking_type: 'dropin', amount: '0.00' })
    const after = await sql<{ status: string; booking_id: string | null }[]>`
      select r.status, q.booking_id from repair_quote_requests r join repair_quotes q on q.id = r.booked_quote_id
       where r.id = ${request!.id}
    `
    expect(after[0]).toEqual({ status: 'booked', booking_id: bookingId })

    // The request page says so, and links to the booking.
    await customer.goto(`/repair-quotes/${request!.id}`)
    await expect(customer.getByText(`Visit booked at ${Q.garage.name}`)).toBeVisible()
    await customer.getByRole('link', { name: 'See booking' }).click()
    await expect(customer).toHaveURL(new RegExp(`/bookings/${bookingId}`))
    await close()
  })

  test('the customer cancels an open request', async ({ browser }) => {
    await sql`
      insert into repair_quote_requests (id, user_id, vehicle_id, vehicle_label, vehicle_type, lat, lng, area, note, brief,
        damage_area, brief_source, photos, status, closes_at)
      values (${CANCEL_REQUEST}, ${Q.customer.id}, ${Q.customer.vehicleId}, 'Maruti Swift', 'hatchback',
        ${Q.point.lat}, ${Q.point.lng}, null, 'Door ding', 'Rear left door: small dent.', 'Rear left door', 'customer',
        ${sql.json([{ key: 'repair-quotes/00000000000000000000000000000000/00000000-0000-4000-8000-000000000001.jpg', kind: 'photo' }])},
        'open', now() + interval '40 hours')
    `
    await sql`
      insert into repair_quotes (request_id, vendor_id, distance_km, respond_by)
      values (${CANCEL_REQUEST}, ${Q.garage.id}, 2.0, now() + interval '3 hours')
    `
    const { customer, close } = await openActors(browser, 'customer-repair', Q.garage.id, 'vendor-repair')
    await customer.goto(`/repair-quotes/${CANCEL_REQUEST}`)
    await expect(customer.getByRole('heading', { name: 'Sent to 1 garage' })).toBeVisible()
    await customer.getByRole('button', { name: 'Cancel request' }).click()
    const sheet = customer.getByRole('dialog', { name: 'Cancel this request?' })
    await sheet.getByRole('button', { name: 'Cancel request' }).click()
    await expect(customer.getByText('You cancelled this request.')).toBeVisible()
    await expect(customer.getByRole('link', { name: 'Send a new one' })).toHaveAttribute('href', '/repair-quotes/new')
    const rows = await sql<{ status: string }[]>`select status from repair_quote_requests where id = ${CANCEL_REQUEST}`
    expect(rows[0]?.status).toBe('cancelled')
    await close()
  })
})
