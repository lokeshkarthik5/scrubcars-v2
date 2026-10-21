/**
 * A complaint, from the customer's booking to the admin Complaints tab.
 *
 * CUSTOMERS.complaints raises one about BOOKINGS.complaintDone (a finished
 * job at MAIN) from the booking's Help sheet, sees its number at once and in
 * Profile → My complaints, and ops finds it under Open with the booking and
 * garage attached. The customer is also refused a complaint about someone
 * else's booking. Then ops logs one the same customer made by phone (0039):
 * it is linked to their account by the number, attached to the booking by
 * its reference, and once acknowledged the customer reads "We're looking
 * into complaint C-…" in Updates. The clock and number rules are
 * unit-tested in packages/core/src/complaints.test.ts and
 * apps/server/src/lib/complaints.test.ts; the log's rules in
 * apps/server/src/modules/complaints/complaints.logging.test.ts.
 *
 * Its own customer and booking, read by no other spec. The test-data reset
 * API spec runs a dry run and a delete before "now", but leaves complaints
 * unticked, so this one survives it.
 */
import type { Browser } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, statePath } from '../../support/auth'
import { sql } from '../../support/db'
import { USERS_ORIGIN } from '../../support/journey'
import { blockThirdParties, dismissLocationPrompt } from '../../support/network'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

const ADMIN_ORIGIN = 'http://localhost:3002'
const COMPLAINTS = `${API}/api/v1/users/me/complaints`
const ADMIN_COMPLAINTS = `${API}/api/v1/admin/complaints`
const UPDATES = `${API}/api/v1/users/me/updates`
/** A number no account has: the logged complaint keeps the name typed. */
const NO_ACCOUNT_PHONE = '9000000088'

/** "#C0A10001": the reference as the customer and ops read it. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

const MESSAGE = `The rear bumper has a new scratch after the wash (${Date.now().toString().slice(-6)}).`

async function openCustomer(browser: Browser) {
  const ctx = await browser.newContext({
    storageState: statePath('customer-complaints'),
    baseURL: USERS_ORIGIN,
    viewport: { width: 412, height: 915 },
    isMobile: true,
  })
  await dismissLocationPrompt(ctx)
  await blockThirdParties(ctx)
  return { ctx, page: await ctx.newPage() }
}

/** The admin panel is a desktop surface, whatever this project's device is. */
async function openAdmin(browser: Browser) {
  const ctx = await browser.newContext({
    storageState: statePath('admin'),
    baseURL: ADMIN_ORIGIN,
    viewport: { width: 1280, height: 900 },
  })
  await blockThirdParties(ctx)
  return { ctx, page: await ctx.newPage() }
}

test.describe.configure({ mode: 'serial' })

test.describe('complaints @p0', () => {
  let number = ''

  test('a customer raises a complaint from a booking and gets its number at once', async ({ browser }) => {
    const { ctx, page } = await openCustomer(browser)
    const ref = `#${reference(BOOKINGS.complaintDone)}`

    await page.goto(`/bookings/${BOOKINGS.complaintDone}`)
    await page.getByRole('button', { name: 'Help with this booking' }).click()
    await page
      .getByRole('dialog', { name: 'Help with this booking' })
      .getByRole('button', { name: 'Raise a complaint' })
      .click()

    const sheet = page.getByRole('dialog', { name: 'Raise a complaint' })
    // The booking and its garage come with it; the customer never picks them.
    await expect(sheet.getByText(ref)).toBeVisible()
    await expect(sheet.getByText(VENDORS.main.name)).toBeVisible()

    const submit = sheet.getByRole('button', { name: 'Submit complaint' })
    await expect(submit).toBeDisabled()
    await sheet.getByRole('button', { name: 'Damage to my car' }).click()
    await sheet.getByLabel('What happened?').fill(MESSAGE)
    await submit.click()

    const done = page.getByRole('dialog', { name: 'Complaint received' })
    const line = done.getByText(/^Complaint C-\d{6} received — we'll get back to you within 24 hours\.$/)
    await expect(line).toBeVisible()
    number = (await line.textContent())!.match(/C-\d{6}/)![0]

    // Written as the customer's, about their booking, at its garage.
    const [row] = await sql<
      { user_id: string; booking_id: string; vendor_id: string; booking_ref: string; status: string; category: string }[]
    >`
      select user_id, booking_id, vendor_id, booking_ref, status, category
        from complaints where message = ${MESSAGE}
    `
    expect(row).toEqual({
      user_id: CUSTOMERS.complaints.id,
      booking_id: BOOKINGS.complaintDone,
      vendor_id: VENDORS.main.id,
      booking_ref: reference(BOOKINGS.complaintDone),
      status: 'open',
      category: 'damage',
    })

    // And listed in Profile, newest first.
    await done.getByRole('button', { name: 'Done' }).click()
    await page.goto('/profile')
    const mine = page.getByRole('list', { name: 'My complaints, newest first' })
    const item = mine.getByRole('listitem').filter({ hasText: number })
    await expect(item).toBeVisible()
    await expect(item.getByText('Received', { exact: true })).toBeVisible()
    await expect(item.getByText(MESSAGE)).toBeVisible()

    await ctx.close()
  })

  test("a complaint can't name someone else's booking", async ({ browser }) => {
    const { ctx } = await openCustomer(browser)
    // CUSTOMERS.reschedule's booking: as if it did not exist.
    const response = await ctx.request.post(COMPLAINTS, {
      data: {
        category: 'other',
        message: 'This is not my booking but I am trying anyway.',
        bookingId: BOOKINGS.rescheduleExhausted,
      },
    })
    expect(response.status()).toBe(404)
    expect((await response.json()).code).toBe('BOOKING_NOT_FOUND')
    // Nor a garage of its own choosing, or anyone else's account.
    const smuggled = await ctx.request.post(COMPLAINTS, {
      data: { category: 'other', message: 'Trying to set the garage myself.', vendorId: VENDORS.main.id },
    })
    expect(smuggled.status()).toBe(400)

    const [{ n }] = await sql<{ n: string }[]>`
      select count(*)::text as n from complaints where booking_id = ${BOOKINGS.rescheduleExhausted}
    `
    expect(n).toBe('0')
    await ctx.close()
  })

  test('ops sees it under Open, with the booking and the clock', async ({ browser }) => {
    test.skip(!number, 'needs the complaint raised above')
    const { ctx, page } = await openAdmin(browser)

    await page.goto('/complaints')
    await expect(page.getByRole('button', { name: /^Open \d+$/ })).toHaveAttribute('aria-pressed', 'true')
    const link = page.getByRole('link', { name: `Open complaint ${number} from ${CUSTOMERS.complaints.name}` })
    await expect(link).toBeVisible()
    const card = page.getByRole('listitem').filter({ has: link })
    await expect(card.getByText('Open', { exact: true })).toBeVisible()
    await expect(card.getByText(/^Acknowledge within \d+ h$/)).toBeVisible()

    await link.click()
    await expect(page.getByRole('heading', { name: `Complaint ${number}` })).toBeVisible()
    await expect(page.getByText(MESSAGE)).toBeVisible()
    await expect(page.getByRole('link', { name: `#${reference(BOOKINGS.complaintDone)}` })).toHaveAttribute(
      'href',
      `/bookings/${BOOKINGS.complaintDone}`
    )
    await expect(page.getByRole('link', { name: VENDORS.main.name })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Acknowledge' })).toBeVisible()

    await ctx.close()
  })

  test('ops logs a phone complaint: it is the customer’s, and its answer reaches their Updates', async ({
    browser,
  }) => {
    const admin = await openAdmin(browser)
    const PHONE_MESSAGE = `Called to say the vacuuming was skipped (${Date.now().toString().slice(-6)}).`
    const receivedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

    const logged = await admin.ctx.request.post(ADMIN_COMPLAINTS, {
      data: {
        phone: `+91 ${CUSTOMERS.complaints.phone.slice(0, 5)} ${CUSTOMERS.complaints.phone.slice(5)}`,
        source: 'phone',
        category: 'service_quality',
        message: PHONE_MESSAGE,
        bookingRef: `#${reference(BOOKINGS.complaintDone)}`,
        receivedAt,
        loggedBy: 'Ravi',
      },
    })
    expect(logged.status()).toBe(201)
    const { data: complaint } = await logged.json()
    expect(complaint).toMatchObject({
      status: 'open',
      source: 'phone',
      loggedBy: 'Ravi',
      receivedAt,
      customer: { id: CUSTOMERS.complaints.id, name: CUSTOMERS.complaints.name, accountDeleted: false },
      booking: { id: BOOKINGS.complaintDone, reference: reference(BOOKINGS.complaintDone) },
      garage: { id: VENDORS.main.id, name: VENDORS.main.name },
    })
    expect(complaint.number).toMatch(/^C-\d{6}$/)
    // The clock runs from when it was received, not from when it was typed.
    expect(Date.parse(complaint.acknowledgeBy) - Date.parse(receivedAt)).toBe(24 * 60 * 60 * 1000)

    // A number with no account keeps the name typed, and needs one.
    const nameless = await admin.ctx.request.post(ADMIN_COMPLAINTS, {
      data: { phone: NO_ACCOUNT_PHONE, source: 'whatsapp', category: 'other', message: PHONE_MESSAGE, loggedBy: 'Ravi' },
    })
    expect(nameless.status()).toBe(400)
    expect((await nameless.json()).code).toBe('COMPLAINT_NAME_REQUIRED')
    const named = await admin.ctx.request.post(ADMIN_COMPLAINTS, {
      data: {
        phone: NO_ACCOUNT_PHONE,
        customerName: 'Walk-in Wasim',
        source: 'in_person',
        category: 'other',
        message: PHONE_MESSAGE,
        loggedBy: 'Ravi',
      },
    })
    expect(named.status()).toBe(201)
    expect((await named.json()).data.customer).toMatchObject({ id: null, name: 'Walk-in Wasim' })

    const acknowledged = await admin.ctx.request.post(`${ADMIN_COMPLAINTS}/${complaint.id}/acknowledge`)
    expect(acknowledged.status()).toBe(200)

    // The customer: in My complaints, said to be from their call, and in Updates.
    const customer = await openCustomer(browser)
    const mine = (await (await customer.ctx.request.get(COMPLAINTS)).json()).data as Array<{
      number: string
      source: string
      status: string
    }>
    expect(mine.find((c) => c.number === complaint.number)).toMatchObject({
      source: 'phone',
      status: 'acknowledged',
    })
    const updates = (await (await customer.ctx.request.get(UPDATES)).json()).data
    expect(updates.items).toContainEqual(
      expect.objectContaining({
        kind: 'complaint_acknowledged',
        title: `We're looking into complaint ${complaint.number}`,
        linkUrl: '/profile#my-complaints',
      })
    )

    // Only the team logs complaints this way.
    const refused = await customer.ctx.request.post(ADMIN_COMPLAINTS, {
      data: { phone: CUSTOMERS.complaints.phone, source: 'phone', category: 'other', message: PHONE_MESSAGE, loggedBy: 'Me' },
    })
    expect([401, 403]).toContain(refused.status())

    await customer.page.goto('/profile')
    const item = customer.page
      .getByRole('list', { name: 'My complaints, newest first' })
      .getByRole('listitem')
      .filter({ hasText: complaint.number })
    await expect(item.getByText('You told us by phone')).toBeVisible()

    await customer.ctx.close()
    await admin.ctx.close()
  })
})
