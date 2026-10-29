/**
 * The garage calls off a job it accepted, and takes back a tap (0066):
 *
 *   - Cancel booking on an accepted job not yet started: a reason is
 *     required; more than 24 hours before the slot it counts like a decline,
 *     within them as a missed booking; the customer is refunded and told.
 *   - Accept, Picked up, At garage and Out for delivery wait five seconds
 *     behind an Undo, like Start and Complete.
 *
 * PREIOS.garage and its owner (signed in fresh, by this file only); each
 * test acts on its own booking of PREIOS.customer's.
 */
import type { BrowserContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi, setActiveVendor } from '../../support/auth'
import { getBooking, sql } from '../../support/db'
import { PREIOS } from '../../support/seed-ids'

const WHO = PREIOS.customer.name
const AFTER_UNDO = { timeout: 15_000 }

async function signInAsOwner(context: BrowserContext) {
  const api = await loginViaApi(PREIOS.owner.phone, 'vendor')
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
  await setActiveVendor(context, PREIOS.garage.id)
}

const garageCancel = async (id: string) =>
  (
    await sql<{ status: string; cancelled_by: string | null; reason: string | null; stamped: boolean }[]>`
      select status, cancelled_by, cancellation_reason as reason, garage_cancelled_at is not null as stamped
        from bookings where id = ${id}
    `
  )[0]

test.describe('garage cancels an accepted booking', () => {
  test('three days out: a reason is required, it counts like a decline, and the customer is refunded and told', async ({
    page,
    context,
  }) => {
    await signInAsOwner(context)
    await page.goto(`/bookings/${PREIOS.cancelEarly}`)
    await page.getByRole('button', { name: `Cancel booking for ${WHO}` }).click()

    const sheet = page.getByRole('dialog', { name: 'Cancel this booking?' })
    await expect(sheet).toContainText(`${WHO} gets a full refund`)
    await expect(sheet).toContainText("it counts like a booking you couldn't take")
    // No reason: said in the sheet, nothing sent.
    await sheet.getByRole('button', { name: 'Cancel booking' }).click()
    await expect(sheet.getByRole('alert')).toHaveText('Say why you are cancelling, so Detlio can help the customer.')
    expect((await garageCancel(PREIOS.cancelEarly))?.status).toBe('confirmed')

    await sheet.getByLabel('Why are you cancelling?').fill('Our pressure washer broke down')
    await sheet.getByRole('button', { name: 'Cancel booking' }).click()
    await expect(page.getByText('Booking cancelled', { exact: true })).toBeVisible()
    await expect(page.getByText('Cancelled by you after accepting', { exact: true })).toBeVisible()
    await expect(page.getByText('Our pressure washer broke down')).toBeVisible()

    expect(await garageCancel(PREIOS.cancelEarly)).toEqual({
      status: 'cancelled',
      cancelled_by: 'vendor',
      reason: 'Our pressure washer broke down',
      stamped: true,
    })

    // The booking says the garage cancelled it, early (the customer's page
    // reads the same field: specs/users/withdraw-and-leave.spec.ts).
    const read = await page.request.get(`${API}/api/v1/bookings/${PREIOS.cancelEarly}`, {
      headers: { 'x-vendor-id': PREIOS.garage.id },
    })
    expect((await read.json()).data.garageCancelled).toEqual({ at: expect.any(String), late: false })
  })

  test('within 24 hours of the slot: warned first, then counted as a missed booking', async ({ page, context }) => {
    await signInAsOwner(context)
    await page.goto(`/bookings/${PREIOS.cancelLate}`)
    await page.getByRole('button', { name: `Cancel booking for ${WHO}` }).click()

    const sheet = page.getByRole('dialog', { name: 'Cancel this booking?' })
    await expect(sheet).toContainText('so it counts as a missed booking for your medal')
    await sheet.getByLabel('Why are you cancelling?').fill('Short of staff today')
    await sheet.getByRole('button', { name: 'Cancel booking' }).click()

    await expect(
      page.getByText('Cancelled by you after accepting · counted as a missed booking', { exact: true })
    ).toBeVisible()
    expect((await garageCancel(PREIOS.cancelLate))?.stamped).toBe(true)

    // The server says so too, and a second cancel is refused.
    const again = await page.request.patch(`${API}/api/v1/bookings/${PREIOS.cancelLate}/garage-cancel`, {
      data: { reason: 'Again' },
      headers: { 'x-vendor-id': PREIOS.garage.id },
    })
    expect(again.status()).toBe(400)
    expect((await again.json()).code).toBe('INVALID_BOOKING_STATUS')
  })
})

test.describe('five seconds of Undo on Accept and the pickup steps', () => {
  test('Accept: Undo keeps it waiting; pressed again, it goes after five seconds', async ({ page, context }) => {
    await signInAsOwner(context)
    await page.goto(`/bookings/${PREIOS.accept}`)

    const accept = page.getByRole('button', { name: `Accept booking for ${WHO}` })
    await accept.click()
    await expect(page.getByText('Accepting the booking…')).toBeVisible()
    await expect(page.getByText('Booking accepted', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()

    // Back to the buttons, and nothing reached the server.
    await expect(accept).toBeVisible()
    await page.waitForTimeout(6_000)
    expect((await getBooking(PREIOS.accept))?.status).toBe('pending')

    await accept.click()
    await expect.poll(async () => (await getBooking(PREIOS.accept))?.status, AFTER_UNDO).toBe('confirmed')
  })

  test('Picked up (with the code) and At garage, each behind its Undo', async ({ page, context }) => {
    await signInAsOwner(context)
    await page.goto(`/bookings/${PREIOS.pickupFresh}`)
    const pickedUp = async () =>
      (await sql<{ at: Date | null }[]>`select picked_up_at as at from bookings where id = ${PREIOS.pickupFresh}`)[0]?.at

    await page.getByLabel("Customer's pickup code").fill(PREIOS.pickupCode)
    await page.getByRole('button', { name: `Mark Picked up for ${WHO}` }).click()
    await expect(page.getByText('Marking picked up…')).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await page.waitForTimeout(6_000)
    expect(await pickedUp()).toBeNull()

    // The code was cleared with the Undo: typed again, then it goes.
    await page.getByLabel("Customer's pickup code").fill(PREIOS.pickupCode)
    await page.getByRole('button', { name: `Mark Picked up for ${WHO}` }).click()
    await expect.poll(pickedUp, AFTER_UNDO).not.toBeNull()

    const atGarage = page.getByRole('button', { name: `Mark At garage for ${WHO}` })
    await expect(atGarage).toBeVisible(AFTER_UNDO)
    await atGarage.click()
    await expect(page.getByText('Marking at garage…')).toBeVisible()
    await expect
      .poll(
        async () =>
          (await sql<{ at: Date | null }[]>`select at_garage_at as at from bookings where id = ${PREIOS.pickupFresh}`)[0]?.at,
        AFTER_UNDO
      )
      .not.toBeNull()
  })

  test('Out for delivery waits behind its Undo, then goes', async ({ page, context }) => {
    await signInAsOwner(context)
    await page.goto(`/bookings/${PREIOS.pickupOut}`)
    await page.getByRole('button', { name: `Mark Out for delivery for ${WHO}` }).click()
    await expect(page.getByText('Marking out for delivery…')).toBeVisible()
    await expect(page.getByText('Out for delivery', { exact: true }).first()).toBeVisible()
    await expect
      .poll(
        async () =>
          (await sql<{ at: Date | null }[]>`select out_for_delivery_at as at from bookings where id = ${PREIOS.pickupOut}`)[0]
            ?.at,
        AFTER_UNDO
      )
      .not.toBeNull()
  })
})
