/**
 * Bring your garage (21 Nov 2026; fixtures BRING, 8400–8449).
 *
 * 1. The garage list ends with "Know a good garage? Bring it to Detlio".
 *    Its Recommend sheet's "Send on WhatsApp" side writes the message with
 *    the garage app's sign-up link and opens wa.me with it, and saves the
 *    recommendation (name and phone) so Coverage sees it; then "Thanks!
 *    We'll call them" with the ₹500 rule. The phone is put beside SHINE's
 *    garage (the only one within 150 km there), so the list ends at once.
 * 2. Profile has "Bring your garage · Get ₹500", opening the same sheet.
 * 3. A garage that signs up itself in the garage app with that number is
 *    linked to every open recommendation of it (joined, signed by the
 *    sign-up; the team's who and when kept); a dismissed one is never.
 *
 * Serial: the sign-up links the recommendation the first test makes.
 */
import { request as playwrightRequest } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { forgetOtps, latestOtp, sql } from '../../support/db'
import { BRING, SHINE } from '../../support/seed-ids'

test.describe.configure({ mode: 'serial' })

const WHATSAPP_NAME = BRING.garageName

type RecRow = {
  id: string
  name: string
  phone: string | null
  maps_link: string | null
  status: string
  vendor_id: string | null
  handled_by: string | null
}

const recsOfNumber = () =>
  sql<RecRow[]>`
    select id, name, phone, maps_link, status, vendor_id, handled_by
      from garage_recommendations where phone = ${BRING.garagePhone} order by created_at
  `

test.describe('bring your garage, from the list and Profile @p0', () => {
  test.use({ storageState: asRole('customer-bring') })

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(
      ({ lat, lng }) => {
        window.localStorage.setItem(
          'detlio-location',
          JSON.stringify({
            state: {
              location: { lat, lng, label: 'E2E Bring', source: 'gps', updatedAt: Date.now() },
              promptDismissedAt: Date.now(),
            },
            version: 0,
          })
        )
      },
      { lat: SHINE.garage.lat + 0.01, lng: SHINE.garage.lng + 0.01 }
    )
  })

  test('the list’s end card → Send on WhatsApp → wa.me with the message, saved, and the done screen', async ({ page }) => {
    // A retry starts clean: the customer's own recommendations go.
    await sql`delete from garage_recommendations where user_id = ${BRING.customer.id}`
    await page.goto('/garages')
    await expect(page.locator('[data-garage-card]').filter({ hasText: SHINE.garage.name })).toBeVisible()

    const card = page.getByRole('region', { name: 'Know a good garage? Bring it to Detlio' })
    await card.scrollIntoViewIfNeeded()
    await expect(card).toBeVisible()
    await expect(card).toContainText('Get ₹500 when they join and you book them')
    // After the last garage card.
    const after = await page.evaluate(() => {
      const garages = Array.from(document.querySelectorAll('[data-garage-card]'))
      const end = document.querySelector('[data-bring-garage-card]')
      const last = garages[garages.length - 1]
      return !!end && !!last && (last.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    })
    expect(after).toBe(true)
    await card.getByRole('button', { name: 'Recommend a garage' }).click()

    const sheet = page.getByRole('dialog', { name: 'Recommend a garage' })
    await expect(sheet.getByText('₹500 Detlio credit if they join and you book them.')).toBeVisible()
    await expect(sheet.getByText('up to', { exact: false })).toHaveCount(0)
    const how = sheet.getByRole('radiogroup', { name: 'How to send' })
    await expect(how.getByRole('radio', { name: 'Send to Detlio' })).toHaveAttribute('aria-checked', 'true')
    await how.getByRole('radio', { name: 'Send on WhatsApp' }).click()

    await sheet.getByLabel('Garage name').fill(WHATSAPP_NAME)
    await sheet.getByLabel('Their WhatsApp number').fill('90000 08410')
    const message = sheet.getByRole('region', { name: 'Your message' })
    await expect(message).toContainText(`Hi! I’ve recommended ${WHATSAPP_NAME} on Detlio, the car-care app I use.`)
    await expect(message).toContainText('https://vendor.detlio.com/login')
    await expect(message).toContainText('– Bringing')

    const open = sheet.getByRole('link', { name: 'Open WhatsApp' })
    const href = await open.getAttribute('href')
    expect(href).toMatch(/^https:\/\/wa\.me\/919000008410\?text=/)
    expect(decodeURIComponent(href!.split('?text=')[1]!)).toContain('https://vendor.detlio.com/login')
    const popup = page.waitForEvent('popup')
    await open.click()
    await (await popup).close()

    await expect(sheet.getByRole('heading', { name: 'Thanks! We’ll call them' })).toBeVisible()
    await expect(sheet.getByText(`We’ll get in touch with ${WHATSAPP_NAME} and help them join.`)).toBeVisible()
    await expect(sheet.getByText('You get ₹500 Detlio credit once they join and you finish a paid booking with them.')).toBeVisible()

    // Saved as a recommendation (name and phone), for Coverage.
    await expect
      .poll(async () => (await sql<RecRow[]>`select * from garage_recommendations where user_id = ${BRING.customer.id}`).length)
      .toBe(1)
    const [saved] = await sql<RecRow[]>`
      select id, name, phone, maps_link, status, vendor_id, handled_by from garage_recommendations where user_id = ${BRING.customer.id}
    `
    expect(saved).toMatchObject({ name: WHATSAPP_NAME, phone: BRING.garagePhone, maps_link: null, status: 'new', vendor_id: null })

    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()
  })

  test('Profile’s “Bring your garage · Get ₹500” opens the same sheet', async ({ page }) => {
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Bring your garage · Get ₹500' }).click()
    const sheet = page.getByRole('dialog', { name: 'Recommend a garage' })
    await expect(sheet.getByRole('radiogroup', { name: 'How to send' })).toBeVisible()
    await expect(sheet.getByLabel('Google Maps link')).toBeVisible()
  })
})

test.describe('a garage that signs up itself with the recommended number @p0', () => {
  test('every open recommendation of it is linked, joined; a dismissed one is not', async () => {
    // A rerun on a kept database: the garage and its owner from the last run go first.
    await sql`delete from vendors where phone = ${BRING.garagePhone}`
    await sql`delete from users where phone = ${BRING.garagePhone}`
    await sql`
      update garage_recommendations set vendor_id = null, status = 'new', handled_by = null, handled_at = null
       where id = ${BRING.recommendations.earlier}
    `
    await sql`
      update garage_recommendations set vendor_id = null, status = 'contacted', handled_by = 'E2E Admin'
       where id = ${BRING.recommendations.another}
    `

    // The garage owner, new to Detlio, in the garage app: the number, the code, then the garage.
    const owner = await playwrightRequest.newContext({ baseURL: API, storageState: { cookies: [], origins: [] } })
    await forgetOtps(BRING.garagePhone)
    const send = await owner.post('/api/v1/auth/otp/send', {
      data: { phone: BRING.garagePhone, purpose: 'vendor_onboard', audience: 'vendor' },
    })
    expect(send.status()).toBe(200)
    const otp = await latestOtp(BRING.garagePhone)
    const verify = await owner.post('/api/v1/auth/otp/verify', {
      data: { phone: BRING.garagePhone, otp, purpose: 'vendor_onboard', audience: 'vendor', name: 'Bring Owner' },
    })
    expect(verify.status()).toBe(200)
    const created = await owner.post('/api/v1/vendors', {
      data: {
        businessName: BRING.garageName,
        phone: BRING.garagePhone,
        address: '84, Bring Street',
        city: 'Chennai',
        pincode: '600084',
        lat: SHINE.garage.lat + 0.2,
        lng: SHINE.garage.lng + 0.2,
      },
    })
    expect(created.status()).toBe(201)
    const vendorId = ((await created.json()) as { data: { id: string } }).data.id
    await owner.dispose()

    const byId = new Map((await recsOfNumber()).map((rec) => [rec.id, rec]))
    // The earlier one: joined, signed by the sign-up.
    expect(byId.get(BRING.recommendations.earlier)).toMatchObject({ vendor_id: vendorId, status: 'joined', handled_by: 'Garage sign-up' })
    // The one the team contacted: joined, the team's name kept.
    expect(byId.get(BRING.recommendations.another)).toMatchObject({ vendor_id: vendorId, status: 'joined', handled_by: 'E2E Admin' })
    // Dismissed by the team: left alone.
    expect(byId.get(BRING.recommendations.dismissed)).toMatchObject({ vendor_id: null, status: 'declined' })
    // The WhatsApp one from the list (when the first test ran).
    for (const rec of byId.values()) {
      if (rec.name === WHATSAPP_NAME && rec.id !== BRING.recommendations.earlier) {
        expect(rec).toMatchObject({ vendor_id: vendorId, status: 'joined', handled_by: 'Garage sign-up' })
      }
    }
  })
})
