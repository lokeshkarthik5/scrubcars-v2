/**
 * The push service over stand-ins for its repository: the cron's scheduled
 * notifications go at most once per booking however the runs overlap, and
 * with notifications off nothing is read or sent. The sender is the real
 * one under PUSH_FAKE, which records instead of calling a push service.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { fakePushOutbox } = await import('../../lib/web-push.js')
const { pushRepository } = await import('./push.repository.js')
const { pushService } = await import('./push.service.js')

const IST = (iso: string) => new Date(`${iso}+05:30`)

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const savedEnv = {
  vapidPublicKey: env.vapidPublicKey,
  pushFake: env.pushFake,
  autoCancelUnanswered: env.autoCancelUnanswered,
}
function pushOn(on: boolean) {
  envValues.vapidPublicKey = on ? 'BCeIsUjive6tFPj-LNJcxv3KY2xvAd4G-L9e11RsQB2JtCkzsBq0FJwgjY1Soi9ODPhBNE3iUctLH7c2v-uHZO4' : undefined
  envValues.pushFake = on
}

const BOOKING = 'e2e00000-0000-4000-8000-000000002420'
const CUSTOMER = 'e2e00000-0000-4000-8000-000000002421'
const GARAGE = 'e2e00000-0000-4000-8000-000000002422'

let reads = 0
const claimed = new Set<string>()

beforeEach(() => {
  reads = 0
  claimed.clear()
  fakePushOutbox.length = 0
  envValues.autoCancelUnanswered = false
})

patch(pushRepository, 'listScheduledCandidates', async (input: { kind: string }) => {
  reads += 1
  if (input.kind !== 'hour_before') return []
  return [
    {
      id: BOOKING,
      userId: CUSTOMER,
      vendorId: GARAGE,
      status: 'confirmed',
      bookingType: 'dropin',
      scheduledAt: IST('2026-10-17T10:05:00'),
      createdAt: IST('2026-10-10T09:00:00'),
      respondBy: null,
      paymentStatus: 'paid',
      hasOpenProposal: false,
      businessName: 'Marina Auto Spa',
      serviceNames: ['Exterior Wash'],
    },
  ]
})
// The unique (booking_id, kind) row: only the first insert goes in.
patch(pushRepository, 'claimScheduled', async (bookingId: string, kind: string) => {
  const key = `${bookingId}:${kind}`
  if (claimed.has(key)) return false
  claimed.add(key)
  return true
})
patch(pushRepository, 'listCustomerSubscriptions', async (userId: string) => {
  reads += 1
  return userId === CUSTOMER
    ? [
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-2421',
          p256dh: 'p',
          auth: 'a',
          pushBookingUpdates: true,
          pushReminders: true,
        },
      ]
    : []
})
patch(pushRepository, 'listGarageSubscriptions', async () => {
  reads += 1
  return []
})
patch(pushRepository, 'markSent', async () => undefined)
patch(pushRepository, 'markFailed', async () => 1)
patch(pushRepository, 'deleteSubscription', async () => undefined)

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

const NOW = IST('2026-10-17T09:00:00')

describe('scheduled notifications go at most once', () => {
  test('the hour-before reminder is sent once, and a later run sends nothing', async () => {
    pushOn(true)
    const first = await pushService.sweepScheduled({ dryRun: false }, NOW)
    expect(first).toMatchObject({ enabled: true, hourBefore: 1 })
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakePushOutbox[0]).toMatchObject({ title: 'Your booking is in about an hour', category: 'reminder' })

    const second = await pushService.sweepScheduled({ dryRun: false }, new Date(NOW.getTime() + 10 * 60_000))
    expect(second).toMatchObject({ hourBefore: 0, skipped: 1 })
    expect(fakePushOutbox).toHaveLength(1)
  })

  test('two runs at the same moment send it once between them', async () => {
    pushOn(true)
    const [a, b] = await Promise.all([
      pushService.sweepScheduled({ dryRun: false }, NOW),
      pushService.sweepScheduled({ dryRun: false }, NOW),
    ])
    expect((a as { hourBefore: number }).hourBefore + (b as { hourBefore: number }).hourBefore).toBe(1)
    expect(fakePushOutbox).toHaveLength(1)
  })

  test('a dry run counts and claims nothing', async () => {
    pushOn(true)
    const dry = await pushService.sweepScheduled({ dryRun: true }, NOW)
    expect(dry).toMatchObject({ hourBefore: 1 })
    expect(claimed.size).toBe(0)
    expect(fakePushOutbox).toHaveLength(0)
  })

  test('the evening-before runs only at 18:00 IST, and the garage nudge only with auto-cancel on', async () => {
    pushOn(true)
    const kinds: string[] = []
    patch(pushRepository, 'listScheduledCandidates', async (input: { kind: string }) => {
      kinds.push(input.kind)
      return []
    })
    await pushService.sweepScheduled({ dryRun: true }, IST('2026-10-16T18:10:00'))
    expect(kinds).toEqual(['day_before', 'hour_before'])
    kinds.length = 0
    envValues.autoCancelUnanswered = true
    await pushService.sweepScheduled({ dryRun: true }, IST('2026-10-16T12:00:00'))
    expect(kinds).toEqual(['hour_before', 'respond_soon'])
  })
})

describe('with notifications off', () => {
  test('the cron reads nothing and sends nothing', async () => {
    pushOn(false)
    expect(await pushService.sweepScheduled({ dryRun: false }, NOW)).toEqual({ enabled: false })
    expect(reads).toBe(0)
  })

  test('an event reads nothing and sends nothing', async () => {
    pushOn(false)
    pushService.notifyCustomer(CUSTOMER, async () => {
      reads += 1
      return null
    })
    pushService.notifyGarage(GARAGE, {
      title: 'x',
      body: 'y',
      url: '/',
      tag: 't',
      category: 'booking_update',
      ttlSeconds: 60,
      urgency: 'normal',
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(reads).toBe(0)
    expect(fakePushOutbox).toHaveLength(0)
  })
})

describe('a customer’s switches', () => {
  test('booking news is not sent with Booking updates off; a reminder still is', async () => {
    pushOn(true)
    patch(pushRepository, 'listCustomerSubscriptions', async () => [
      {
        id: 'sub-1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-2421',
        p256dh: 'p',
        auth: 'a',
        pushBookingUpdates: false,
        pushReminders: true,
      },
    ])
    const base = { body: 'b', url: '/', tag: 't', ttlSeconds: 60, urgency: 'normal' as const }
    pushService.notifyCustomer(CUSTOMER, { ...base, title: 'news', category: 'booking_update' })
    pushService.notifyCustomer(CUSTOMER, { ...base, title: 'reminder', category: 'reminder' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fakePushOutbox.map((m) => m.title)).toEqual(['reminder'])
  })
})
