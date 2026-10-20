/**
 * A complaint, from the customer's booking to the admin Complaints tab.
 *
 * CUSTOMERS.complaints raises one about BOOKINGS.complaintDone (a finished
 * job at MAIN) from the booking's Help sheet, sees its number at once and in
 * Profile → My complaints, and ops finds it under Open with the booking and
 * garage attached. The customer is also refused a complaint about someone
 * else's booking. The clock and number rules are unit-tested in
 * packages/core/src/complaints.test.ts and apps/server/src/lib/complaints.test.ts.
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
})
