import { afterEach, describe, expect, test } from 'bun:test'
import { createTrackHub, type TrackedEvent } from '@repo/core/analytics'
import { CLIENT_EVENTS } from '@repo/core/analytics-events'
import { purchaseEventId } from '@repo/core/api/payments'
import {
  eventSourceUrl,
  installPixel,
  marketingContext,
  META_EVENT_NAMES,
  metaEventFor,
  MIRRORED_EVENTS,
  mirrorToMeta,
  PIXEL_ID,
  pixelExcluded,
  readCookie,
  trackPurchase,
  trackRegistration,
} from './meta-pixel'

const GARAGE = '2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10'
const BOOKING = '3f2a9c1b-0d4e-4a5b-8c6d-7e8f9a0b1c2d'

/** Our events as the core hub hands them on: only the props each may carry. */
function heard(name: TrackedEvent['name'], props?: object): TrackedEvent {
  const hub = createTrackHub()
  let event: TrackedEvent | null = null
  hub.subscribe((e) => (event = e))
  hub.emit(name, props)
  return event!
}

/** Things that must never reach Meta, offered as props on every event. */
const PERSONAL = {
  name: 'Ravi Kumar',
  phone: '9876543210',
  address: '12 Anna Salai, Chennai',
  email: 'ravi@example.com',
  bookingId: BOOKING,
  receipt: 'DET-2026-0001',
  code: 'GIFT-ABCD-EFGH',
  query: 'ravi kumar 98765',
}

describe('our events as Meta events', () => {
  test('the agreed mapping', () => {
    expect(
      metaEventFor(heard('search', { category: 'detailing', queryLength: 9 }))
    ).toEqual({
      method: 'track',
      name: 'Search',
      params: { content_category: 'detailing' },
    })
    expect(
      metaEventFor(heard('garage_view', { vendorId: GARAGE, mode: 'doorstep' }))
    ).toEqual({
      method: 'track',
      name: 'ViewContent',
      params: { content_type: 'product', content_ids: [GARAGE] },
    })
    expect(metaEventFor(heard('favourite_add', { vendorId: GARAGE }))).toEqual({
      method: 'track',
      name: 'AddToWishlist',
      params: { content_ids: [GARAGE] },
    })
    expect(
      metaEventFor(
        heard('service_add', { vendorId: GARAGE, category: 'coating' })
      )
    ).toEqual({
      method: 'track',
      name: 'AddToCart',
      params: { content_ids: [GARAGE], content_category: 'coating' },
    })
    expect(
      metaEventFor(
        heard('checkout_start', {
          vendorId: GARAGE,
          mode: 'dropin',
          serviceCount: 2,
        })
      )
    ).toEqual({
      method: 'track',
      name: 'InitiateCheckout',
      params: { num_items: 2 },
    })
    expect(
      metaEventFor(
        heard('pay_click', {
          vendorId: GARAGE,
          mode: 'dropin',
          serviceCount: 2,
          amountBucket: '500_999',
        })
      )
    ).toEqual({ method: 'track', name: 'AddPaymentInfo', params: {} })
    expect(metaEventFor(heard('slot_select', { vendorId: GARAGE }))).toEqual({
      method: 'trackCustom',
      name: 'SlotSelected',
      params: {},
    })
    expect(metaEventFor(heard('address_select', { vendorId: GARAGE }))).toEqual(
      {
        method: 'trackCustom',
        name: 'AddressSelected',
        params: {},
      }
    )
    expect(metaEventFor(heard('coupon_redeem', { source: 'camera' }))).toEqual({
      method: 'trackCustom',
      name: 'CouponRedeemed',
      params: { source: 'camera' },
    })
    expect(metaEventFor(heard('map_view', { mode: 'pickup' }))).toEqual({
      method: 'trackCustom',
      name: 'MapView',
      params: {},
    })
  })

  test('a search never sends its words, or even its length', () => {
    const meta = metaEventFor(
      heard('search', { queryLength: 12, ...PERSONAL })
    )!
    expect(meta.params).toEqual({})
    expect(JSON.stringify(meta)).not.toContain('12')
  })

  test('only the mirrored events go to Meta; the rest stay ours', () => {
    const mirrored = CLIENT_EVENTS.filter(
      (name) => metaEventFor({ name, props: { vendorId: GARAGE } }) !== null
    )
    expect(new Set(mirrored)).toEqual(new Set(MIRRORED_EVENTS))
    for (const name of [
      'app_open',
      'home_view',
      'review_submit',
      'complaint_submit',
      'help_view',
    ] as const) {
      expect(metaEventFor(heard(name, PERSONAL))).toBeNull()
    }
    // Without the garage they are about, the garage events say nothing.
    expect(metaEventFor({ name: 'garage_view' })).toBeNull()
    expect(metaEventFor({ name: 'service_add' })).toBeNull()
  })

  test('nothing personal passes, whatever a page hands in', () => {
    const forbidden = Object.values(PERSONAL)
    for (const name of CLIENT_EVENTS) {
      // Through the hub, as in the app…
      const viaHub = metaEventFor(
        heard(name, { vendorId: GARAGE, category: 'detailing', ...PERSONAL })
      )
      // …and straight in, as if the hub let something through.
      const direct = metaEventFor({
        name,
        props: { vendorId: GARAGE, ...PERSONAL } as Record<string, string>,
      })
      for (const meta of [viaHub, direct]) {
        const sent = JSON.stringify(meta)
        for (const value of forbidden) expect(sent).not.toContain(value)
        const keys = Object.keys(meta?.params ?? {})
        for (const key of keys) {
          expect([
            'content_category',
            'content_type',
            'content_ids',
            'num_items',
            'source',
          ]).toContain(key)
        }
      }
    }
    // A coupon's "how" is one of three words, never a code.
    expect(
      metaEventFor({ name: 'coupon_redeem', props: { source: 'GIFT-ABCD' } })!
        .params
    ).toEqual({})
  })

  test('every event name the code sends is in the declared list', () => {
    const names = new Set(
      CLIENT_EVENTS.flatMap((name) => {
        const meta = metaEventFor({ name, props: { vendorId: GARAGE } })
        return meta ? [meta.name] : []
      })
    )
    for (const name of names)
      expect(META_EVENT_NAMES).toContain(
        name as (typeof META_EVENT_NAMES)[number]
      )
  })
})

describe('where the Pixel stays off', () => {
  test('pages whose address holds a code, and sign-in on the way to one', () => {
    expect(pixelExcluded('/gift/ABCDEFGH', null)).toBe(true)
    expect(pixelExcluded('/login', '/gift/ABCDEFGH')).toBe(true)
    expect(pixelExcluded('/c/ABCD1234', null)).toBe(true)
    expect(pixelExcluded('/profile-setup', '/c/ABCD1234')).toBe(true)
    expect(pixelExcluded('/verify/AbCdEf', null)).toBe(true)
    expect(pixelExcluded('/home', null)).toBe(false)
    expect(pixelExcluded('/login', '/book/x')).toBe(false)
  })
})

describe('with a payment confirmation', () => {
  test('the event source is origin and path only', () => {
    expect(
      eventSourceUrl(
        `https://detlio.com/book/${GARAGE}?service=a&code=SAVE50#pay`
      )
    ).toBe(`https://detlio.com/book/${GARAGE}`)
    expect(eventSourceUrl('https://detlio.com/')).toBe('https://detlio.com/')
    expect(eventSourceUrl('http://localhost:3000/bookings/x?then=pay')).toBe(
      'http://localhost:3000/bookings/x'
    )
    expect(eventSourceUrl('https://user:pass@detlio.com/a?b')).toBe(
      'https://detlio.com/a'
    )
    expect(eventSourceUrl('javascript:alert(1)')).toBeUndefined()
    expect(eventSourceUrl('not a url')).toBeUndefined()
  })

  test('Meta cookies are read by name', () => {
    const cookies =
      'detlio_consent=marketing; _fbp=fb.1.1700000000000.123; _fbc=fb.1.1700000000000.Iw%3D%3D'
    expect(readCookie(cookies, '_fbp')).toBe('fb.1.1700000000000.123')
    expect(readCookie(cookies, '_fbc')).toBe('fb.1.1700000000000.Iw==')
    expect(readCookie(cookies, '_fb')).toBeUndefined()
    expect(readCookie('', '_fbp')).toBeUndefined()
  })

  test('sent only with consent, and then with what the browser holds', () => {
    const href = `https://detlio.com/book/${GARAGE}?service=a&code=SAVE50`
    const cookieString = '_fbp=fb.1.2.3; _fbc=fb.1.2.abc; access_token=secret'
    expect(
      marketingContext({ allowed: false, cookieString, href })
    ).toBeUndefined()
    expect(marketingContext({ allowed: true, cookieString, href })).toEqual({
      consent: true,
      fbp: 'fb.1.2.3',
      fbc: 'fb.1.2.abc',
      eventSourceUrl: `https://detlio.com/book/${GARAGE}`,
    })
    // No Meta cookies yet (fbevents.js still loading): consent alone.
    expect(marketingContext({ allowed: true, cookieString: '', href })).toEqual(
      {
        consent: true,
        eventSourceUrl: `https://detlio.com/book/${GARAGE}`,
      }
    )
  })
})

describe('in the browser', () => {
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  type Calls = unknown[][]

  function fakeBrowser(
    cookie: string,
    pathname = `/book/${GARAGE}`,
    search = ''
  ) {
    g.document = { cookie }
    const win: Record<string, unknown> & {
      fbq?: { queue: Calls; disablePushState?: boolean }
    } = {
      location: {
        pathname,
        search,
        href: `https://detlio.com${pathname}${search}`,
        protocol: 'https:',
      },
    }
    g.window = win
    return win
  }

  afterEach(() => {
    delete g.window
    delete g.document
  })

  test("installs Meta's queue with automatic events and page views off", () => {
    const win = {} as Parameters<typeof installPixel>[0]
    expect(installPixel(win)).toBe(true)
    expect(installPixel(win)).toBe(false)
    const fbq = (
      win as unknown as { fbq: { queue: Calls; disablePushState: boolean } }
    ).fbq
    expect(fbq.disablePushState).toBe(true)
    expect(fbq.queue).toEqual([
      ['set', 'autoConfig', false, PIXEL_ID],
      ['init', PIXEL_ID],
    ])
  })

  test('with consent: mapped events, Purchase with its shared id, and CompleteRegistration', () => {
    const win = fakeBrowser('detlio_consent=marketing')
    mirrorToMeta(heard('checkout_start', { vendorId: GARAGE, serviceCount: 2 }))
    mirrorToMeta(heard('home_view'))
    trackPurchase({ bookingId: BOOKING, rupeesPaid: 1299.5, numItems: 2 })
    trackRegistration()
    expect(win.fbq!.queue.slice(2)).toEqual([
      ['track', 'InitiateCheckout', { num_items: 2 }],
      [
        'track',
        'Purchase',
        { value: 1299.5, currency: 'INR', num_items: 2 },
        { eventID: purchaseEventId(BOOKING) },
      ],
      ['track', 'CompleteRegistration', {}],
    ])
  })

  test('a booking paid entirely with credit is no Purchase', () => {
    const win = fakeBrowser('detlio_consent=marketing')
    trackPurchase({ bookingId: BOOKING, rupeesPaid: 0, numItems: 1 })
    expect(win.fbq).toBeUndefined()
  })

  test('without consent, or before a choice, nothing is put on the page', () => {
    for (const cookie of ['detlio_consent=essential', '']) {
      const win = fakeBrowser(cookie)
      mirrorToMeta(heard('garage_view', { vendorId: GARAGE }))
      trackPurchase({ bookingId: BOOKING, rupeesPaid: 499, numItems: 1 })
      trackRegistration()
      expect(win.fbq).toBeUndefined()
    }
  })

  test('nothing on a page the Pixel stays off, even with consent', () => {
    const win = fakeBrowser('detlio_consent=marketing', '/c/ABCD1234')
    mirrorToMeta(heard('coupon_redeem', { source: 'link' }))
    expect(win.fbq).toBeUndefined()
    const signIn = fakeBrowser(
      'detlio_consent=marketing',
      '/profile-setup',
      '?next=%2Fgift%2FABCDEFGH'
    )
    trackRegistration()
    expect(signIn.fbq).toBeUndefined()
  })
})
