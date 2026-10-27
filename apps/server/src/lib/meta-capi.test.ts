import { beforeEach, describe, expect, test } from 'bun:test'

// meta-capi.ts reads the app's env, which insists on a database URL.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
const {
  META_GRAPH_VERSION,
  buildPurchaseEvent,
  cleanEventSourceUrl,
  cleanMetaCookie,
  forgetReportedPurchases,
  metaCapi,
  metaCapiConfig,
  purchaseEventId,
  sendPurchaseEvent,
} = await import('./meta-capi.js')

const BOOKING = 'e2e00000-0000-4000-8000-000000009001'
const PAID_AT = new Date('2026-10-27T05:30:00.000Z')
const NOW = new Date('2026-10-27T05:31:00.000Z')
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const FBP = 'fb.1.1761543000000.1234567890'
const FBC = 'fb.1.1761543000000.IwAR2abcDEF_ghi-jkl'

const facts = {
  bookingId: BOOKING,
  valueRupees: 849,
  serviceCount: 2,
  paidAt: PAID_AT,
}
const context = {
  clientIp: '203.0.113.7',
  userAgent: UA,
  fbp: FBP,
  fbc: FBC,
  eventSourceUrl: 'https://detlio.com/checkout',
}
const config = { token: 'EAAtoken', pixelId: '891710590692874' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

type Call = { url: string; init: RequestInit; body: Record<string, unknown> }
function recordingFetch(answer: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) })
    return answer()
  }
  return { calls, fetchImpl }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('the event id', () => {
  // The same format as packages/core purchaseEventId, which the Pixel uses.
  test('purchase-<bookingId>', () => {
    expect(purchaseEventId(BOOKING)).toBe(`purchase-${BOOKING}`)
  })
})

describe('buildPurchaseEvent', () => {
  test('exactly the listed fields, and nothing else', () => {
    expect(buildPurchaseEvent(facts, context, { now: NOW })).toEqual({
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(PAID_AT.getTime() / 1000),
          event_id: `purchase-${BOOKING}`,
          action_source: 'website',
          event_source_url: 'https://detlio.com/checkout',
          user_data: {
            client_ip_address: '203.0.113.7',
            client_user_agent: UA,
            fbp: FBP,
            fbc: FBC,
          },
          custom_data: { currency: 'INR', value: 849, num_items: 2 },
        },
      ],
    })
  })

  test('nothing personal: no name, phone, email, address or hashed id', () => {
    const body = buildPurchaseEvent(facts, context, { now: NOW })
    const userData = Object.keys(body.data[0].user_data).sort()
    expect(userData).toEqual([
      'client_ip_address',
      'client_user_agent',
      'fbc',
      'fbp',
    ])
    expect(Object.keys(body).sort()).toEqual(['data'])
    expect(Object.keys(body.data[0]).sort()).toEqual([
      'action_source',
      'custom_data',
      'event_id',
      'event_name',
      'event_source_url',
      'event_time',
      'user_data',
    ])
    expect(Object.keys(body.data[0].custom_data).sort()).toEqual([
      'currency',
      'num_items',
      'value',
    ])
    // Meta's customer-information keys (hashed or not) never appear.
    const text = JSON.stringify(body)
    for (const key of [
      'em',
      'ph',
      'fn',
      'ln',
      'ge',
      'db',
      'ct',
      'st',
      'zp',
      'country',
      'external_id',
    ]) {
      expect(text).not.toContain(`"${key}"`)
    }
  })

  test('value is rupees as a number, in INR, paise kept', () => {
    const body = buildPurchaseEvent(
      { ...facts, valueRupees: 1249.5, serviceCount: 1 },
      context,
      { now: NOW }
    )
    expect(body.data[0].custom_data).toEqual({
      currency: 'INR',
      value: 1249.5,
      num_items: 1,
    })
    expect(typeof body.data[0].custom_data.value).toBe('number')
  })

  test('test_event_code only when set', () => {
    expect(
      buildPurchaseEvent(facts, context, { now: NOW }).test_event_code
    ).toBeUndefined()
    expect(
      buildPurchaseEvent(facts, context, { now: NOW, testEventCode: 'TEST42' })
        .test_event_code
    ).toBe('TEST42')
  })

  test('a bad event source URL is dropped, the event still built', () => {
    for (const bad of [
      'https://detlio.com/checkout?ref=ig',
      'https://detlio.com/checkout#paid',
      'http://detlio.com/checkout',
      'https://evil.example/checkout',
      'https://detlio.com.evil.example/x',
      'https://vendor.detlio.com/x',
      'https://detlio.com:8443/x',
      'https://user:pw@detlio.com/x',
      `https://detlio.com/${'a'.repeat(300)}`,
      'not a url',
    ]) {
      const body = buildPurchaseEvent(
        facts,
        { ...context, eventSourceUrl: bad },
        { now: NOW }
      )
      expect(body.data[0]).not.toHaveProperty('event_source_url')
    }
    expect(cleanEventSourceUrl('https://www.detlio.com/bookings/new')).toBe(
      'https://www.detlio.com/bookings/new'
    )
  })

  test('missing or malformed browser facts are left out, never sent empty', () => {
    const body = buildPurchaseEvent(
      facts,
      { clientIp: 'unknown', userAgent: UA, fbp: 'fb.2.x', fbc: 'garbage' },
      { now: NOW }
    )
    expect(body.data[0].user_data).toEqual({ client_user_agent: UA })
    expect(cleanMetaCookie(`fb.1.${'9'.repeat(200)}`)).toBeUndefined()
    expect(cleanMetaCookie('fb.1.123 456')).toBeUndefined()
    expect(cleanMetaCookie(FBC)).toBe(FBC)
  })

  test('an IPv6 address is passed on', () => {
    const body = buildPurchaseEvent(
      facts,
      { ...context, clientIp: '2001:db8::1' },
      { now: NOW }
    )
    expect(body.data[0].user_data.client_ip_address).toBe('2001:db8::1')
  })

  test('event_time is never in the future', () => {
    const body = buildPurchaseEvent(
      { ...facts, paidAt: new Date(NOW.getTime() + 60_000) },
      context,
      { now: NOW }
    )
    expect(body.data[0].event_time).toBe(Math.floor(NOW.getTime() / 1000))
  })
})

describe('metaCapiConfig: when anything is sent', () => {
  const live = {
    token: 'EAAtoken',
    pixelId: '891710590692874',
    vercelEnv: 'production',
  }

  test('Production with a token sends', () => {
    expect(metaCapiConfig(live)).toEqual({
      token: 'EAAtoken',
      pixelId: '891710590692874',
    })
  })

  test('off when the token is unset', () => {
    expect(metaCapiConfig({ ...live, token: undefined })).toBeNull()
    expect(metaCapiConfig({ ...live, token: '' })).toBeNull()
  })

  test('off on previews, in development and locally, even holding the token', () => {
    expect(metaCapiConfig({ ...live, vercelEnv: 'preview' })).toBeNull()
    expect(metaCapiConfig({ ...live, vercelEnv: 'development' })).toBeNull()
    expect(metaCapiConfig({ ...live, vercelEnv: undefined })).toBeNull()
  })

  test('never with the E2E fakes on', () => {
    expect(metaCapiConfig({ ...live, testFakes: true })).toBeNull()
  })

  test('off with a Pixel id that is not a number', () => {
    expect(metaCapiConfig({ ...live, pixelId: '../me' })).toBeNull()
  })

  test('carries the test event code when set', () => {
    expect(metaCapiConfig({ ...live, testEventCode: 'TEST42' })).toEqual({
      token: 'EAAtoken',
      pixelId: '891710590692874',
      testEventCode: 'TEST42',
    })
  })
})

describe('sendPurchaseEvent', () => {
  const body = buildPurchaseEvent(facts, context, { now: NOW })

  test('one POST to the pinned Graph version, token in the body not the URL', async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      json({ events_received: 1, fbtrace_id: 'trace' })
    )
    expect(await sendPurchaseEvent(body, config, fetchImpl)).toBe('sent')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/891710590692874/events`
    )
    expect(calls[0].url).not.toContain('EAAtoken')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
    expect(calls[0].body).toEqual({ ...body, access_token: 'EAAtoken' })
  })

  test('test_event_code goes in the body when set', async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      json({ events_received: 1 })
    )
    const withCode = buildPurchaseEvent(facts, context, {
      now: NOW,
      testEventCode: 'TEST42',
    })
    await sendPurchaseEvent(withCode, config, fetchImpl)
    expect(calls[0].body.test_event_code).toBe('TEST42')
  })

  test('Meta refusing it is "failed", not a throw', async () => {
    const { fetchImpl } = recordingFetch(() =>
      json(
        { error: { type: 'OAuthException', code: 190, fbtrace_id: 't' } },
        400
      )
    )
    expect(await sendPurchaseEvent(body, config, fetchImpl)).toBe('failed')
  })

  test('a network error never throws', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed')
    }
    expect(await sendPurchaseEvent(body, config, fetchImpl)).toBe('failed')
  })

  test('a body that is not JSON never throws', async () => {
    const fetchImpl = async () => new Response('<html>', { status: 502 })
    expect(await sendPurchaseEvent(body, config, fetchImpl)).toBe('failed')
  })

  test('gives up at the timeout', async () => {
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason)
        )
      })
    const started = Date.now()
    expect(await sendPurchaseEvent(body, config, fetchImpl, 30)).toBe('failed')
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

describe('metaCapi.reportPurchase', () => {
  beforeEach(() => forgetReportedPurchases())

  test('off: no fetch and the booking is never read', async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      json({ events_received: 1 })
    )
    let loaded = 0
    metaCapi.reportPurchase(
      BOOKING,
      context,
      async () => {
        loaded++
        return facts
      },
      { config: null, fetch: fetchImpl, now: () => NOW }
    )
    await settle()
    expect(loaded).toBe(0)
    expect(calls).toHaveLength(0)
  })

  test('off by default here: no token in the test env', async () => {
    let loaded = 0
    metaCapi.reportPurchase(BOOKING, context, async () => {
      loaded++
      return facts
    })
    await settle()
    expect(loaded).toBe(0)
  })

  test('sends once per booking, however often verify is retried', async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      json({ events_received: 1 })
    )
    const deps = { config, fetch: fetchImpl, now: () => NOW }
    metaCapi.reportPurchase(BOOKING, context, async () => facts, deps)
    metaCapi.reportPurchase(BOOKING, context, async () => facts, deps)
    await settle()
    metaCapi.reportPurchase(BOOKING, context, async () => facts, deps)
    await settle()
    expect(calls).toHaveLength(1)
    expect(
      (calls[0].body.data as Array<{ event_id: string }>)[0].event_id
    ).toBe(`purchase-${BOOKING}`)
  })

  test('a failed send may be tried again by a later verify', async () => {
    let fail = true
    const { calls, fetchImpl } = recordingFetch(() =>
      fail ? json({}, 500) : json({ events_received: 1 })
    )
    const deps = { config, fetch: fetchImpl, now: () => NOW }
    metaCapi.reportPurchase(BOOKING, context, async () => facts, deps)
    await settle()
    fail = false
    metaCapi.reportPurchase(BOOKING, context, async () => facts, deps)
    await settle()
    expect(calls).toHaveLength(2)
  })

  test('nothing when the booking is not reportable, or paid over a day ago', async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      json({ events_received: 1 })
    )
    const deps = { config, fetch: fetchImpl, now: () => NOW }
    metaCapi.reportPurchase(BOOKING, context, async () => null, deps)
    metaCapi.reportPurchase(
      'e2e00000-0000-4000-8000-000000009002',
      context,
      async () => ({
        ...facts,
        paidAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000),
      }),
      deps
    )
    await settle()
    expect(calls).toHaveLength(0)
  })

  test('nothing without a user agent, which Meta requires', async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      json({ events_received: 1 })
    )
    metaCapi.reportPurchase(
      BOOKING,
      { ...context, userAgent: '  ' },
      async () => facts,
      { config, fetch: fetchImpl, now: () => NOW }
    )
    await settle()
    expect(calls).toHaveLength(0)
  })

  test('a loader that throws never reaches the caller', async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      json({ events_received: 1 })
    )
    expect(() =>
      metaCapi.reportPurchase(
        BOOKING,
        context,
        async () => {
          throw new Error('db down')
        },
        { config, fetch: fetchImpl, now: () => NOW }
      )
    ).not.toThrow()
    await settle()
    expect(calls).toHaveLength(0)
  })
})
