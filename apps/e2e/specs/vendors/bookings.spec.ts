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
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

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
