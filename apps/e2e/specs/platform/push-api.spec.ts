/**
 * Browser notifications (0044), at the API. No browser subscribes for real
 * (a headless one has no push service): each test stores a stand-in
 * subscription, as PushSubscription.toJSON() would give it, and the API
 * runs with PUSH_FAKE (.env.e2e), which records notifications instead of
 * sending them. An endpoint ending in /e2e-gone answers 410, as a browser
 * that dropped its subscription would.
 *
 * Fixtures: CUSTOMERS.push, and VENDORS.push with STAFF.pushOwner and
 * STAFF.pushOperator, all in the 2400–2499 / 90000024xx range. Endpoints
 * carry a random tail, so a rerun never meets an earlier run's rows.
 */
import { randomUUID } from 'node:crypto'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { CUSTOMERS, STAFF, VENDORS } from '../../support/seed-ids'

const CUSTOMER_PUSH = `${API}/api/v1/users/me/push`
const GARAGE_PUSH = `${API}/api/v1/vendors/me/push`

// A real-shaped key pair for the stand-in browser (never used to encrypt anything real).
const KEYS = {
  p256dh: 'BCeIsUjive6tFPj-LNJcxv3KY2xvAd4G-L9e11RsQB2JtCkzsBq0FJwgjY1Soi9ODPhBNE3iUctLH7c2v-uHZO4',
  auth: 'k3vHqKPmQc5a2VRZ4bS7Cg',
}

const endpoint = (tail = randomUUID()) => `https://fcm.googleapis.com/fcm/send/e2e-${tail}`

async function rowsFor(endpointUrl: string) {
  const rows = await sql<{ user_id: string; audience: string; vendor_id: string | null }[]>`
    SELECT user_id, audience, vendor_id FROM push_subscriptions WHERE endpoint = ${endpointUrl}
  `
  return rows.map((row) => ({ ...row }))
}

test.describe('browser notifications API @p0', () => {
  test('a customer turns this device on, gets a test, and turns it off', async () => {
    const customer = await loginViaApi(CUSTOMERS.push.phone)
    const device = endpoint()

    const config = await customer.get(`${CUSTOMER_PUSH}/config`)
    expect(config.status()).toBe(200)
    const { data } = await config.json()
    expect(data.enabled).toBe(true)
    expect(typeof data.publicKey).toBe('string')
    expect(data.bookingUpdates).toBe(true)
    expect(data.reminders).toBe(true)

    const subscribe = await customer.post(`${CUSTOMER_PUSH}/subscriptions`, {
      data: { endpoint: device, expirationTime: null, keys: KEYS },
    })
    expect(subscribe.status()).toBe(200)
    expect(await rowsFor(device)).toEqual([{ user_id: CUSTOMERS.push.id, audience: 'customer', vendor_id: null }])

    const status = await customer.post(`${CUSTOMER_PUSH}/status`, { data: { endpoint: device } })
    expect((await status.json()).data.subscribed).toBe(true)

    const sent = await customer.post(`${CUSTOMER_PUSH}/test`, { data: { endpoint: device } })
    expect(sent.status()).toBe(200)
    expect((await sent.json()).data.result).toBe('sent')

    const prefs = await customer.patch(`${CUSTOMER_PUSH}/preferences`, { data: { reminders: false } })
    expect((await prefs.json()).data).toEqual({ bookingUpdates: true, reminders: false })
    await customer.patch(`${CUSTOMER_PUSH}/preferences`, { data: { reminders: true } })

    expect((await customer.post(`${CUSTOMER_PUSH}/unsubscribe`, { data: { endpoint: device } })).status()).toBe(200)
    expect(await rowsFor(device)).toEqual([])
    await customer.dispose()
  })

  test('a browser that dropped its subscription is removed on the first send', async () => {
    const customer = await loginViaApi(CUSTOMERS.push.phone)
    const device = `${endpoint()}/e2e-gone`
    await customer.post(`${CUSTOMER_PUSH}/subscriptions`, { data: { endpoint: device, keys: KEYS } })
    expect(await rowsFor(device)).toHaveLength(1)

    const sent = await customer.post(`${CUSTOMER_PUSH}/test`, { data: { endpoint: device } })
    expect((await sent.json()).data.result).toBe('expired')
    expect(await rowsFor(device)).toEqual([])
    await customer.dispose()
  })

  test('the API never stores an address that is not a browser push service', async () => {
    const customer = await loginViaApi(CUSTOMERS.push.phone)
    const response = await customer.post(`${CUSTOMER_PUSH}/subscriptions`, {
      data: { endpoint: 'https://localhost:8080/api/v1/health', keys: KEYS },
    })
    expect(response.status()).toBe(400)
    await customer.dispose()
  })

  test("a garage seat turns alerts on for its own garage only, and a customer can't", async () => {
    const owner = await loginViaApi(STAFF.pushOwner.phone, 'vendor')
    const operator = await loginViaApi(STAFF.pushOperator.phone, 'vendor')
    const customer = await loginViaApi(CUSTOMERS.push.phone)

    const ownerDevice = endpoint()
    expect((await owner.post(`${GARAGE_PUSH}/subscriptions`, { data: { endpoint: ownerDevice, keys: KEYS } })).status()).toBe(200)
    expect(await rowsFor(ownerDevice)).toEqual([{ user_id: STAFF.pushOwner.id, audience: 'garage', vendor_id: VENDORS.push.id }])

    // The people at the counter need them too.
    const operatorDevice = endpoint()
    expect(
      (await operator.post(`${GARAGE_PUSH}/subscriptions`, { data: { endpoint: operatorDevice, keys: KEYS } })).status()
    ).toBe(200)
    expect(await rowsFor(operatorDevice)).toEqual([
      { user_id: STAFF.pushOperator.id, audience: 'garage', vendor_id: VENDORS.push.id },
    ])

    // Another person cannot test or remove the owner's device.
    const notTheirs = await operator.post(`${GARAGE_PUSH}/test`, { data: { endpoint: ownerDevice } })
    expect(notTheirs.status()).toBe(404)
    await operator.post(`${GARAGE_PUSH}/unsubscribe`, { data: { endpoint: ownerDevice } })
    expect(await rowsFor(ownerDevice)).toHaveLength(1)

    // A customer has no seat: the garage routes are a 404.
    const asCustomer = await customer.post(`${GARAGE_PUSH}/subscriptions`, { data: { endpoint: endpoint(), keys: KEYS } })
    expect(asCustomer.status()).toBe(404)

    const own = await owner.post(`${GARAGE_PUSH}/test`, { data: { endpoint: ownerDevice } })
    expect((await own.json()).data.result).toBe('sent')

    for (const [who, device] of [
      [owner, ownerDevice],
      [operator, operatorDevice],
    ] as const) {
      await who.post(`${GARAGE_PUSH}/unsubscribe`, { data: { endpoint: device } })
      expect(await rowsFor(device)).toEqual([])
    }
    await Promise.all([owner.dispose(), operator.dispose(), customer.dispose()])
  })
})
