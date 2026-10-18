/**
 * The vendor side of a booking's life.
 *
 * Status is asserted against the database rather than the list, because the
 * list is a poll: reading it straight after a click tests the poll interval,
 * not the transition.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, setActiveVendor } from '../../support/auth'
import { getBooking } from '../../support/db'
import {
  BOOKINGS,
  CONTACT_DOORSTEP,
  CUSTOMERS,
  DOORSTEP_JOB_PIN,
  VENDORS,
} from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-owner') })

test.beforeEach(async ({ context }) => {
  // The owner has two garages; without pinning the tenant the app picks one
  // and every assertion below becomes a coin flip.
  await setActiveVendor(context, VENDORS.main.id)
})

const tab = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('radio', { name: new RegExp(`^${name}`) })

const statusOf = (id: string) => async () => (await getBooking(id))?.status

test.describe('vendor booking lifecycle @p0', () => {
  test('a new booking is accepted and worked through to completion', async ({ page }) => {
    await page.goto('/bookings')

    // Identified by customer, not by count: the journey spec books against this
    // same garage, so an absolute "Incoming (2)" would couple the two files.
    const accept = page.getByRole('button', {
      name: `Accept booking for ${CUSTOMERS.vendorJob.name}`,
    })
    await expect(accept).toBeVisible()
    // Tomorrow is outside the contact window: the card names the customer
    // and says when their number shows, with Detlio support in between.
    const card = page.locator(`#job-${BOOKINGS.vendorIncoming}`)
    await expect(card.getByText(CUSTOMERS.vendorJob.name).first()).toBeVisible()
    await expect(card.getByText("Customer's number shows 2 hours before the job.")).toBeVisible()
    await expect(card.getByRole('link', { name: `Call ${CUSTOMERS.vendorJob.name}` })).toHaveCount(0)
    const support = await card
      .getByRole('link', { name: /Need to reach the customer\? Contact Detlio support/ })
      .getAttribute('href')
    expect(new URL(support!).searchParams.get('text')).toContain(
      `#${BOOKINGS.vendorIncoming.slice(0, 8).toUpperCase()}`
    )
    await accept.click()
    await expect.poll(statusOf(BOOKINGS.vendorIncoming)).toBe('confirmed')

    // Accepting moves it to Upcoming, where the work transitions live.
    await tab(page, 'Upcoming').click()
    await page
      .getByRole('button', { name: `Mark booking for ${CUSTOMERS.vendorJob.name} in progress` })
      .click()
    await expect.poll(statusOf(BOOKINGS.vendorIncoming)).toBe('in_progress')
    // A job under way is always inside the window, early or not.
    await expect(
      page.getByRole('link', { name: `Call ${CUSTOMERS.vendorJob.name}` })
    ).toHaveAttribute('href', `tel:+91${CUSTOMERS.vendorJob.phone}`)

    await page
      .getByRole('button', { name: `Mark booking for ${CUSTOMERS.vendorJob.name} completed` })
      .click()
    await expect.poll(statusOf(BOOKINGS.vendorIncoming)).toBe('completed')

    // For an hour after the job the number stays (a forgotten key, a
    // question about the work); after that it comes off the card (see the
    // contact-window tests below).
    await tab(page, 'Completed').click()
    await expect(page.getByText(CUSTOMERS.vendorJob.name).first()).toBeVisible()
    await expect(page.getByRole('link', { name: `Call ${CUSTOMERS.vendorJob.name}` })).toBeVisible()
  })

  test('a doorstep job shows where to go, and when the customer can be reached', async ({ page }) => {
    await page.goto('/bookings')

    // Seeded pending and never touched, so it is always under Incoming.
    await expect(page.getByText('7, Lake View Road, Adyar')).toBeVisible()
    // To the customer's pin — deliberately not MAIN's own, so routing to the
    // garage by mistake would fail here.
    const { lat, lng } = DOORSTEP_JOB_PIN
    await expect(
      page.getByRole('link', { name: `Open in Maps for ${CUSTOMERS.vendorDoorstep.name}` })
    ).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${lat.toFixed(6)},${lng.toFixed(6)}`
    )

    // Tomorrow: outside the contact window, so no WhatsApp yet; the route
    // can be planned now and the customer called from 2 hours before.
    const card = page.locator(`#job-${BOOKINGS.vendorDoorstep}`)
    await expect(card.getByText("Customer's number shows 2 hours before the job.")).toBeVisible()
    await expect(
      page.getByRole('link', { name: `WhatsApp ${CUSTOMERS.vendorDoorstep.name}` })
    ).toHaveCount(0)
  })

  test('a job whose time passed unaccepted can only be declined', async ({ page }) => {
    await page.goto('/bookings')

    // Seeded pending at MAIN an hour ago: Accept is gone, and the card says why.
    await expect(page.getByText(/time has passed without being accepted/i).first()).toBeVisible()
    await expect(
      page.getByRole('button', { name: `Accept booking for ${CUSTOMERS.vendorLate.name}` })
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: `Reject booking for ${CUSTOMERS.vendorLate.name}` })
    ).toBeVisible()

    // The server refuses a late accept on its own.
    const response = await page.request.patch(
      `${API}/api/v1/bookings/${BOOKINGS.vendorStarted}/accept`,
      { headers: { 'x-vendor-id': VENDORS.main.id } }
    )
    expect(response.status()).toBe(400)
    expect((await response.json()).code).toBe('BOOKING_START_PASSED')
    expect((await getBooking(BOOKINGS.vendorStarted))?.status).toBe('pending')
  })

  test('rejecting takes a reason and is recorded as a vendor cancellation', async ({ page }) => {
    await page.goto('/bookings')

    await page
      .getByRole('button', { name: `Reject booking for ${CUSTOMERS.vendorReject.name}` })
      .click()

    // Reject is behind an inline confirm; "Keep" backs out of it.
    await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible()
    await page.getByPlaceholder('Reason for rejecting (optional)').fill('Bay flooded')
    await page.getByRole('button', { name: 'Confirm reject' }).click()

    await expect.poll(statusOf(BOOKINGS.vendorRejectable)).toBe('cancelled')

    const booking = await getBooking(BOOKINGS.vendorRejectable)
    // 'vendor', not 'user' — the customer's page renders the two differently.
    expect(booking?.cancelled_by).toBe('vendor')
    expect(booking?.cancellation_reason).toBe('Bay flooded')

    // A refused job keeps no way to reach the customer.
    await tab(page, 'Cancelled').click()
    await expect(page.getByText(CUSTOMERS.vendorReject.name).first()).toBeVisible()
    await expect(page.getByRole('link', { name: `Call ${CUSTOMERS.vendorReject.name}` })).toHaveCount(0)
  })

  test('a confirmed booking cannot be rejected, only worked or cancelled', async ({ page }) => {
    await page.goto('/bookings')
    await tab(page, 'Upcoming').click()

    // Reject belongs to the Incoming tab: once accepted, the vendor has
    // committed and the exit is a cancellation, not a refusal.
    await expect(page.getByRole('button', { name: /^Reject booking/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Mark booking/ }).first()).toBeVisible()
  })
})

/**
 * Contact windows at VENDORS.contact (its own owner, CUSTOMERS.contact's four
 * jobs, ids 3400–3499; read-only). Inside the window the card calls and
 * WhatsApps the customer; outside it, it says why not and offers Detlio
 * support with the booking named.
 */
test.describe('job card contact windows @p0', () => {
  test.use({ storageState: asRole('vendor-contact') })
  test.beforeEach(async ({ context }) => {
    await setActiveVendor(context, VENDORS.contact.id)
  })

  test('an hour before: Call and WhatsApp the customer', async ({ page }) => {
    await page.goto('/bookings')
    await tab(page, 'Upcoming').click()
    const card = page.locator(`#job-${BOOKINGS.contactSoon}`)
    await expect(card.getByRole('link', { name: `Call ${CUSTOMERS.contact.name}` })).toHaveAttribute(
      'href',
      `tel:+91${CUSTOMERS.contact.phone}`
    )
    const whatsApp = await card.getByRole('link', { name: `WhatsApp ${CUSTOMERS.contact.name}` }).getAttribute('href')
    expect(whatsApp).toMatch(new RegExp(`^https://wa\\.me/91${CUSTOMERS.contact.phone}\\?text=`))
    // Opens saying who is writing.
    expect(new URL(whatsApp!).searchParams.get('text')).toContain(VENDORS.contact.name)
  })

  test('two days ahead: the name, no number, and Detlio support', async ({ page }) => {
    await page.goto('/bookings')
    await tab(page, 'Upcoming').click()
    const card = page.locator(`#job-${BOOKINGS.contactLater}`)
    await expect(card.getByText(CUSTOMERS.contact.name).first()).toBeVisible()
    await expect(card.getByText("Customer's number shows 2 hours before the job.")).toBeVisible()
    await expect(card.getByRole('link', { name: `Call ${CUSTOMERS.contact.name}` })).toHaveCount(0)
    const support = await card
      .getByRole('link', { name: /Need to reach the customer\? Contact Detlio support/ })
      .getAttribute('href')
    expect(support).toMatch(/^https:\/\/wa\.me\/\d+\?text=/)
    expect(new URL(support!).searchParams.get('text')).toContain(
      `#${BOOKINGS.contactLater.slice(0, 8).toUpperCase()}`
    )
  })

  test('a doorstep job tomorrow: the address and Maps now, the number later', async ({ page }) => {
    await page.goto('/bookings')
    const card = page.locator(`#job-${BOOKINGS.contactDoorstep}`)
    await expect(card.getByText(CONTACT_DOORSTEP.address)).toBeVisible()
    await expect(card.getByRole('link', { name: `Open in Maps for ${CUSTOMERS.contact.name}` })).toBeVisible()
    await expect(card.getByText("Customer's number shows 2 hours before the job.")).toBeVisible()
    await expect(card.getByRole('link', { name: `WhatsApp ${CUSTOMERS.contact.name}` })).toHaveCount(0)
  })

  test('three hours after the job: hidden again', async ({ page }) => {
    await page.goto('/bookings')
    await tab(page, 'Completed').click()
    const card = page.locator(`#job-${BOOKINGS.contactDone}`)
    await expect(card.getByText("Customer's number is hidden after the job.")).toBeVisible()
    await expect(card.getByRole('link', { name: `Call ${CUSTOMERS.contact.name}` })).toHaveCount(0)
  })
})
