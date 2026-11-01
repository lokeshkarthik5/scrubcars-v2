/**
 * Every notification goes to phones as well as browsers, with the same words
 * (lib/push-messages.ts), and neither kind can break the other. The service
 * runs over stand-ins for its repository; the browser sender is the real one
 * under PUSH_FAKE (records in an outbox), and so is the phone sender, except
 * where a test hands it Expo's answer through a canned fetch.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { fakePushOutbox } = await import('../../lib/web-push.js')
const { fakeDeviceOutbox } = await import('../../lib/expo-push.js')
const { pushRepository } = await import('./push.repository.js')
const { pushService } = await import('./push.service.js')

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

/** A stand-in for one test only: put back before the next one starts. */
const temporary: Array<[Patchable, string, unknown]> = []
function patchForThisTest(target: object, key: string, value: unknown) {
  const object = target as Patchable
  temporary.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const ENV_KEYS = ['vapidPublicKey', 'pushFake', 'expoPushAccessToken', 'autoCancelUnanswered'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, envValues[key]]))

const PUBLIC_KEY = 'BCeIsUjive6tFPj-LNJcxv3KY2xvAd4G-L9e11RsQB2JtCkzsBq0FJwgjY1Soi9ODPhBNE3iUctLH7c2v-uHZO4'
/** Which kinds are on: browsers (VAPID + the test stand-in), phones (the Expo token). */
function channels(on: { browsers: boolean; phones: boolean; fake?: boolean }) {
  envValues.vapidPublicKey = on.browsers ? PUBLIC_KEY : undefined
  envValues.pushFake = on.fake ?? true
  envValues.expoPushAccessToken = on.phones ? 'test-access-token' : undefined
}

const CUSTOMER = 'e2e00000-0000-4000-8000-000000006721'
const GARAGE = 'e2e00000-0000-4000-8000-000000006722'
const BOOKING = 'e2e00000-0000-4000-8000-000000006723'

const TOKEN = 'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]'
const BROWSER = 'https://fcm.googleapis.com/fcm/send/e2e-6720'

const MESSAGE = {
  title: 'Booking confirmed',
  body: 'Marina Auto Spa accepted your Exterior Wash.',
  url: '/bookings/abc',
  tag: 'booking:abc',
  category: 'booking_update' as const,
  ttlSeconds: 14_400,
  urgency: 'normal' as const,
}

let reads: string[] = []
let prefs = { pushBookingUpdates: true, pushReminders: true }
let deleted: string[] = []
let sentMarks: string[] = []
let failedMarks: string[] = []
let browserRows: Array<Record<string, unknown>> = []
let deviceRows: Array<Record<string, unknown>> = []

const browserRow = () => ({ id: 'sub-1', endpoint: BROWSER, p256dh: 'p', auth: 'a', ...prefs })
const deviceRow = (extra: Record<string, unknown> = {}) => ({
  id: 'dev-1',
  token: TOKEN,
  platform: 'ios',
  ...prefs,
  ...extra,
})

beforeEach(() => {
  for (const [object, key, value] of temporary.splice(0).reverse()) object[key] = value
  reads = []
  prefs = { pushBookingUpdates: true, pushReminders: true }
  deleted = []
  sentMarks = []
  failedMarks = []
  browserRows = [browserRow()]
  deviceRows = [deviceRow()]
  fakePushOutbox.length = 0
  fakeDeviceOutbox.length = 0
  envValues.autoCancelUnanswered = false
  channels({ browsers: true, phones: true })
})

patch(pushRepository, 'listCustomerSubscriptions', async () => {
  reads.push('browsers')
  return browserRows.map((row) => ({ ...row, ...prefs }))
})
patch(pushRepository, 'listGarageSubscriptions', async () => {
  reads.push('browsers')
  return browserRows
})
patch(pushRepository, 'listCustomerDevices', async () => {
  reads.push('phones')
  return deviceRows.map((row) => ({ ...row, ...prefs }))
})
patch(pushRepository, 'listGarageDevices', async () => {
  reads.push('phones')
  return deviceRows
})
patch(pushRepository, 'markSent', async () => undefined)
patch(pushRepository, 'markFailed', async () => 1)
patch(pushRepository, 'deleteSubscription', async () => undefined)
patch(pushRepository, 'markDeviceSent', async (id: string) => void sentMarks.push(id))
patch(pushRepository, 'markDeviceFailed', async (id: string) => {
  failedMarks.push(id)
  return 1
})
patch(pushRepository, 'deleteDevice', async (id: string) => void deleted.push(id))

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

const customer = { audience: 'customer' as const, userId: CUSTOMER }
const garage = { audience: 'garage' as const, vendorId: GARAGE }

describe('fan-out to browsers and phones', () => {
  test('a customer’s notification reaches both, with the same words and url', async () => {
    await pushService.sendNow(customer, MESSAGE)
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakeDeviceOutbox).toHaveLength(1)
    const { platform, ...phone } = fakeDeviceOutbox[0]
    expect(platform).toBe('ios')
    expect(phone).toEqual(fakePushOutbox[0])
    expect(phone).toMatchObject({ title: MESSAGE.title, body: MESSAGE.body, url: '/bookings/abc', tag: 'booking:abc' })
    expect(sentMarks).toEqual(['dev-1'])
  })

  test('a garage’s notification reaches both', async () => {
    await pushService.sendNow(garage, { ...MESSAGE, urgency: 'high' })
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakeDeviceOutbox).toHaveLength(1)
  })

  test('fire-and-forget notify reaches both after the response', async () => {
    pushService.notifyCustomer(CUSTOMER, MESSAGE)
    expect(fakeDeviceOutbox).toHaveLength(0)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakeDeviceOutbox).toHaveLength(1)
  })

  test('a loader runs once and both get its message', async () => {
    let loads = 0
    pushService.notifyGarage(GARAGE, async () => {
      loads += 1
      return MESSAGE
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(loads).toBe(1)
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakeDeviceOutbox).toHaveLength(1)
  })

  test('the customer’s switches apply to phones as to browsers', async () => {
    prefs = { pushBookingUpdates: true, pushReminders: false }
    await pushService.sendNow(customer, { ...MESSAGE, category: 'reminder' })
    expect(fakePushOutbox).toHaveLength(0)
    expect(fakeDeviceOutbox).toHaveLength(0)

    await pushService.sendNow(customer, MESSAGE)
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakeDeviceOutbox).toHaveLength(1)

    prefs = { pushBookingUpdates: false, pushReminders: true }
    fakePushOutbox.length = 0
    fakeDeviceOutbox.length = 0
    await pushService.sendNow(customer, MESSAGE)
    expect(fakePushOutbox).toHaveLength(0)
    expect(fakeDeviceOutbox).toHaveLength(0)

    // A test notification is sent whatever the switches say.
    await pushService.sendNow(customer, { ...MESSAGE, category: 'test' })
    expect(fakeDeviceOutbox).toHaveLength(1)
  })

  test('a person with a browser and no phone, or a phone and no browser, is still reached', async () => {
    deviceRows = []
    await pushService.sendNow(customer, MESSAGE)
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakeDeviceOutbox).toHaveLength(0)

    browserRows = []
    deviceRows = [deviceRow()]
    await pushService.sendNow(customer, MESSAGE)
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakeDeviceOutbox).toHaveLength(1)
  })

  test('the cron’s scheduled notifications reach phones too', async () => {
    const IST = (iso: string) => new Date(`${iso}+05:30`)
    patchForThisTest(pushRepository, 'listScheduledCandidates', async (input: { kind: string }) =>
      input.kind !== 'hour_before'
        ? []
        : [
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
    )
    patchForThisTest(pushRepository, 'claimScheduled', async () => true)
    channels({ browsers: false, phones: true })
    const summary = await pushService.sweepScheduled({ dryRun: false }, IST('2026-10-17T09:00:00'))
    expect(summary).toMatchObject({ enabled: true, hourBefore: 1 })
    expect(fakePushOutbox).toHaveLength(0)
    expect(fakeDeviceOutbox).toEqual([expect.objectContaining({ title: 'Your booking is in about an hour', category: 'reminder' })])
  })
})

describe('which kinds are on', () => {
  test('phones alone (no VAPID): browsers are not read, phones are sent to', async () => {
    channels({ browsers: false, phones: true })
    await pushService.sendNow(customer, MESSAGE)
    expect(reads).toEqual(['phones'])
    expect(fakePushOutbox).toHaveLength(0)
    expect(fakeDeviceOutbox).toHaveLength(1)
  })

  test('browsers alone (no Expo token): phones are not read, exactly as before', async () => {
    channels({ browsers: true, phones: false })
    await pushService.sendNow(customer, MESSAGE)
    expect(reads).toEqual(['browsers'])
    expect(fakePushOutbox).toHaveLength(1)
    expect(fakeDeviceOutbox).toHaveLength(0)
  })

  test('neither: nothing is read or sent', async () => {
    channels({ browsers: false, phones: false })
    expect(await pushService.sendNow(customer, MESSAGE)).toBeNull()
    pushService.notifyCustomer(CUSTOMER, MESSAGE)
    pushService.notifyLater(async () => {
      reads.push('loader')
      return []
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(await pushService.sweepScheduled({ dryRun: false })).toEqual({ enabled: false })
    expect(reads).toEqual([])
    expect(fakePushOutbox).toHaveLength(0)
    expect(fakeDeviceOutbox).toHaveLength(0)
  })
})

describe('one kind never breaks the other', () => {
  test('phones failing to load leaves the browsers sent and the request fine', async () => {
    patchForThisTest(pushRepository, 'listCustomerDevices', async () => {
      throw new Error(`database down, token ${TOKEN}`)
    })
    const summary = await pushService.sendNow(customer, MESSAGE)
    expect(summary).toMatchObject({ devices: 1, sent: 1 })
    expect(fakePushOutbox).toHaveLength(1)
  })

  test('phone bookkeeping failing leaves the browsers sent', async () => {
    patchForThisTest(pushRepository, 'markDeviceSent', async () => {
      throw new Error('write failed')
    })
    await pushService.sendNow(customer, MESSAGE)
    expect(fakePushOutbox).toHaveLength(1)
    // Fire-and-forget does not throw either.
    pushService.notifyCustomer(CUSTOMER, MESSAGE)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(fakePushOutbox).toHaveLength(2)
  })

  test('Expo failing does not fail the send; the phone is kept and the failure counted', async () => {
    channels({ browsers: false, phones: true, fake: false })
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('Bad gateway', { status: 502 })) as unknown as typeof fetch
    try {
      await pushService.sendNow(customer, MESSAGE)
    } finally {
      globalThis.fetch = realFetch
    }
    expect(deleted).toEqual([])
    expect(sentMarks).toEqual([])
    expect(failedMarks).toEqual(['dev-1'])
  })

  test('browsers failing still lets the phones through, and the error is raised as before', async () => {
    patchForThisTest(pushRepository, 'listCustomerSubscriptions', async () => {
      throw new Error('browser read failed')
    })
    await expect(pushService.sendNow(customer, MESSAGE)).rejects.toThrow('browser read failed')
    expect(fakeDeviceOutbox).toHaveLength(1)
  })
})

describe('keeping the phone list clean', () => {
  test('Expo’s DeviceNotRegistered deletes the phone', async () => {
    channels({ browsers: false, phones: true, fake: false })
    const requests: Array<{ url: string; auth: string | null; body: unknown }> = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({
        url,
        auth: (init.headers as Record<string, string>).authorization ?? null,
        body: JSON.parse(init.body as string),
      })
      return Response.json({ data: [{ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }] })
    }) as unknown as typeof fetch
    try {
      await pushService.sendNow(customer, MESSAGE)
    } finally {
      globalThis.fetch = realFetch
    }
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://exp.host/--/api/v2/push/send')
    expect(requests[0].auth).toBe('Bearer test-access-token')
    expect(deleted).toEqual(['dev-1'])
  })

  test('a stored token that is not an Expo token is deleted and never sent', async () => {
    deviceRows = [deviceRow({ token: 'https://169.254.169.254/latest/meta-data' })]
    await pushService.sendNow(customer, MESSAGE)
    expect(deleted).toEqual(['dev-1'])
    expect(fakeDeviceOutbox).toHaveLength(0)
    expect(fakePushOutbox).toHaveLength(1)
  })
})
