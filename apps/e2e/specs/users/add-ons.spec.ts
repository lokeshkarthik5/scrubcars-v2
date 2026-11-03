/**
 * Add-ons for the customer (0068): listed apart on the garage page, picked at
 * checkout, with the price and time updating, and marked on the booking and
 * its receipt. The server refuses add-ons alone on every path.
 *
 * ADD_ONS.customer drives a sedan; ADD_ONS.garage has one service, three live
 * add-ons and one switched off.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { ADD_ONS } from '../../support/seed-ids'

const A = ADD_ONS

test.use({ storageState: asRole('customer-add-ons') })

test.describe('add-ons at checkout @p0', () => {
  test('the garage page lists them under the services, with no Add button', async ({
    page,
  }) => {
    await page.goto(`/garage/${A.garage.id}`)
    const section = page.locator('[data-garage-add-ons]')
    await expect(
      section.getByRole('heading', { name: 'Add-ons' })
    ).toBeVisible()
    await expect(section.getByText(/^\d+ add-ons?$/)).toBeVisible()
    await expect(
      section.getByText("They can't be booked alone", { exact: false })
    ).toBeVisible()
    await expect(section.getByText(A.helmet.name)).toBeVisible()
    await expect(
      section.getByText('Add-on', { exact: true }).first()
    ).toBeVisible()
    await expect(section.getByText(A.retired.name)).toHaveCount(0)
    // Priced for the customer's sedan.
    await expect(section.getByText('₹999')).toBeVisible()
    await expect(section.getByRole('button')).toHaveCount(0)
    // Book Now only appears once a service is added.
    await expect(page.getByRole('button', { name: /^Book\b/ })).toHaveCount(0)
  })

  test('adding them updates the lines, time and total; the only service has no cross', async ({
    page,
  }) => {
    await page.goto(`/book/${A.garage.id}?service=${A.foam.id}`)
    const booking = page.getByRole('region', { name: 'Your booking' })
    await expect(booking.getByText('45 min')).toBeVisible()
    await expect(
      page.getByRole('button', { name: `Remove ${A.foam.name}` })
    ).toHaveCount(0)

    const addOns = page.locator('[data-checkout-add-ons]')
    await expect(
      addOns.getByText("Optional. They go with the services you've chosen.")
    ).toBeVisible()
    await addOns
      .getByRole('button', { name: `Add ${A.helmet.name} to booking` })
      .click()
    await addOns
      .getByRole('button', { name: `Add ${A.freshener.name} to booking` })
      .click()

    await expect(booking.getByText(A.helmet.name)).toBeVisible()
    await expect(booking.getByText('Add-on', { exact: true })).toHaveCount(2)
    // 45 + 10 + 0.
    await expect(booking.getByText('55 min')).toBeVisible()
    await expect(
      page.getByText(`${A.foam.name} + 2 add-ons`, { exact: false })
    ).toBeVisible()
    await expect(page.getByText('₹747').first()).toBeVisible()
    // Still no cross on the only service; an add-on's can come off.
    await expect(
      page.getByRole('button', { name: `Remove ${A.foam.name}` })
    ).toHaveCount(0)
    await booking
      .getByRole('button', { name: `Remove ${A.freshener.name}` })
      .click()
    await expect(booking.getByText(A.freshener.name)).toHaveCount(0)
    await expect(page.getByText('₹698').first()).toBeVisible()

    // Taking it back from the list does the same.
    await addOns
      .getByRole('button', { name: `Remove ${A.helmet.name} from booking` })
      .click()
    await expect(page.getByText('₹599').first()).toBeVisible()
  })

  test('the server refuses add-ons alone, and the old lists stay services', async ({
    page,
  }) => {
    const request = page.request
    const alone = await request.post(`${API}/api/v1/booking-intents`, {
      data: {
        vendorId: A.garage.id,
        serviceIds: [A.helmet.id],
        vehicleId: A.customer.vehicleId,
        bookingType: 'dropin',
        scheduledAt: new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000
        ).toISOString(),
      },
    })
    expect(alone.status()).toBe(400)
    expect(JSON.stringify(await alone.json())).toContain(
      'ADD_ONS_NEED_A_SERVICE'
    )

    const services = await (
      await request.get(`${API}/api/v1/vendors/${A.garage.id}/services`)
    ).json()
    expect(services.data.map((s: { id: string }) => s.id)).toEqual([A.foam.id])

    const addOns = await (
      await request.get(`${API}/api/v1/vendors/${A.garage.id}/add-ons`)
    ).json()
    const ids = addOns.data.map((a: { id: string }) => a.id)
    expect(ids).toContain(A.helmet.id)
    expect(ids).not.toContain(A.retired.id)
    expect(ids).not.toContain(A.foam.id)
  })

  test('the booking and its receipt mark each add-on, and the "from" price is the service', async ({
    page,
  }) => {
    await page.goto(`/bookings/${A.done}`)
    const details = page.getByRole('region', { name: 'Booking details' })
    await expect(details.getByText(A.helmet.name)).toBeVisible()
    await expect(details.getByText('Add-on', { exact: true })).toHaveCount(2)

    await page.goto(`/bookings/${A.done}/receipt`)
    await expect(page.getByText(`${A.helmet.name} · Add-on`)).toBeVisible()
    await expect(page.getByText(`${A.freshener.name} · Add-on`)).toBeVisible()

    const vendor = await (
      await page.request.get(
        `${API}/api/v1/vendors?q=${encodeURIComponent(A.garage.name)}`
      )
    ).json()
    const card = (vendor.data.items ?? vendor.data).find(
      (v: { id: string }) => v.id === A.garage.id
    )
    expect(Number(card.startingPrice)).toBe(599)
    expect(card.serviceTags).toEqual(['Car wash'])
  })
})
