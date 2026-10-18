/**
 * "Notify me if a slot opens" (0047), at the API: a customer waits for a
 * full day, the booking that fills it is cancelled, and the customer is told
 * once — the alert is marked, a notification goes to their stand-in device
 * (PUSH_FAKE records it, which stamps the subscription's last success), and
 * Updates has the row that opens checkout on that day.
 *
 * Fixtures: VENDORS.slotAlerts (one bay, one job a day) with
 * BOOKINGS.slotAlertsHeld filling the day two days ahead, CUSTOMERS.slotAlert,
 * CUSTOMERS.slotAlertOther and CUSTOMERS.slotHolder, all in the 2700–2799 /
 * 90000027xx range. The device endpoint carries a random tail.
 */
import { randomUUID } from 'node:crypto'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

const ALERTS = `${API}/api/v1/users/me/slot-alerts`

// A real-shaped key pair for the stand-in browser (never used to encrypt anything real).
const KEYS = {
  p256dh: 'BCeIsUjive6tFPj-LNJcxv3KY2xvAd4G-L9e11RsQB2JtCkzsBq0FJwgjY1Soi9ODPhBNE3iUctLH7c2v-uHZO4',
  auth: 'k3vHqKPmQc5a2VRZ4bS7Cg',
}

/** The IST day the seeded booking fills, read from the row the seed wrote. */
async function heldDate(): Promise<string> {
  const [row] = await sql<{ day: string }[]>`
    SELECT to_char(scheduled_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day
      FROM bookings WHERE id = ${BOOKINGS.slotAlertsHeld}
  `
  return row.day
}

test.describe('slot alerts @p0', () => {
  test('a customer waits for a full day, a cancellation frees it, and they are told once', async () => {
    const customer = await loginViaApi(CUSTOMERS.slotAlert.phone)
    const other = await loginViaApi(CUSTOMERS.slotAlertOther.phone)
    const holder = await loginViaApi(CUSTOMERS.slotHolder.phone)
    const date = await heldDate()

    // A device with notifications on (PUSH_FAKE records instead of sending).
    const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-2700-${randomUUID()}`
    expect(
      (await customer.post(`${API}/api/v1/users/me/push/subscriptions`, { data: { endpoint, keys: KEYS } })).status()
    ).toBe(200)

    // The day is full: one job a day, and the seeded booking has it.
    const set = await customer.post(ALERTS, {
      data: {
        vendorId: VENDORS.slotAlerts.id,
        date,
        window: 'any',
        bookingType: 'dropin',
        serviceIds: [SERVICES.slotAlertsWash.id],
      },
    })
    expect(set.status()).toBe(201)
    const alert = (await set.json()).data.alert
    expect(alert).toMatchObject({ vendorId: VENDORS.slotAlerts.id, date, window: 'any', durationMins: 60 })

    // Someone else neither sees it nor can cancel it.
    expect((await (await other.get(ALERTS)).json()).data.items).toEqual([])
    expect((await other.delete(`${ALERTS}/${alert.id}`)).status()).toBe(404)
    expect((await (await customer.get(ALERTS)).json()).data.items.map((item: { id: string }) => item.id)).toEqual([
      alert.id,
    ])

    // The booking that fills the day is cancelled: its time is free again.
    expect((await holder.patch(`${API}/api/v1/bookings/${BOOKINGS.slotAlertsHeld}/cancel`, { data: {} })).status()).toBe(
      200
    )

    // Re-checked after the cancel commits: told once, about a time that day.
    await expect
      .poll(
        async () => {
          const [row] = await sql<{ notified_at: Date | null; slot_day: string | null }[]>`
            SELECT notified_at,
                   to_char(notified_slot_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS slot_day
              FROM slot_alerts WHERE id = ${alert.id}
          `
          return row?.notified_at ? row.slot_day : null
        },
        { timeout: 15_000 }
      )
      .toBe(date)

    // The notification went to the device.
    await expect
      .poll(async () => {
        const [row] = await sql<{ last_success_at: Date | null }[]>`
          SELECT last_success_at FROM push_subscriptions WHERE endpoint = ${endpoint}
        `
        return row?.last_success_at !== null && row?.last_success_at !== undefined
      })
      .toBe(true)

    // Updates has the row, opening checkout on that day; the alert is no longer waiting.
    const updates = (await (await customer.get(`${API}/api/v1/users/me/updates`)).json()).data.items as Array<{
      kind: string
      linkUrl: string | null
      title: string
    }>
    const row = updates.find((item) => item.kind === 'slot_opened')
    expect(row?.title).toBe(`A slot opened at ${VENDORS.slotAlerts.name}`)
    expect(row?.linkUrl).toBe(`/book/${VENDORS.slotAlerts.id}?service=${SERVICES.slotAlertsWash.id}&date=${date}`)
    expect((await (await customer.get(ALERTS)).json()).data.items).toEqual([])

    await customer.post(`${API}/api/v1/users/me/push/unsubscribe`, { data: { endpoint } })
    await Promise.all([customer.dispose(), other.dispose(), holder.dispose()])
  })
})
