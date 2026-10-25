/**
 * Getting to the garage, and getting help, from a booking.
 *
 * Read-only throughout: it reads BOOKINGS.rescheduleExhausted — confirmed, at
 * the garage, at MAIN, tomorrow — which no spec moves or cancels, and
 * BOOKINGS.contactSoon (contact windows: confirmed at VENDORS.contact in an
 * hour), which no spec touches either.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS, CONTACT_GARAGE, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-reschedule') })

const BOOKING = `/bookings/${BOOKINGS.rescheduleExhausted}`
const REFERENCE = `#${BOOKINGS.rescheduleExhausted.slice(0, 8).toUpperCase()}`

test.describe('booking help @p0', () => {
  test('a day ahead, help says when the garage’s number shows and reaches the Detlio team', async ({
    page,
  }) => {
    await page.goto(BOOKING)
    await page.getByRole('button', { name: 'Help with this booking' }).click()

    const sheet = page.getByRole('dialog', { name: 'Help with this booking' })
    // Outside the contact window: no Call or WhatsApp for the garage, and the
    // sheet says when they come.
    await expect(sheet.getByText("The garage's number shows 2 hours before your booking.")).toBeVisible()
    await expect(sheet.getByRole('link', { name: `Call ${VENDORS.main.name}` })).toHaveCount(0)
    await expect(sheet.getByRole('link', { name: `WhatsApp ${VENDORS.main.name}` })).toHaveCount(0)

    // The team's chat opens with the booking already named, so nobody has to
    // ask which one.
    const href = await sheet.getByRole('link', { name: 'WhatsApp Detlio support' }).getAttribute('href')
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/)
    const message = new URL(href!).searchParams.get('text')
    expect(message).toContain(REFERENCE)
    expect(message).toContain(VENDORS.main.name)
    await expect(sheet.getByRole('link', { name: 'Call Detlio support' })).toBeVisible()

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

test.describe('booking help inside the contact window @p0', () => {
  test.use({ storageState: asRole('customer-contact') })

  test('an hour before, help reaches the garage by phone and WhatsApp', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.contactSoon}`)
    await page.getByRole('button', { name: 'Help with this booking' }).click()

    const sheet = page.getByRole('dialog', { name: 'Help with this booking' })
    await expect(sheet.getByRole('link', { name: `Call ${VENDORS.contact.name}` })).toHaveAttribute(
      'href',
      `tel:+91${CONTACT_GARAGE.phone}`
    )
    // Its WhatsApp number, not its phone, with the booking named.
    const whatsApp = await sheet.getByRole('link', { name: `WhatsApp ${VENDORS.contact.name}` }).getAttribute('href')
    expect(whatsApp).toMatch(new RegExp(`^https://wa\\.me/91${CONTACT_GARAGE.whatsapp}\\?text=`))
    expect(new URL(whatsApp!).searchParams.get('text')).toContain(
      `#${BOOKINGS.contactSoon.slice(0, 8).toUpperCase()}`
    )
    await expect(sheet.getByText(/number shows 2 hours before/)).toHaveCount(0)
  })

  test('three hours after the job, the garage’s number is hidden again', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.contactDone}`)
    await page.getByRole('button', { name: 'Help with this booking' }).click()

    const sheet = page.getByRole('dialog', { name: 'Help with this booking' })
    await expect(sheet.getByText("The garage's number is hidden after your booking.")).toBeVisible()
    await expect(sheet.getByRole('link', { name: `Call ${VENDORS.contact.name}` })).toHaveCount(0)
    await expect(sheet.getByRole('link', { name: 'WhatsApp Detlio support' })).toBeVisible()
  })
})
