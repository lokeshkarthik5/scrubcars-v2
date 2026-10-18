/**
 * Contact windows (owner decision, 18 Oct 2026): the customer and the garage
 * see each other's phone number only from 2 hours before the job until an
 * hour after it is done. Enforced on the server, so these read the API the
 * apps read; the rule itself is unit-tested (apps/server/src/lib/
 * contact-window.test.ts), the screens in booking-help.spec.ts and
 * vendors/bookings.spec.ts.
 *
 * Read-only: CUSTOMERS.contact's four bookings at VENDORS.contact (ids
 * 3400–3499), which no spec moves or cancels.
 */
import { request } from '@playwright/test'
import { test, expect, statePath } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { BOOKINGS, CONTACT_GARAGE, CUSTOMERS, STAFF, VENDORS } from '../../support/seed-ids'

const INSIDE = [BOOKINGS.contactSoon]
const OUTSIDE = [BOOKINGS.contactLater, BOOKINGS.contactDone, BOOKINGS.contactDoorstep]

test.describe('contact windows @p0', () => {
  test("the customer's booking carries the garage's phone and WhatsApp only inside the window", async () => {
    const customer = await loginViaApi(CUSTOMERS.contact.phone)

    for (const id of INSIDE) {
      const { vendor, contactWindow } = (await (await customer.get(`/api/v1/bookings/${id}`)).json()).data
      expect(contactWindow).toMatchObject({ open: true })
      expect(vendor).toMatchObject({ phone: CONTACT_GARAGE.phone, whatsapp: CONTACT_GARAGE.whatsapp })
    }

    for (const id of OUTSIDE) {
      const response = await customer.get(`/api/v1/bookings/${id}`)
      expect(response.status()).toBe(200)
      const { vendor, contactWindow } = (await response.json()).data
      expect(contactWindow).toMatchObject({ open: false, opensAt: expect.any(String) })
      // The address and maps link stay: the customer plans the trip from them.
      expect(vendor).toMatchObject({ phone: null, whatsapp: null, address: '3, Window Street, Adyar' })
      const raw = JSON.stringify(vendor)
      expect(raw).not.toContain(CONTACT_GARAGE.phone)
      expect(raw).not.toContain(CONTACT_GARAGE.whatsapp)
    }

    // My bookings is the same shape: no number outside the window there either.
    const list = (await (await customer.get('/api/v1/bookings/me')).json()).data as Array<{
      id: string
      vendor: { phone: string | null }
    }>
    const later = list.find((b) => b.id === BOOKINGS.contactLater)
    expect(later?.vendor.phone).toBeNull()
    await customer.dispose()
  })

  test("the garage's booking carries the customer's name always, the phone only inside the window", async () => {
    const garage = await loginViaApi(STAFF.contactOwner.phone, 'vendor')
    const headers = { 'x-vendor-id': VENDORS.contact.id }

    const soon = (await (await garage.get(`/api/v1/bookings/${BOOKINGS.contactSoon}`, { headers })).json()).data
    expect(soon.user).toMatchObject({ name: CUSTOMERS.contact.name, phone: CUSTOMERS.contact.phone })

    const response = await garage.get('/api/v1/bookings/vendor', { headers })
    expect(response.status()).toBe(200)
    const jobs = (await response.json()).data as Array<{
      id: string
      address: string | null
      user: { name: string; phone: string | null }
      contactWindow: { open: boolean }
    }>
    for (const id of OUTSIDE) {
      const job = jobs.find((b) => b.id === id)
      expect(job?.contactWindow.open).toBe(false)
      expect(job?.user).toMatchObject({ name: CUSTOMERS.contact.name, phone: null })
    }
    // A doorstep job's address stays on the garage's card: it plans the route.
    expect(jobs.find((b) => b.id === BOOKINGS.contactDoorstep)?.address).toBe('14, Window Lane, Besant Nagar')
    const outside = JSON.stringify(jobs.filter((b) => OUTSIDE.includes(b.id)))
    expect(outside).not.toContain(CUSTOMERS.contact.phone)
    await garage.dispose()
  })

  test('admin always sees both numbers', async () => {
    const admin = await request.newContext({ baseURL: API, storageState: statePath('admin') })
    const response = await admin.get(`/api/v1/admin/bookings/${BOOKINGS.contactLater}`)
    expect(response.status()).toBe(200)
    const { data } = await response.json()
    expect(data.garage).toMatchObject({ phone: CONTACT_GARAGE.phone })
    expect(data.customer).toMatchObject({ phone: CUSTOMERS.contact.phone })
    await admin.dispose()
  })
})
