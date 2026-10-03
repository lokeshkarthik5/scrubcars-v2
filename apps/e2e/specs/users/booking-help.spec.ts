/**
 * Getting to the garage, and getting help, from a booking.
 *
 * Read-only throughout: it reads BOOKINGS.rescheduleExhausted — confirmed, at
 * the garage, at MAIN — which no spec moves or cancels.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-reschedule') })

const BOOKING = `/bookings/${BOOKINGS.rescheduleExhausted}`
const REFERENCE = `#${BOOKINGS.rescheduleExhausted.slice(0, 8).toUpperCase()}`

test.describe('booking help @p0', () => {
  test('help reaches the garage and the Detlio team, quoting the booking', async ({ page }) => {
    await page.goto(BOOKING)
    await page.getByRole('button', { name: 'Help with this booking' }).click()

    const sheet = page.getByRole('dialog', { name: 'Help with this booking' })
    // MAIN's phone in the seed.
    await expect(sheet.getByRole('link', { name: `Call ${VENDORS.main.name}` })).toHaveAttribute(
      'href',
      'tel:+919000001001'
    )

    // The team's chat opens with the booking already named, so nobody has to
    // ask which one.
    const href = await sheet.getByRole('link', { name: 'WhatsApp Detlio support' }).getAttribute('href')
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/)
    const message = new URL(href!).searchParams.get('text')
    expect(message).toContain(REFERENCE)
    expect(message).toContain(VENDORS.main.name)

    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect(sheet).toHaveCount(0)
  })

  test('directions show how far the garage is and hand off to Google Maps', async ({
    page,
    context,
  }) => {
    // A location the customer chose for browsing. Registered after the
    // fixture's own init script, so it is the one that stands.
    await context.addInitScript(() => {
      window.localStorage.setItem(
        'detlio-location',
        JSON.stringify({
          state: {
            location: {
              lat: 13.0418,
              lng: 80.2341,
              label: 'Home',
              source: 'address',
              updatedAt: Date.now(),
            },
            promptDismissedAt: Date.now(),
          },
          version: 0,
        })
      )
    })
    await context.setGeolocation({ latitude: 13.05, longitude: 80.25 })

    await page.goto(BOOKING)
    await page.getByRole('button', { name: 'Directions' }).click()

    const sheet = page.getByRole('dialog', { name: 'Directions' })
    await expect(sheet.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute(
      'href',
      /^https:\/\/www\.google\.com\/maps\/dir\/\?.*destination=13\.08/
    )
    // A drive time when routing answers; CI has no routing key, so there it is
    // the straight-line distance. Either way, never "Finding your location…".
    await expect(sheet.getByText(/drive · .* from you|away in a straight line/)).toBeVisible()

    // Reading where the customer stands must not replace the location home
    // sorts by.
    const stored = await page.evaluate(() => window.localStorage.getItem('detlio-location'))
    expect(JSON.parse(stored!).state.location).toMatchObject({ source: 'address', label: 'Home' })
  })

  test('with location off, directions say why there is no drive time', async ({ page, context }) => {
    await context.clearPermissions()

    await page.goto(BOOKING)
    await page.getByRole('button', { name: 'Directions' }).click()

    const sheet = page.getByRole('dialog', { name: 'Directions' })
    await expect(sheet.getByText('Allow location access to see how long the drive is.')).toBeVisible()
    // Google Maps still works without it.
    await expect(sheet.getByRole('link', { name: 'Open in Google Maps' })).toBeVisible()
  })
})
