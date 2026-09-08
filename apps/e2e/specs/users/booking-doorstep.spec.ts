/**
 * Doorstep checkout.
 *
 * This path had never run. `createBookingTypeSchema` was `z.literal('dropin')`,
 * so the server rejected every doorstep request with a 400 — while the booking
 * page still rendered a Doorstep toggle for any garage offering both modes.
 * The page object even carried a `bookingType('Doorstep')` helper that nothing
 * called.
 *
 * What makes doorstep different from drop-in is that it has somewhere to go:
 * the booking carries an address snapshot and coordinates, and the garage has
 * to actually travel there. Both are asserted on the written row, because the
 * snapshot is what protects the booking from a later profile edit.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { bookingsForUser, countBookingsForUser, sql } from '../../support/db'
import { ADDRESSES, CUSTOMERS, ORIGIN, SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-doorstep') })

test.describe('doorstep booking', () => {
  test('books to the default address and snapshots it @p0', async ({ page }) => {
    const before = await countBookingsForUser(CUSTOMERS.doorstep.id)

    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])

    // MAIN runs both modes, so the toggle renders. A garage with one mode
    // hides it entirely.
    await checkout.bookingType('Doorstep').click()
    await expect(checkout.bookingType('Doorstep')).toHaveAttribute('aria-pressed', 'true')

    await checkout.pickTomorrowSlot()

    // The customer owns one car, so checkout selects it without being asked.
    // The address step is what doorstep adds.
    await expect(checkout.addressStep()).toBeVisible()

    // The default address is preselected — the customer already said "this is
    // where I am" in their profile, so re-asking adds a step, not a decision.
    await expect(checkout.cta()).toHaveText('Pay Now (₹499)')
    await checkout.pay()

    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)
    expect(await countBookingsForUser(CUSTOMERS.doorstep.id)).toBe(before + 1)

    const [created] = await bookingsForUser(CUSTOMERS.doorstep.id)
    expect(created.booking_type).toBe('doorstep')
    // Snapshotted, not referenced: editing or deleting the saved address later
    // must not change where the garage was told to go.
    expect(created.address).toBe('14, Gandhi Nagar, Adyar')
    expect(Number(created.lat)).toBeCloseTo(ORIGIN.lat, 3)
    expect(Number(created.lng)).toBeCloseTo(ORIGIN.lng, 3)
  })

  test('an address with no pin blocks payment until one is dropped', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
    await checkout.bookingType('Doorstep').click()
    await checkout.pickTomorrowSlot()

    // Saved from the profile without coordinates — legitimate, and normal:
    // only doorstep needs them. The server would refuse this booking with
    // ADDRESS_LOCATION_REQUIRED, so the page has to ask first.
    await checkout.pickAddress(/Office/)
    await expect(checkout.pinPrompt()).toBeVisible()

    // The bottom bar is always on screen, so the CTA cannot simply vanish —
    // it has to be disabled *and* say why. An enabled button that silently
    // does nothing is the one outcome worse than no button at all.
    await expect(checkout.cta()).toHaveText('Pin your address on the map')
    await expect(checkout.cta()).toBeDisabled()

    // Asked here rather than back in the profile, because leaving the page
    // would discard the slot and any applied code.
    await checkout.useCurrentLocation()

    await expect(checkout.pinPrompt()).toBeHidden()
    await expect(checkout.cta()).toHaveText('Pay Now (₹499)')

    // The pin is saved onto the address, not just held in the page.
    const [row] = await sql<{ lat: number | null; geo_source: string }[]>`
      select lat, geo_source from user_addresses where id = ${ADDRESSES.doorstepUnpinned}
    `
    expect(row.lat).not.toBeNull()
    expect(row.geo_source).toBe('gps')
  })

  test('drop-in never asks for an address', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])

    // The default mode. The customer comes to the garage, so there is nowhere
    // to travel to and nothing to ask.
    await expect(checkout.bookingType('Drop In')).toHaveAttribute('aria-pressed', 'true')
    await checkout.pickTomorrowSlot()

    await expect(checkout.addressStep()).toBeHidden()
    await expect(checkout.cta()).toHaveText('Pay Now (₹499)')
  })
})
