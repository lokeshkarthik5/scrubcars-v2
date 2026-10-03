/**
 * Getting to the garage, and getting help, from a booking.
 *
 * Read-only throughout: it reads BOOKINGS.rescheduleExhausted — confirmed, at
 * the garage, at MAIN — which no spec moves or cancels.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-reschedule') })

test.describe('booking help @p0', () => {
  test('help reaches the garage and the Detlio team, quoting the booking', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.rescheduleExhausted}`)
    await page.getByRole('button', { name: 'Help with this booking' }).click()

    const sheet = page.getByRole('dialog', { name: 'Help with this booking' })
    // MAIN's phone in the seed.
    await expect(sheet.getByRole('link', { name: `Call ${VENDORS.main.name}` })).toHaveAttribute(
      'href',
      'tel:+919000001001'
    )
    // The team's chat opens with the booking number already typed.
    const reference = BOOKINGS.rescheduleExhausted.slice(0, 8).toUpperCase()
    await expect(sheet.getByRole('link', { name: 'WhatsApp Detlio support' })).toHaveAttribute(
      'href',
      new RegExp(`^https://wa\\.me/\\d+\\?text=.*${reference}`)
    )
  })

  test('directions show how far the garage is and hand off to Google Maps', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 13.05, longitude: 80.25 })

    await page.goto(`/bookings/${BOOKINGS.rescheduleExhausted}`)
    await page.getByRole('button', { name: 'Directions' }).click()

    const sheet = page.getByRole('dialog', { name: 'Directions' })
    await expect(sheet.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute(
      'href',
      /^https:\/\/www\.google\.com\/maps\/dir\/\?.*destination=13\.08/
    )
    // A drive time when routing answers; CI has no routing key, so there it is
    // the straight-line distance. Either way, never "Finding your location…".
    await expect(sheet.getByText(/drive · .* from you|away in a straight line/)).toBeVisible()
  })
})
