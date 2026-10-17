import { describe, expect, test } from 'bun:test'
import * as serverTypes from './booking-types.js'
import * as server from './pickup.js'
import { MIN_NOTICE_MS } from './slots.js'

// The apps' twins live in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The garage
// portal and admin print the core words and numbers, so a drift here would
// tick one promise on screen and record another.
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('pickup & drop parity', () => {
  test('the terms, the radius and the code cap are the same', async () => {
    const core = (await import(coreUrl('pickup.ts'))) as typeof server & {
      PICKUP_STEP_LABELS: Record<string, string>
    }
    expect(core.PICKUP_TERMS_GARAGE).toBe(server.PICKUP_TERMS_GARAGE)
    expect(core.PICKUP_TERMS_ADMIN).toBe(server.PICKUP_TERMS_ADMIN)
    expect(core.DEFAULT_PICKUP_RADIUS_KM).toBe(server.DEFAULT_PICKUP_RADIUS_KM)
    expect(core.MIN_PICKUP_RADIUS_KM).toBe(server.MIN_PICKUP_RADIUS_KM)
    expect(core.MAX_PICKUP_RADIUS_KM).toBe(server.MAX_PICKUP_RADIUS_KM)
    expect(core.MAX_CODE_ATTEMPTS).toBe(server.MAX_CODE_ATTEMPTS)
    expect(Object.keys(core.PICKUP_STEP_LABELS).sort()).toEqual(
      ['at_garage', 'delivered', 'out_for_delivery', 'picked_up', 'start_work']
    )
  })

  test('the booking type labels and notice are the same', async () => {
    const core = (await import(coreUrl('booking-types.ts'))) as {
      BOOKING_TYPE_LABELS: Record<string, string>
      MIN_NOTICE_MINS: Record<string, number>
    }
    expect(core.BOOKING_TYPE_LABELS).toEqual(serverTypes.BOOKING_TYPE_LABELS)
    expect(core.MIN_NOTICE_MINS).toEqual(
      Object.fromEntries(
        Object.entries(MIN_NOTICE_MS).map(([type, ms]) => [type, ms / 60_000])
      )
    )
  })

  test("the customer's stage is read the same way", async () => {
    const core = (await import(coreUrl('pickup.ts'))) as {
      pickupStageOf: (facts: Parameters<typeof server.customerPickupStage>[0]) => string
    }
    const t = '2026-10-18T04:00:00.000Z'
    const cases: Array<Parameters<typeof server.customerPickupStage>[0]> = [
      { status: 'pending' },
      { status: 'confirmed' },
      { status: 'confirmed', pickedUpAt: t },
      { status: 'confirmed', pickedUpAt: t, atGarageAt: t },
      { status: 'in_progress', pickedUpAt: t, atGarageAt: t, startedAt: t },
      { status: 'in_progress', startedAt: t, outForDeliveryAt: t },
      { status: 'completed' },
      { status: 'completed', deliveredAt: t },
      { status: 'cancelled', pickedUpAt: t },
    ]
    for (const facts of cases) {
      expect(core.pickupStageOf(facts)).toBe(server.customerPickupStage(facts))
    }
  })
})
