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
  // 0055: a printed coupon's page opened, and a coupon added (source: link, typed, camera).
  'coupon_scan',
  'coupon_redeem',
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

/** The props each event may carry, with their shapes. */
export interface EventProps {
  app_open: { source?: string }
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
}

/** The keys each event may carry; the server refuses any other. */
export const EVENT_PROPS: { [K in ClientEventName]: ReadonlyArray<keyof EventProps[K] & string> } = {
  app_open: ['source'],
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
}

/** The most events one request carries (the server refuses more). */
export const MAX_EVENTS_PER_BATCH = 25

export const MAX_PATH_LENGTH = 200

/** A campaign source (utm_source) as we keep it: a short lowercase slug. */
export const SOURCE_PATTERN = /^[a-z0-9_.-]{1,32}$/

/** utm_source from a page's query string, or nothing if it isn't a plain slug. */
export function campaignSource(search: string): string | undefined {
  try {
    const value = new URLSearchParams(search).get('utm_source')?.trim().toLowerCase()
    return value && SOURCE_PATTERN.test(value) ? value : undefined
  } catch {
    return undefined
  }
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
 * printed coupon's (/c/<code>, 0055) likewise,
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
