/**
 * Reading a checkout's state, which the app polls after a payment whose
 * confirm call never came back.
 *
 * A checkout belongs to the customer who opened it. Anyone else gets the same
 * 404 as for a checkout that does not exist, so ids cannot be probed.
 */
import { request } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { BOOKING_INTENTS, CUSTOMERS } from '../../support/seed-ids'

const url = (id: string) => `${API}/api/v1/booking-intents/${id}`

// Fresh logins rather than the saved states: those access tokens live 15
// minutes from global setup, and a bare request context has no app to
// refresh them, so a slow run or a CI retry would get a 401 here instead of
// the answer under test. Both numbers belong to this file alone, so clearing
// their codes to log in cannot race another spec.

test.describe('checkout status @p0', () => {
  test("the customer who paid sees where their checkout stands", async () => {
    const owner = await loginViaApi(CUSTOMERS.intents.phone)

    const response = await owner.get(url(BOOKING_INTENTS.failed))
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        status: 'failed',
        bookingId: null,
        failureReason: 'vehicle_double_booked',
        // The words the app shows instead of a booking: the refund promise.
        message: expect.stringContaining('Your payment will be refunded.'),
      },
    })

    await owner.dispose()
  })

  test("another customer's checkout is not found", async () => {
    const stranger = await loginViaApi(CUSTOMERS.intentsStranger.phone)

    const response = await stranger.get(url(BOOKING_INTENTS.failed))
    expect(response.status()).toBe(404)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Booking intent not found',
      code: 'INTENT_NOT_FOUND',
    })

    await stranger.dispose()
  })

  test('signed out, there is nothing to read', async () => {
    const guest = await request.newContext()
    expect((await guest.get(url(BOOKING_INTENTS.failed))).status()).toBe(401)
    await guest.dispose()
  })
})
