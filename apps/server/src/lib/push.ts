/**
 * Browser notifications (Web Push, 0044): the pure rules. What a message is,
 * which subscriptions may be stored and sent to, and what a push service's
 * answer means. No env, no database, no network, so every rule is
 * unit-tested; lib/web-push.ts sends, modules/push stores and decides who.
 *
 * Owner decision (17 Oct 2026): garages and customers get free browser
 * notifications for now (SMS costs money, WhatsApp needs Meta's approval).
 * Native app push (FCM/APNs) comes later as another sender behind the same
 * `notify` (modules/push/push.service.ts); a message is written once, for
 * every channel.
 */

export const PUSH_AUDIENCES = ['customer', 'garage'] as const
/** Which app a subscription came from: detlio.com or vendor.detlio.com. */
export type PushAudience = (typeof PUSH_AUDIENCES)[number]

/**
 * Notifications the cron sends on a schedule, at most once per booking each
 * (notification_sends): the customer's reminders the evening before and an
 * hour before, and the garage's "accept within 10 min".
 */
export const SCHEDULED_PUSH_KINDS = ['day_before', 'hour_before', 'respond_soon'] as const
export type ScheduledPushKind = (typeof SCHEDULED_PUSH_KINDS)[number]

/**
 * What a customer's notification is about, for their two switches: news
 * about a booking ("Booking updates") or a reminder before one
 * ("Reminders"). A test is sent whatever the switches say: it was asked for.
 */
export type PushCategory = 'booking_update' | 'reminder' | 'test'

/**
 * One notification, as every channel sends it. Booking basics only: the
 * garage's name, the service, the time, an amount. Never a customer's
 * phone, address, name, car number, a pickup code or anything typed by a
 * person (notes, reasons, extra-work descriptions): a notification shows on
 * a lock screen, and its text passes through the push service.
 */
export interface PushMessage {
  title: string
  body: string
  /** An app path to open on tap ("/bookings/…"), never another site. */
  url: string
  /**
   * Replaces an earlier notification with the same tag on the device, so a
   * booking's news does not pile up ("booking:<id>").
   */
  tag: string
  category: PushCategory
  /**
   * How long the push service keeps trying a phone that is off. A reminder
   * an hour before a slot is no use after the slot.
   */
  ttlSeconds: number
  /** 'high' wakes a phone in battery saver: new bookings and their clock. */
  urgency: 'normal' | 'high'
}

/** Four hours: a booking's news is still worth having when the phone is back on. */
export const DEFAULT_TTL_SECONDS = 4 * 60 * 60

/** What the service worker receives: no category or delivery settings. */
export function pushPayload(message: PushMessage): string {
  return JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag,
  })
}

/**
 * The push services browsers use, by host. A subscription's endpoint is a
 * URL the API will POST to, so anything else is refused when it is stored
 * (and again before a send): otherwise "subscribing" a URL inside our own
 * network would make the server call it.
 *
 * - Chrome, Edge on Android, Samsung Internet, Opera, Brave: Firebase Cloud
 *   Messaging (fcm.googleapis.com, and the older android.googleapis.com).
 * - Firefox: Mozilla's autopush (updates.push.services.mozilla.com).
 * - Safari on macOS and iPhone/iPad (16.4+, Home Screen apps): Apple
 *   (web.push.apple.com).
 * - Edge on Windows: Windows Push Notification Services (*.notify.windows.com).
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'web.push.apple.com']
const PUSH_HOST_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com']

export const MAX_ENDPOINT_LENGTH = 1024

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

/**
 * The browser's public key (p256dh: an uncompressed P-256 point, 65 bytes,
 * 87 characters of base64url) and its auth secret (16 bytes, 22 characters).
 * Loose bounds, since some browsers pad, but nothing that could not be a key.
 */
export function isValidSubscriptionKeys(keys: { p256dh: string; auth: string }): boolean {
  return (
    BASE64URL.test(keys.p256dh) &&
    keys.p256dh.length >= 86 &&
    keys.p256dh.length <= 90 &&
    BASE64URL.test(keys.auth) &&
    keys.auth.length >= 16 &&
    keys.auth.length <= 30
  )
}

/**
 * "Chrome on Android": enough for someone to tell their devices apart on the
 * Notifications screen. The raw user agent is never stored.
 */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const ua = userAgent
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /CrOS/.test(ua)
            ? 'Chromebook'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
  const browser = /SamsungBrowser/.test(ua)
    ? 'Samsung Internet'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os
}

/** What one send came to. */
export type SendResult =
  | { kind: 'sent' }
  /** The browser dropped the subscription (404/410): delete it. */
  | { kind: 'gone' }
  /** Anything else: kept, counted, and logged without the endpoint. */
  | { kind: 'failed'; status: number | null }

/**
 * What a push service's answer means. 404 and 410 are the spec's "this
 * subscription no longer exists"; every other failure (429, 5xx, a
 * timeout, a bad key) may pass, so the subscription stays.
 */
export function classifySendFailure(status: number | null | undefined): SendResult {
  if (status === 404 || status === 410) return { kind: 'gone' }
  return { kind: 'failed', status: typeof status === 'number' ? status : null }
}

/**
 * After this many failures in a row (none of them 404/410), a subscription
 * is dropped too: a browser that has been unreachable that long is gone.
 */
export const MAX_SEND_FAILURES = 10

/** At most this many devices per person per app (and garage); the oldest go. */
export const MAX_SUBSCRIPTIONS_PER_USER = 10

/**
 * Whether a customer wants this message, from their two switches. A
 * garage's devices have no switches: their alerts are the job.
 */
export function customerWants(
  category: PushCategory,
  prefs: { pushBookingUpdates: boolean; pushReminders: boolean }
): boolean {
  if (category === 'test') return true
  if (category === 'reminder') return prefs.pushReminders
  return prefs.pushBookingUpdates
}

/**
 * Whether browser notifications are on: the VAPID key pair and the contact
 * address (a `mailto:` or https URL push services may use to reach us) are
 * all set, or the E2E stand-in (PUSH_FAKE) is on with a public key for the
 * browser. Off, every push route but `/config` is a 404, the apps hide the
 * screens, and nothing is read or sent.
 */
export function isPushConfigured(config: {
  publicKey?: string
  privateKey?: string
  subject?: string
  fake?: boolean
}): boolean {
  if (!config.publicKey) return false
  if (config.fake) return true
  if (!config.privateKey || !config.subject) return false
  return /^mailto:\S+@\S+$/.test(config.subject) || config.subject.startsWith('https://')
}
