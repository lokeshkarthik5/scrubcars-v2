/**
 * Detlio's Meta Pixel, as data and small functions: which pages it stays off,
 * how it starts, which of our own events it hears about and what it is told.
 * components/meta-pixel.tsx mounts it; components/analytics.tsx passes it our
 * usage events (packages/core/src/analytics.ts `onTrack`).
 *
 * Nothing here sends anything unless the customer allowed marketing cookies
 * (lib/consent.ts), and never on a page whose address holds a code. Meta is
 * never sent a name, phone, address, email, booking or receipt number, a
 * gift or coupon code, or search text: every event below is built from an
 * allow-list of fixed props (`metaEventFor`), never from what a page passes.
 */
import type { ClientEventName } from '@repo/core/analytics-events'
import type { TrackedEvent } from '@repo/core/analytics'
import type { MarketingConsentContext } from '@repo/core/api/payments'
import { purchaseEventId } from '@repo/core/api/payments'
import { isVerifyPath } from '@repo/core/service-history-certificate'
import { carriesGiftCode } from './gifts'
import { carriesCouponCode } from './coupons'
import { marketingAllowed } from './consent'

/** Detlio's Meta Pixel. Public by design — it ships in the page. */
export const PIXEL_ID = '891710590692874'

export const PIXEL_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js'

/** The id of the script tag that loads fbevents.js, so it is added once. */
export const PIXEL_SCRIPT_ID = 'meta-pixel-js'

/**
 * Pages the Pixel stays off: a gift's page (/gift/<code>, 0049) and sign-in
 * on the way to it (?next=/gift/<code>), a printed coupon's page (/c/<code>,
 * 0056) likewise, and a shared Service History certificate (/verify/<token>,
 * 0053). The code is the gift, the coupon or the car's record, and Meta is
 * sent the page's full address.
 */
export function pixelExcluded(
  pathname: string | null,
  next: string | null
): boolean {
  return (
    carriesGiftCode(pathname, next) ||
    carriesCouponCode(pathname, next) ||
    isVerifyPath(pathname)
  )
}

/** The same, for the page the browser is on now. */
export function currentPageExcluded(): boolean {
  try {
    const next = new URLSearchParams(window.location.search).get('next')
    return pixelExcluded(window.location.pathname, next)
  } catch {
    return true
  }
}

// ─── Our events, as Meta's ───────────────────────────────────────────────────

export type MetaParams = Record<string, string | number | string[]>

export interface MetaEvent {
  /** 'track' for Meta's standard events, 'trackCustom' for our own names. */
  method: 'track' | 'trackCustom'
  name: string
  params: MetaParams
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** Drops unset values, so Meta sees only what we chose to send. */
function compact(
  params: Record<string, string | number | string[] | undefined>
): MetaParams {
  const out: MetaParams = {}
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) out[key] = value
  return out
}

/**
 * The Meta event for one of ours, or null for the ones Meta is not told
 * about. Each builds its params from named props only: a garage's id (the
 * page Meta already sees), a browse category, a count, how a coupon was
 * added. Never search text (our search event carries only its length, and
 * not even that goes to Meta), never a price band or anything else.
 */
export function metaEventFor(event: TrackedEvent): MetaEvent | null {
  const props = event.props ?? {}
  const vendorId = str(props.vendorId)
  switch (event.name) {
    case 'search':
      return {
        method: 'track',
        name: 'Search',
        params: compact({ content_category: str(props.category) }),
      }
    case 'garage_view':
      return vendorId
        ? {
            method: 'track',
            name: 'ViewContent',
            params: { content_type: 'product', content_ids: [vendorId] },
          }
        : null
    case 'favourite_add':
      return vendorId
        ? {
            method: 'track',
            name: 'AddToWishlist',
            params: { content_ids: [vendorId] },
          }
        : null
    case 'service_add':
      return vendorId
        ? {
            method: 'track',
            name: 'AddToCart',
            params: compact({
              content_ids: [vendorId],
              content_category: str(props.category),
            }),
          }
        : null
    case 'checkout_start':
      return {
        method: 'track',
        name: 'InitiateCheckout',
        params: compact({ num_items: num(props.serviceCount) }),
      }
    case 'pay_click':
      return { method: 'track', name: 'AddPaymentInfo', params: {} }
    case 'slot_select':
      return { method: 'trackCustom', name: 'SlotSelected', params: {} }
    case 'address_select':
      return { method: 'trackCustom', name: 'AddressSelected', params: {} }
    case 'coupon_redeem': {
      const source = str(props.source)
      return {
        method: 'trackCustom',
        name: 'CouponRedeemed',
        params:
          source === 'link' || source === 'typed' || source === 'camera'
            ? { source }
            : {},
      }
    }
    case 'map_view':
      return { method: 'trackCustom', name: 'MapView', params: {} }
    default:
      return null
  }
}

/** Our events Meta hears about, for the privacy policy's test. */
export const MIRRORED_EVENTS: readonly ClientEventName[] = [
  'search',
  'garage_view',
  'favourite_add',
  'service_add',
  'checkout_start',
  'pay_click',
  'slot_select',
  'address_select',
  'coupon_redeem',
  'map_view',
]

/** Every Meta event name the app can send, mirrored or sent directly. */
export const META_EVENT_NAMES = [
  'PageView',
  'Search',
  'ViewContent',
  'AddToWishlist',
  'AddToCart',
  'InitiateCheckout',
  'AddPaymentInfo',
  'SlotSelected',
  'AddressSelected',
  'CouponRedeemed',
  'MapView',
  'Purchase',
  'CompleteRegistration',
] as const

// ─── The browser ─────────────────────────────────────────────────────────────

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: Fbq
  loaded: boolean
  version: string
  disablePushState?: boolean
}

type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq }

/**
 * Puts Meta's `fbq` on the page and starts the Pixel: Meta's base snippet,
 * without the script tag (loadPixelScript adds that once the page is idle),
 * so calls made before fbevents.js arrives wait in its queue. Also:
 * - `disablePushState`: no automatic page view on a client navigation, so
 *   the Pixel never reports a page it is kept off (MetaPixel sends the page
 *   views itself, and skips those);
 * - `autoConfig` off: no automatic button-click or page-metadata events,
 *   which read text off the page.
 * Returns false when it was already on the page.
 */
export function installPixel(
  win: PixelWindow = window as PixelWindow
): boolean {
  if (win.fbq) return false
  const fbq = function (...args: unknown[]) {
    // As Meta's snippet: fbevents.js sets callMethod once it has loaded.
    if (fbq.callMethod) fbq.callMethod.call(fbq, ...args)
    else fbq.queue.push(args)
  } as Fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  fbq.disablePushState = true
  win.fbq = fbq
  if (!win._fbq) win._fbq = fbq
  fbq('set', 'autoConfig', false, PIXEL_ID)
  fbq('init', PIXEL_ID)
  return true
}

/** Adds the fbevents.js script tag, once. */
export function loadPixelScript(doc: Document = document) {
  if (doc.getElementById(PIXEL_SCRIPT_ID)) return
  const script = doc.createElement('script')
  script.id = PIXEL_SCRIPT_ID
  script.async = true
  script.src = PIXEL_SCRIPT_URL
  doc.head.appendChild(script)
}

/**
 * Sends one event to Meta, if the customer allowed it and this page is not
 * one the Pixel stays off. Never throws.
 */
export function sendToMeta(
  method: 'track' | 'trackCustom',
  name: string,
  params: MetaParams = {},
  options?: { eventID: string }
) {
  try {
    if (
      typeof window === 'undefined' ||
      !marketingAllowed() ||
      currentPageExcluded()
    )
      return
    installPixel()
    const fbq = (window as PixelWindow).fbq
    if (!fbq) return
    if (options) fbq(method, name, params, options)
    else fbq(method, name, params)
  } catch {
    // Never let a measurement break the page.
  }
}

/** The listener components/analytics.tsx gives `onTrack`. */
export function mirrorToMeta(event: TrackedEvent) {
  const meta = metaEventFor(event)
  if (meta) sendToMeta(meta.method, meta.name, meta.params)
}

/**
 * A paid booking, right after its payment is confirmed: what was paid
 * through Razorpay (rupees), how many services, and the event id the API's
 * Conversions API report uses too, so Meta counts the booking once.
 */
export function trackPurchase(input: {
  bookingId: string
  rupeesPaid: number
  numItems: number
}) {
  if (!(input.rupeesPaid > 0)) return
  sendToMeta(
    'track',
    'Purchase',
    {
      value: Math.round(input.rupeesPaid * 100) / 100,
      currency: 'INR',
      num_items: input.numItems,
    },
    { eventID: purchaseEventId(input.bookingId) }
  )
}

/** A new customer finished setting up their account. Nothing about them. */
export function trackRegistration() {
  sendToMeta('track', 'CompleteRegistration', {})
}

// ─── With a payment confirmation ─────────────────────────────────────────────

/** One cookie's value from a `document.cookie` string. */
export function readCookie(
  cookieString: string,
  name: string
): string | undefined {
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue
    const value = part.slice(eq + 1).trim()
    if (!value) return undefined
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return undefined
}

/** A page's address without its query string or fragment: origin and path only. */
export function eventSourceUrl(href: string): string | undefined {
  try {
    const url = new URL(href)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return `${url.origin}${url.pathname}`
  } catch {
    return undefined
  }
}

/**
 * What goes with a payment confirmation for the API's Conversions API report
 * (packages/core/src/api/payments.ts `MarketingConsentContext`), built from
 * what the browser holds. Undefined, so the field is left out, unless the
 * customer allowed marketing cookies.
 */
export function marketingContext(input: {
  allowed: boolean
  cookieString: string
  href: string
}): MarketingConsentContext | undefined {
  if (!input.allowed) return undefined
  const context: MarketingConsentContext = { consent: true }
  const fbp = readCookie(input.cookieString, '_fbp')
  const fbc = readCookie(input.cookieString, '_fbc')
  const source = eventSourceUrl(input.href)
  if (fbp) context.fbp = fbp
  if (fbc) context.fbc = fbc
  if (source) context.eventSourceUrl = source
  return context
}

/** The same, from this page. */
export function currentMarketingContext(): MarketingConsentContext | undefined {
  try {
    return marketingContext({
      allowed: marketingAllowed() && !currentPageExcluded(),
      cookieString: document.cookie,
      href: window.location.href,
    })
  } catch {
    return undefined
  }
}
