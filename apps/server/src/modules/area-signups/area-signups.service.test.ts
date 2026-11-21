/**
 * The free-wash list's service rules that need the repository (customer
 * reach, 0062), with only the database stood in for: the repository's
 * methods are replaced on its object for these tests and put back after.
 *
 * - A sign-up landing as its zone goes live is refused (AREA_LIVE), never
 *   left with a free wash that launch day never issues.
 * - The message sweep reads only sign-ups due a message (a zone a garage now
 *   reaches, or 14 quiet days), so old waiting ones can't starve the rest.
 * - A message is claimed either way, but sent only to a customer who asked
 *   for app notifications.
 * - Owed referral credits aren't read while credit is off.
 * - "<Garage> joined Detlio thanks to you" (Bring your garage) is claimed
 *   and sent only in the message hours, once per customer and garage, to
 *   the garage's page (only listed garages are claimed).
 * - The same number recommended again is the same recommendation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { pushService } = await import('../push/push.service.js')
const { areaSignupsRepository } = await import('./area-signups.repository.js')
const { areaSignupsService } = await import('./area-signups.service.js')

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const DAY = 24 * 60 * 60 * 1000
// 10:00 IST: inside the 09:00–20:59 message hours.
const NOW = new Date('2026-10-29T10:00:00+05:30')

const zone = (over: Record<string, unknown> = {}) => ({
  id: 'z-adyar',
  slug: 'adyar',
  name: 'Adyar',
  lat: 13.0067,
  lng: 80.2571,
  priority: true,
  target: 5,
  liveAt: null as Date | null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
})

const signup = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  userId: 'u1',
  zoneId: 'z-adyar',
  position: 1,
  freeWash: true,
  pushOptIn: true,
  whatsappOptIn: false,
  whatsappOptInAt: null,
  discountId: null as string | null,
  freeWashIssuedAt: null,
  launchPushAt: null as Date | null,
  coveragePushAt: null as Date | null,
  reminderPushAt: null as Date | null,
  launchBannerSeenAt: null,
  createdAt: new Date(NOW.getTime() - 20 * DAY),
  ...over,
})

let sent: Array<{ userId: string; title: string }> = []
let claimed: string[] = []
let candidateArgs: Array<{ reachedZoneIds: readonly string[]; remindBefore: Date }> = []
let candidates: Array<{ signup: ReturnType<typeof signup>; zone: ReturnType<typeof zone> }> = []
let creditOnSeen: boolean[] = []
/** What the joined-notice claim hands back, and what it was asked. */
let joinedRows: Array<{ id: string; userId: string; vendorId: string; businessName: string }> = []
let joinedAsked: Array<{ from: Date; limit: number; actorName: string }> = []
let pushes: Array<{ userId: string; title: string; body: string; url: string; category: string }> = []
const savedGifts = env.giftsEnabled

beforeAll(() => {
  patch(areaSignupsRepository, 'listZones', async () => [zone(), zone({ id: 'z-tnagar', slug: 't-nagar', name: 'T Nagar', lat: 13.0418, lng: 80.2341 })])
  patch(areaSignupsRepository, 'listListedGaragePins', async () => [])
  patch(areaSignupsRepository, 'listZonesAwaitingCoverage', async () => [zone(), zone({ id: 'z-tnagar', slug: 't-nagar', name: 'T Nagar', lat: 13.0418, lng: 80.2341 })])
  // A doorstep garage reaches Adyar's centre; nobody reaches T Nagar.
  patch(areaSignupsRepository, 'garageReaching', async (point: { lat: number }) =>
    point.lat === 13.0067 ? { name: 'Shine Doorstep', mode: 'doorstep' } : null
  )
  patch(areaSignupsRepository, 'listMessageCandidates', async (input: { reachedZoneIds: readonly string[]; remindBefore: Date }) => {
    candidateArgs.push(input)
    return candidates
  })
  patch(areaSignupsRepository, 'claimMessage', async (id: string, kind: string) => {
    claimed.push(`${id}:${kind}`)
    return true
  })
  patch(areaSignupsRepository, 'listCreditCandidates', async (_limit: number, creditOn: boolean) => {
    creditOnSeen.push(creditOn)
    return []
  })
  patch(areaSignupsRepository, 'claimJoinedNotices', async (input: { from: Date; limit: number; actorName: string }) => {
    joinedAsked.push(input)
    const rows = joinedRows
    joinedRows = []
    return rows
  })
  patch(pushService, 'notifyCustomer', (userId: string, source: { title: string; body: string; url: string; category: string }) => {
    sent.push({ userId, title: source.title })
    pushes.push({ userId, title: source.title, body: source.body, url: source.url, category: source.category })
  })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  ;(env as unknown as Record<string, unknown>).giftsEnabled = savedGifts
})

beforeEach(() => {
  sent = []
  claimed = []
  candidateArgs = []
  candidates = []
  creditOnSeen = []
  joinedRows = []
  joinedAsked = []
  pushes = []
})

describe('the come-back messages', () => {
  test('only zones a garage now reaches are asked for, and reminders only after 14 quiet days', async () => {
    await areaSignupsService.sweep({ dryRun: false }, NOW)
    expect(candidateArgs).toHaveLength(1)
    expect(candidateArgs[0]!.reachedZoneIds).toEqual(['z-adyar'])
    expect(candidateArgs[0]!.remindBefore.getTime()).toBe(NOW.getTime() - 14 * DAY)
  })

  test('claimed either way, sent only with the app-notification switch on', async () => {
    candidates = [
      { signup: signup({ id: 'on', userId: 'u-on', pushOptIn: true }), zone: zone() },
      { signup: signup({ id: 'off', userId: 'u-off', pushOptIn: false }), zone: zone() },
    ]
    const result = await areaSignupsService.sweep({ dryRun: false }, NOW)
    expect(claimed).toEqual(['on:coverage', 'off:coverage'])
    expect(sent.map((s) => s.userId)).toEqual(['u-on'])
    expect(result).toMatchObject({ messages: { coverage: 1, skipped: 1 } })
  })

  test('outside 09:00–20:59 IST nothing is read or sent', async () => {
    candidates = [{ signup: signup(), zone: zone() }]
    await areaSignupsService.sweep({ dryRun: false }, new Date('2026-10-29T22:00:00+05:30'))
    expect(candidateArgs).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })
})

describe('referral credit while credit is off', () => {
  test('owed credits are not read (they would starve the batch); read again once it is on', async () => {
    ;(env as unknown as Record<string, unknown>).giftsEnabled = false
    await areaSignupsService.sweepReferrals(NOW)
    ;(env as unknown as Record<string, unknown>).giftsEnabled = true
    await areaSignupsService.sweepReferrals(NOW)
    expect(creditOnSeen).toEqual([false, true])
  })
})

describe('the referral credit: ₹500 a garage, no cap, and the customer told when it lands', () => {
  test('a customer bringing their tenth garage gets the full ₹500, and a notification naming the garage', async () => {
    ;(env as unknown as Record<string, unknown>).giftsEnabled = true
    const repo = areaSignupsRepository as unknown as Patchable
    const service = pushService as unknown as Patchable
    const restore: Array<[Patchable, string, unknown]> = []
    const swap = (target: Patchable, key: string, value: unknown) => {
      restore.push([target, key, target[key]])
      target[key] = value
    }
    const decided: Array<number | null> = []
    const pushes: Array<{ userId: string; title: string; body: string; url: string }> = []
    swap(repo, 'listCreditCandidates', async () => [
      { id: 'rec10', userId: 'u1', vendorId: 'g10', creditStatus: null, creditBookingId: null, createdAt: NOW },
    ])
    swap(repo, 'garageListed', async () => true)
    swap(repo, 'firstPaidCompletedBooking', async () => 'b10')
    swap(repo, 'garageName', async () => 'Sri Krishna Car Spa')
    // Nine garages credited before: nothing about them reaches the rule any more.
    swap(repo, 'creditRecommendation', async (input: { decide: (facts: { alreadyForGarage: boolean }) => number | null }) => {
      const amount = input.decide({ alreadyForGarage: false })
      decided.push(amount)
      return { id: 'rec10', creditStatus: 'granted', creditAmount: amount!.toFixed(2) }
    })
    swap(service, 'notifyCustomer', (userId: string, source: () => Promise<{ title: string; body: string; url: string } | null>) => {
      void source().then((message) => message && pushes.push({ userId, ...message }))
    })
    try {
      expect(await areaSignupsService.sweepReferrals(NOW)).toEqual({ granted: 1, owed: 0 })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(decided).toEqual([500])
      expect(pushes).toEqual([
        expect.objectContaining({
          userId: 'u1',
          title: '₹500 credit added',
          body: 'Sri Krishna Car Spa joined Detlio and you booked them. Thanks for bringing them in!',
          url: '/profile/credit',
        }),
      ])
    } finally {
      for (const [target, key, value] of restore.reverse()) target[key] = value
    }
  })

  test('owed while credit is off: recorded, and nothing is sent yet', async () => {
    ;(env as unknown as Record<string, unknown>).giftsEnabled = false
    const repo = areaSignupsRepository as unknown as Patchable
    const restore: Array<[string, unknown]> = []
    const fakes: Record<string, unknown> = {
      listCreditCandidates: async () => [{ id: 'r', userId: 'u1', vendorId: 'g', creditStatus: null, creditBookingId: null, createdAt: NOW }],
      garageListed: async () => true,
      firstPaidCompletedBooking: async () => 'b',
      creditRecommendation: async () => ({ id: 'r', creditStatus: 'owed', creditAmount: '500.00' }),
    }
    for (const [key, value] of Object.entries(fakes)) {
      restore.push([key, repo[key]])
      repo[key] = value
    }
    try {
      expect(await areaSignupsService.sweepReferrals(NOW)).toEqual({ granted: 0, owed: 1 })
      expect(sent).toEqual([])
    } finally {
      for (const [key, value] of restore) repo[key] = value
    }
  })
})

describe('signing up as the zone goes live', () => {
  test('a sign-up the launch got to first is refused as AREA_LIVE, not left without its free wash', async () => {
    const restore: Array<[string, unknown]> = []
    const repo = areaSignupsRepository as unknown as Patchable
    for (const [key, value] of Object.entries({
      findZoneBySlug: async (): Promise<ReturnType<typeof zone>> => zone(),
      // The launch commits between the check and the write.
      signUp: async (): Promise<'live'> => 'live',
    })) {
      restore.push([key, repo[key]])
      repo[key] = value
    }
    try {
      const error = await areaSignupsService
        .signUp('u1', { zoneSlug: 'adyar', pushOptIn: true, whatsappOptIn: false }, NOW)
        .catch((err: unknown) => err)
      expect(error).toBeInstanceOf(AppError)
      expect((error as InstanceType<typeof AppError>).code).toBe('AREA_LIVE')
    } finally {
      for (const [key, value] of restore) repo[key] = value
    }
  })
})

describe('Home’s free-wash read', () => {
  test('names the discounts row in its held count (a bare "id" is ambiguous there and failed every Home read)', () => {
    // Built, never run: the SQL alone is the point.
    const query = areaSignupsRepository.unusedDiscounts(['e2e00000-0000-4000-8000-000000004499']) as unknown as {
      toSQL: () => { sql: string }
    }
    const text = query.toSQL().sql
    expect(text).toContain('dr.discount_id = "discounts"."id"')
    expect(text).not.toContain('dr.discount_id = "id"')
  })
})

describe('"<Garage> joined Detlio thanks to you": only once the garage is shown to customers', () => {
  test('the claimed ones are told once per customer and garage, to the garage’s page, under Reminders', async () => {
    joinedRows = [
      { id: 'a', userId: 'priya', vendorId: 'g1', businessName: 'Sri Krishna Car Spa' },
      { id: 'b', userId: 'priya', vendorId: 'g1', businessName: 'Sri Krishna Car Spa' },
      { id: 'c', userId: 'arun', vendorId: 'g1', businessName: 'Sri Krishna Car Spa' },
    ]
    expect(await areaSignupsService.tellJoinedGarages(NOW)).toBe(2)
    expect(joinedAsked).toHaveLength(1)
    expect(joinedAsked[0]).toMatchObject({ limit: 50, actorName: 'Detlio (automatic)' })
    expect(pushes).toEqual([
      { userId: 'priya', title: 'Sri Krishna Car Spa joined Detlio thanks to you', body: 'Book them once to get ₹500.', url: '/garage/g1', category: 'reminder' },
      { userId: 'arun', title: 'Sri Krishna Car Spa joined Detlio thanks to you', body: 'Book them once to get ₹500.', url: '/garage/g1', category: 'reminder' },
    ])
    // Claimed: the next run finds nothing more to tell.
    expect(await areaSignupsService.tellJoinedGarages(NOW)).toBe(0)
  })

  test('outside 09:00–20:59 IST nothing is claimed, so the morning’s first run tells them', async () => {
    joinedRows = [{ id: 'a', userId: 'priya', vendorId: 'g1', businessName: 'Glossy' }]
    expect(await areaSignupsService.tellJoinedGarages(new Date('2026-11-21T22:30:00+05:30'))).toBe(0)
    expect(joinedAsked).toHaveLength(0)
    expect(await areaSignupsService.tellJoinedGarages(new Date('2026-11-22T09:00:00+05:30'))).toBe(1)
    expect(pushes.map((p) => p.userId)).toEqual(['priya'])
  })

  test('the cron runs it in the message hours, after the come-back messages', async () => {
    joinedRows = [{ id: 'a', userId: 'priya', vendorId: 'g1', businessName: 'Glossy' }]
    const result = await areaSignupsService.sweep({ dryRun: false }, NOW)
    expect(result).toMatchObject({ joinedTold: 1 })
    expect(pushes.map((p) => p.title)).toEqual(['Glossy joined Detlio thanks to you'])
  })
})

describe('recommending the same number again', () => {
  test('is that recommendation, not a second one', async () => {
    const rows: Array<{ id: string; userId: string; phone: string | null; status: string }> = []
    patch(areaSignupsRepository, 'insertRecommendationOnce', async (values: { userId: string; phone: string | null }) => {
      const existing = rows.find((row) => row.userId === values.userId && values.phone && row.phone === values.phone && row.status === 'new')
      if (existing) return { row: existing, created: false }
      const row = { id: `r${rows.length + 1}`, userId: values.userId, phone: values.phone, status: 'new' }
      rows.push(row)
      return { row, created: true }
    })
    const first = await areaSignupsService.recommend('u1', { name: 'Glossy', phone: '9840123456' })
    const again = await areaSignupsService.recommend('u1', { name: 'Glossy', phone: '9840123456' })
    expect(again.id).toBe(first.id)
    expect(first.credit).toEqual({ perGarage: 500, max: null })
    expect(rows).toHaveLength(1)
  })
})
