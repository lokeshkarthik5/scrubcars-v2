/**
 * A garage's contact details reach a customer only through a booking (owner
 * decision, 17 Oct 2026): the public garage page carries none of them, and
 * the booking's own customer gets them on the booking. The shape itself is
 * unit-tested (apps/server/src/modules/vendors/vendors.public.test.ts); this
 * pins the two endpoints a browser reads. Even on the booking, the phone and
 * WhatsApp come only inside the contact window (owner decision, 18 Oct 2026;
 * contact-windows.spec.ts has both sides); the address always.
 *
 * Read-only: BOOKINGS.rescheduleExhausted (confirmed, at MAIN, tomorrow),
 * which booking-help.spec.ts reads too.
 */
import { request } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

const PRIVATE = ['phone', 'whatsapp', 'email', 'address', 'mapsUrl', 'notes', 'ownerId', 'pickupTermsAcceptedAt']

test.describe('garage contact stays private until booked @p0', () => {
  test('the public garage page has no phone, WhatsApp, email or street address', async () => {
    const guest = await request.newContext({ baseURL: API })
    const response = await guest.get(`/api/v1/vendors/${VENDORS.main.id}`)
    expect(response.status()).toBe(200)
    const garage = (await response.json()).data
    expect(garage).toMatchObject({ id: VENDORS.main.id, businessName: VENDORS.main.name, city: 'Chennai' })
    for (const key of PRIVATE) expect(garage).not.toHaveProperty(key)
    // MAIN's phone in the seed, under any name.
    expect(JSON.stringify(garage)).not.toContain('9000001001')
    await guest.dispose()
  })

  test("the booking's own customer gets the garage's address on the booking, its phone only near the time", async () => {
    const customer = await loginViaApi(CUSTOMERS.reschedule.phone)
    const response = await customer.get(`/api/v1/bookings/${BOOKINGS.rescheduleExhausted}`)
    expect(response.status()).toBe(200)
    const { vendor, contactWindow } = (await response.json()).data
    // Tomorrow: outside the contact window, so the address and maps link
    // without the phone or WhatsApp.
    expect(vendor).toMatchObject({ id: VENDORS.main.id, phone: null, whatsapp: null, address: expect.any(String) })
    expect(vendor).toHaveProperty('mapsUrl')
    expect(contactWindow).toMatchObject({ open: false })
    expect(JSON.stringify(vendor)).not.toContain('9000001001')
    await customer.dispose()

    // Anyone else's booking is a 404, contact and all.
    const stranger = await loginViaApi(CUSTOMERS.homeNew.phone)
    expect((await stranger.get(`/api/v1/bookings/${BOOKINGS.rescheduleExhausted}`)).status()).toBe(404)
    await stranger.dispose()
  })
})
