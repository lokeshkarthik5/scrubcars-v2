/**
 * What the customer app may record about a visit, for the admin's Funnel.
 * The twin of apps/server/src/lib/analytics.ts, which refuses anything else
 * (apps/server/src/lib/analytics.parity.test.ts keeps the two the same).
 *
 * No personal data and no free text: an event is a name from the list and a
 * few props of fixed shapes. A search sends how long the text was, never
 * the text.
 */

export const CLIENT_EVENTS = [
  'app_open',
  'home_view',
  'garage_list_view',
  'search',
  'map_view',
  'garage_view',
  'service_add',
  'checkout_start',
  'slot_select',
  'address_select',
  'pay_click',
  'review_submit',
  'complaint_submit',
  'help_view',
  'favourite_add',
  'favourite_remove',
  // 0056: a printed coupon's page opened, and a coupon added (source: link, typed, camera).
  'coupon_scan',
  'coupon_redeem',
  // 0061: the landing → paid steps of admin's Statistics → Behaviour.
  'landing_view',
  'garage_card_seen',
  'area_pick',
  'mode_switch',
  'service_sheet_open',
  'booking_start',
  'otp_sent',
  'pay_success',
  'pay_failed',
  // 0061, named now for the landing page's next release (not sent yet).
  'request_sent',
  'free_wash_claim',
  'banner_view',
  'banner_close',
] as const

export type ClientEventName = (typeof CLIENT_EVENTS)[number]

export const BOOKING_MODES = ['dropin', 'doorstep', 'pickup'] as const
export type BookingMode = (typeof BOOKING_MODES)[number]

export const BROWSE_CATEGORIES = [
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'others',
  'package',
] as const
export type BrowseCategory = (typeof BROWSE_CATEGORIES)[number]

export const AMOUNT_BUCKETS = ['under_500', '500_999', '1000_1999', '2000_4999', '5000_plus'] as const
export type AmountBucket = (typeof AMOUNT_BUCKETS)[number]

/** A price as a band, never the amount: rupees, lower bound included. */
export function amountBucket(rupees: number): AmountBucket {
  if (!(rupees >= 500)) return 'under_500'
  if (rupees < 1000) return '500_999'
  if (rupees < 2000) return '1000_1999'
  if (rupees < 5000) return '2000_4999'
  return '5000_plus'
}

export const EVENT_STEPS = ['booking', 'contact'] as const

export const DEVICE_CLASSES = ['phone', 'tablet', 'desktop'] as const
export type DeviceClass = (typeof DEVICE_CLASSES)[number]

/** Phone, tablet or desktop from the window's width in CSS pixels, nothing else. */
export function deviceClass(viewportWidth: number): DeviceClass {
  if (viewportWidth < 640) return 'phone'
  if (viewportWidth < 1024) return 'tablet'
  return 'desktop'
}

/**
 * Where a visit came from, sorted for the Behaviour tab's Source filter:
 * Instagram (its app's browser, a link from it, or utm_source), Google,
 * Facebook, WhatsApp, Direct (no referrer and no campaign) or Other.
 */
export const CHANNELS = ['instagram', 'google', 'facebook', 'whatsapp', 'direct', 'other'] as const
export type Channel = (typeof CHANNELS)[number]

/** The props each event may carry, with their shapes. */
export interface EventProps {
  /**
   * The visit's first page view, once per visit: where it came from. The
   * page it opened on is the event's own path.
   */
  app_open: {
    source?: string
    medium?: string
    campaign?: string
    /** The referring site's domain, never its full address. */
    referrer?: string
    channel?: Channel
  }
  home_view: Record<string, never>
  garage_list_view: { mode?: BookingMode; category?: BrowseCategory }
  search: { category?: BrowseCategory; queryLength?: number }
  map_view: { mode?: BookingMode }
  garage_view: { vendorId: string; mode?: BookingMode }
  service_add: { vendorId: string; category?: BrowseCategory }
  checkout_start: { vendorId: string; mode?: BookingMode; serviceCount?: number }
  slot_select: { vendorId: string; mode?: BookingMode }
  address_select: { vendorId: string; mode?: BookingMode }
  pay_click: { vendorId: string; mode?: BookingMode; serviceCount?: number; amountBucket?: AmountBucket }
  review_submit: { vendorId?: string }
  complaint_submit: { step?: (typeof EVENT_STEPS)[number] }
  help_view: { step?: (typeof EVENT_STEPS)[number] }
  favourite_add: { vendorId: string }
  favourite_remove: { vendorId: string }
  coupon_scan: Record<string, never>
  /** How it was added: the QR's link, typed, or the camera in Profile. */
  coupon_redeem: { source?: 'link' | 'typed' | 'camera' }
  /** The marketing homepage, detlio.com/. */
  landing_view: Record<string, never>
  /** A garage card was on screen in a list, once per visit. */
  garage_card_seen: { mode?: BookingMode }
  /** An area chip or "Near me" picked (a slug such as anna-nagar or near-me). */
  area_pick: { area?: string; mode?: BookingMode }
  /** At garage / Doorstep / Pickup switched to. */
  mode_switch: { mode: BookingMode }
  /** A service's details sheet opened on a garage's page. */
  service_sheet_open: { vendorId: string; category?: BrowseCategory }
  /** Book Now pressed on a garage's page, signed in or not. */
  booking_start: { vendorId: string; mode?: BookingMode; serviceCount?: number }
  /** A sign-in code was sent to the number typed: that one was, never which. */
  otp_sent: Record<string, never>
  /** The payment went through and the booking is made. */
  pay_success: { vendorId: string; mode?: BookingMode; serviceCount?: number; amountBucket?: AmountBucket }
  /** Razorpay refused the payment, or it could not be confirmed. */
  pay_failed: { vendorId: string; mode?: BookingMode }
  request_sent: { vendorId?: string; mode?: BookingMode }
  free_wash_claim: Record<string, never>
  /** Which banner, as a slug. */
  banner_view: { banner?: string }
  banner_close: { banner?: string }
}

/** The keys each event may carry; the server refuses any other. */
export const EVENT_PROPS: { [K in ClientEventName]: ReadonlyArray<keyof EventProps[K] & string> } = {
  app_open: ['source', 'medium', 'campaign', 'referrer', 'channel'],
  home_view: [],
  garage_list_view: ['mode', 'category'],
  search: ['category', 'queryLength'],
  map_view: ['mode'],
  garage_view: ['vendorId', 'mode'],
  service_add: ['vendorId', 'category'],
  checkout_start: ['vendorId', 'mode', 'serviceCount'],
  slot_select: ['vendorId', 'mode'],
  address_select: ['vendorId', 'mode'],
  pay_click: ['vendorId', 'mode', 'serviceCount', 'amountBucket'],
  review_submit: ['vendorId'],
  complaint_submit: ['step'],
  help_view: ['step'],
  favourite_add: ['vendorId'],
  favourite_remove: ['vendorId'],
  coupon_scan: [],
  coupon_redeem: ['source'],
  landing_view: [],
  garage_card_seen: ['mode'],
  area_pick: ['area', 'mode'],
  mode_switch: ['mode'],
  service_sheet_open: ['vendorId', 'category'],
  booking_start: ['vendorId', 'mode', 'serviceCount'],
  otp_sent: [],
  pay_success: ['vendorId', 'mode', 'serviceCount', 'amountBucket'],
  pay_failed: ['vendorId', 'mode'],
  request_sent: ['vendorId', 'mode'],
  free_wash_claim: [],
  banner_view: ['banner'],
  banner_close: ['banner'],
}

/** The most events one request carries (the server refuses more). */
export const MAX_EVENTS_PER_BATCH = 25

export const MAX_PATH_LENGTH = 200

/** A campaign source (utm_source) as we keep it: a short lowercase slug. */
export const SOURCE_PATTERN = /^[a-z0-9_.-]{1,32}$/

/** utm_source from a page's query string, or nothing if it isn't a plain slug. */
export function campaignSource(search: string): string | undefined {
  return utmValue(search, 'utm_source', SOURCE_PATTERN)
}

/** A campaign name (utm_campaign) as we keep it: a lowercase slug, a little longer. */
export const CAMPAIGN_PATTERN = /^[a-z0-9_.-]{1,64}$/

/** A referring site as we keep it: its domain only, lowercase, never its path. */
export const REFERRER_PATTERN = /^(?=.{1,64}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** An area or banner name: a short slug the app itself chose (anna-nagar, near-me). */
export const SLUG_PATTERN = /^[a-z0-9-]{1,40}$/

/**
 * One utm_ value, lowercased; nothing if it isn't a plain slug. Never
 * "cleaned up" into one: "my friend Ravi" is dropped, not kept as
 * my_friend_ravi.
 */
function utmValue(search: string, key: string, pattern: RegExp): string | undefined {
  try {
    const value = new URLSearchParams(search).get(key)?.trim().toLowerCase()
    return value && pattern.test(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * The referring site's domain (no www.), or nothing: no referrer, one that
 * isn't http(s), or our own site (moving between our pages is not a source).
 * Never the referrer's path or query, which can carry a search or an id.
 */
export function referrerDomain(referrer: string, ownHost: string): string | undefined {
  if (!referrer) return undefined
  try {
    const url = new URL(referrer)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const own = ownHost.toLowerCase().replace(/^www\./, '')
    if (host === own || host.endsWith(`.${own}`)) return undefined
    return REFERRER_PATTERN.test(host) ? host : undefined
  } catch {
    return undefined
  }
}

const isDomainOf = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)

/**
 * The channel a visit came from, for the Source filter. The campaign source
 * wins when there is one; then the referring site; then Instagram's own
 * in-app browser, which often sends no referrer (it says "Instagram" in its
 * user agent; only that word is read, the user agent is never kept).
 */
export function visitChannel(input: { source?: string; referrer?: string; userAgent?: string }): Channel {
  const source = input.source ?? ''
  const host = input.referrer ?? ''
  const userAgent = input.userAgent ?? ''
  if (source) {
    if (/^(ig|insta)/.test(source)) return 'instagram'
    if (/^(fb|facebook|meta)/.test(source)) return 'facebook'
    if (/^google/.test(source)) return 'google'
    if (/^(wa|whatsapp)/.test(source)) return 'whatsapp'
    return 'other'
  }
  if (host) {
    if (isDomainOf(host, 'instagram.com')) return 'instagram'
    if (isDomainOf(host, 'facebook.com') || host === 'fb.me') return 'facebook'
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google'
    if (isDomainOf(host, 'whatsapp.com') || host === 'wa.me') return 'whatsapp'
    return 'other'
  }
  if (/\bInstagram\b/i.test(userAgent)) return 'instagram'
  if (/FBAN|FBAV/.test(userAgent)) return 'facebook'
  return 'direct'
}

/**
 * What app_open says about where a visit came from: the utm_ tags, the
 * referring domain and the channel those add up to. Read once, when the
 * visit starts; the first page is the event's own path.
 */
export function visitAttribution(input: {
  search: string
  referrer: string
  userAgent: string
  ownHost: string
}): EventProps['app_open'] {
  const source = campaignSource(input.search)
  const medium = utmValue(input.search, 'utm_medium', SOURCE_PATTERN)
  const campaign = utmValue(input.search, 'utm_campaign', CAMPAIGN_PATTERN)
  const referrer = referrerDomain(input.referrer, input.ownHost)
  const out: EventProps['app_open'] = {
    channel: visitChannel({ source, referrer, userAgent: input.userAgent }),
  }
  if (source) out.source = source
  if (medium) out.medium = medium
  if (campaign) out.campaign = campaign
  if (referrer) out.referrer = referrer
  return out
}

/** A category from the app's filters, or nothing for "All" or anything unknown. */
export function browseCategory(value: string | null | undefined): BrowseCategory | undefined {
  return BROWSE_CATEGORIES.find((category) => category === value)
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A page's path as it is sent: no query string or hash, every id replaced
 * by ":id" (a booking's id is a way back to a person), a gift link's code
 * by ":code" (0049: the code is the gift; only its hash is ever stored), a
 * printed coupon's (/c/<code>, 0056) likewise,
 * a shared certificate's token by ":token" (0053, likewise), anything but
 * plain path characters dropped, at most MAX_PATH_LENGTH characters.
 */
export function cleanPath(raw: string): string {
  const path = raw.split(/[?#]/)[0] ?? ''
  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment, index, all) =>
      index > 0 && (all[index - 1] === 'gift' || (all[index - 1] === 'c' && index === 1))
        ? ':code'
        : index > 0 && all[index - 1] === 'verify'
          ? ':token'
          : UUID_SEGMENT.test(segment)
            ? ':id'
            : segment.replace(/[^A-Za-z0-9_-]/g, '')
    )
    .filter((segment) => segment.length > 0)
  return `/${segments.join('/')}`.slice(0, MAX_PATH_LENGTH)
}
