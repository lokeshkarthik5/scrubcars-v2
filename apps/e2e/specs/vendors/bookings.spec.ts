/**
 * The vendor side of a booking's life.
 *
 * Status is asserted against the database rather than the list, because the
 * list is a poll: reading it straight after a click tests the poll interval,
 * not the transition.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { getBooking } from '../../support/db'
import { BOOKINGS, CUSTOMERS, DOORSTEP_JOB_PIN, VENDORS } from '../../support/seed-ids'

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
    // The customer's number is on the card, so the garage can call before
    // deciding — it used to reach the portal and never be shown.
    await expect(
      page.getByRole('link', { name: `Call ${CUSTOMERS.vendorJob.name}` })
    ).toHaveAttribute('href', `tel:+91${CUSTOMERS.vendorJob.phone}`)
    await accept.click()
    await expect.poll(statusOf(BOOKINGS.vendorIncoming)).toBe('confirmed')

    // Accepting moves it to Upcoming, where the work transitions live.
    await tab(page, 'Upcoming').click()
    await page
      .getByRole('button', { name: `Mark booking for ${CUSTOMERS.vendorJob.name} in progress` })
      .click()
    await expect.poll(statusOf(BOOKINGS.vendorIncoming)).toBe('in_progress')

    await page
      .getByRole('button', { name: `Mark booking for ${CUSTOMERS.vendorJob.name} completed` })
      .click()
    await expect.poll(statusOf(BOOKINGS.vendorIncoming)).toBe('completed')

    // Once the job is done the customer's number comes off the card.
    await tab(page, 'Completed').click()
    await expect(page.getByText(CUSTOMERS.vendorJob.name).first()).toBeVisible()
    await expect(page.getByRole('link', { name: `Call ${CUSTOMERS.vendorJob.name}` })).toHaveCount(0)
  })

  test('a doorstep job shows where to go and how to reach the customer', async ({ page }) => {
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

    const whatsApp = await page
      .getByRole('link', { name: `WhatsApp ${CUSTOMERS.vendorDoorstep.name}` })
      .getAttribute('href')
    expect(whatsApp).toMatch(new RegExp(`^https://wa\\.me/91${CUSTOMERS.vendorDoorstep.phone}\\?text=`))
    // Opens saying who is writing: the customer has never seen this number.
    expect(new URL(whatsApp!).searchParams.get('text')).toContain(VENDORS.main.name)
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
