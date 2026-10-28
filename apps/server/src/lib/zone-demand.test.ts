import { describe, expect, test } from 'bun:test'
import {
  HOT_ZONE_RULES,
  holdsUnusedFreeWash,
  hotZoneIds,
  requestFailed,
  zoneDemand,
  zoneRemovalBlock,
  type RequestFact,
  type SignupFact,
} from './zone-demand.js'

const NOW = new Date('2026-10-29T10:00:00+05:30')
const LATER = new Date('2026-11-20T10:00:00+05:30')
const EARLIER = new Date('2026-10-01T10:00:00+05:30')

const code = (patch: Partial<NonNullable<SignupFact['discount']>> = {}) => ({
  isActive: true,
  held: 0,
  endsAt: LATER,
  ...patch,
})

describe('holdsUnusedFreeWash', () => {
  test('one of the first 50 in a zone not live yet holds the promised free wash', () => {
    expect(
      holdsUnusedFreeWash({ freeWash: true, discount: null }, false, NOW)
    ).toBe(true)
  })

  test('past the first 50: nothing to hold', () => {
    expect(
      holdsUnusedFreeWash({ freeWash: false, discount: null }, false, NOW)
    ).toBe(false)
  })

  test('issued on launch day: held while usable (on, not used, before it ends)', () => {
    expect(
      holdsUnusedFreeWash({ freeWash: true, discount: code() }, true, NOW)
    ).toBe(true)
    expect(
      holdsUnusedFreeWash(
        { freeWash: true, discount: code({ held: 1 }) },
        true,
        NOW
      )
    ).toBe(false)
    expect(
      holdsUnusedFreeWash(
        { freeWash: true, discount: code({ endsAt: EARLIER }) },
        true,
        NOW
      )
    ).toBe(false)
    expect(
      holdsUnusedFreeWash(
        { freeWash: true, discount: code({ isActive: false }) },
        true,
        NOW
      )
    ).toBe(false)
  })

  test('a live zone that issued none leaves nothing to hold', () => {
    expect(
      holdsUnusedFreeWash({ freeWash: true, discount: null }, true, NOW)
    ).toBe(false)
  })
})

describe('requestFailed: nobody accepted (customer reach’s own state)', () => {
  test('declined at the last garage, or no answer in time', () => {
    expect(requestFailed({ status: 'declined', reply: 'declined' })).toBe(true)
    expect(requestFailed({ status: 'expired', reply: null })).toBe(true)
  })

  test('a yes that lapsed, a booking, an open one or a cancel is not a failure', () => {
    expect(requestFailed({ status: 'expired', reply: 'accepted' })).toBe(false)
    expect(requestFailed({ status: 'converted', reply: 'accepted' })).toBe(
      false
    )
    expect(requestFailed({ status: 'pending', reply: null })).toBe(false)
    expect(requestFailed({ status: 'accepted', reply: 'accepted' })).toBe(false)
    expect(requestFailed({ status: 'cancelled', reply: null })).toBe(false)
  })
})

const ZONES = [
  { id: 'adyar', slug: 'adyar', liveAt: null },
  { id: 'perambur', slug: 'perambur', liveAt: null },
  { id: 'egmore', slug: 'egmore', liveAt: EARLIER },
]

const signups = (zoneId: string, n: number, freeWash = true): SignupFact[] =>
  Array.from({ length: n }, () => ({ zoneId, freeWash, discount: null }))

const requests = (
  zoneSlug: string | null,
  status: string,
  reply: string | null,
  n = 1
): RequestFact[] =>
  Array.from({ length: n }, () => ({ zoneSlug, status, reply }))

describe('zoneDemand: the counts', () => {
  test('waiting, sign-ups, unused free washes, requests (open, failed), recommendations', () => {
    const demand = zoneDemand(
      ZONES,
      {
        signups: [
          ...signups('perambur', 3),
          ...signups('perambur', 2, false),
          // Egmore is live: everyone signed up, nobody waiting; one code
          // unused, one used, one past its end.
          { zoneId: 'egmore', freeWash: true, discount: code() },
          { zoneId: 'egmore', freeWash: true, discount: code({ held: 1 }) },
          {
            zoneId: 'egmore',
            freeWash: true,
            discount: code({ endsAt: EARLIER }),
          },
          // A zone that is not listed (removed meanwhile) counts nowhere.
          ...signups('gone', 4),
        ],
        requests: [
          ...requests('perambur', 'pending', null),
          ...requests('perambur', 'accepted', 'accepted'),
          ...requests('perambur', 'expired', null, 2),
          ...requests('perambur', 'declined', 'declined'),
          ...requests('perambur', 'expired', 'accepted'),
          ...requests('perambur', 'converted', 'accepted'),
          ...requests('perambur', 'cancelled', null),
          // Sent from no zone, or a slug no zone has.
          ...requests(null, 'expired', null),
          ...requests('nowhere', 'expired', null),
        ],
        recommendations: [
          { zoneId: 'perambur', status: 'new' },
          { zoneId: 'perambur', status: 'contacted' },
          { zoneId: 'perambur', status: 'declined' },
          { zoneId: null, status: 'new' },
        ],
      },
      NOW
    )
    const perambur = demand.find((d) => d.zoneId === 'perambur')!
    expect(perambur).toEqual({
      zoneId: 'perambur',
      waiting: 5,
      signups: 5,
      unusedFreeWashes: 3,
      requests: 8,
      openRequests: 2,
      failedRequests: 3,
      recommendations: 3,
      newRecommendations: 1,
      score: 8,
      hot: false,
    })
    expect(demand.find((d) => d.zoneId === 'egmore')).toMatchObject({
      waiting: 0,
      signups: 3,
      unusedFreeWashes: 1,
      score: 0,
    })
    // In the zones' own order, every zone, empty ones too.
    expect(demand.map((d) => d.zoneId)).toEqual(['adyar', 'perambur', 'egmore'])
    expect(demand[0]).toMatchObject({ waiting: 0, requests: 0, score: 0 })
  })

  test('the score is waiting + failed requests, and a zone with 10 is Hot', () => {
    const demand = zoneDemand(
      ZONES,
      {
        signups: signups('adyar', 7),
        requests: requests('adyar', 'expired', null, 3),
        recommendations: [],
      },
      NOW
    )
    expect(demand[0]).toMatchObject({ score: 10, hot: true })
    expect(demand[1]).toMatchObject({ score: 0, hot: false })
  })
})

describe('hotZoneIds: the top 3 by score, each with at least 10', () => {
  const d = (zoneId: string, score: number, waiting = score) => ({
    zoneId,
    score,
    waiting,
  })

  test('the rule’s numbers', () => {
    expect(HOT_ZONE_RULES).toEqual({ top: 3, minScore: 10, requestDays: 30 })
  })

  test('under 10 is never Hot, however few zones there are', () => {
    expect([...hotZoneIds([d('a', 9), d('b', 0)])]).toEqual([])
  })

  test('only the top 3', () => {
    expect(
      hotZoneIds([d('a', 10), d('b', 40), d('c', 25), d('d', 12), d('e', 11)])
    ).toEqual(new Set(['b', 'c', 'd']))
  })

  test('a tie goes to more waiting, then to the zones’ own order', () => {
    expect(
      hotZoneIds([d('a', 20, 5), d('b', 20, 15), d('c', 20, 15), d('d', 20, 15)])
    ).toEqual(new Set(['b', 'c', 'd']))
    expect(
      hotZoneIds([d('x', 30, 10), d('y', 30, 10), d('z', 30, 10), d('w', 30, 10)])
    ).toEqual(new Set(['x', 'y', 'z']))
  })
})

describe('zoneRemovalBlock: what keeps a zone', () => {
  const none = { leads: 0, signups: 0, requests: 0, recommendations: 0 }

  test('nothing in it: it can go', () => {
    expect(zoneRemovalBlock('Kilpauk', none)).toBeNull()
  })

  test('only leads: move or remove them', () => {
    expect(zoneRemovalBlock('Kilpauk', { ...none, leads: 1 })).toBe(
      'Kilpauk is kept: it has 1 lead. Move it to another zone or remove it first.'
    )
    expect(zoneRemovalBlock('Kilpauk', { ...none, leads: 3 })).toBe(
      'Kilpauk is kept: it has 3 leads. Move them to another zone or remove them first.'
    )
  })

  test('anything of customers’: every part listed, and rename instead', () => {
    expect(
      zoneRemovalBlock('Perambur', {
        leads: 4,
        signups: 12,
        requests: 1,
        recommendations: 2,
      })
    ).toBe(
      "Perambur is kept: it has 12 free-wash sign-ups, 1 request, 2 customer recommendations and 4 leads. A zone customers have used can't be removed; rename it instead."
    )
    expect(zoneRemovalBlock('Perambur', { ...none, signups: 1 })).toBe(
      "Perambur is kept: it has 1 free-wash sign-up. A zone customers have used can't be removed; rename it instead."
    )
    expect(
      zoneRemovalBlock('Perambur', { ...none, recommendations: 1, requests: 2 })
    ).toBe(
      "Perambur is kept: it has 2 requests and 1 customer recommendation. A zone customers have used can't be removed; rename it instead."
    )
  })
})
