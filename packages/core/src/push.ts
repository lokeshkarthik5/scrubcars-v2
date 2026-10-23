import { removePushSubscription, type PushApp } from '@repo/core/api/push'

/**
 * Browser notifications in the browser (0044): can this one take them, and
 * turning them on and off. Shared by the customer app and the garage portal,
 * each with its own minimal service worker at /sw.js, which only shows a
 * notification and opens its page on tap (no offline caching, no fetch
 * handler: pages load exactly as before).
 *
 * The service worker is registered only when someone turns notifications
 * on, never on a page load.
 */

/**
 * - `supported`: can be turned on here.
 * - `ios_install`: an iPhone or iPad browser tab. iOS (16.4+) gives push
 *   only to a web app added to the Home Screen and opened from there.
 * - `denied`: the person blocked notifications for this site; only the
 *   browser's own settings can undo it.
 * - `unsupported`: this browser has no push at all.
 */
export type PushSupport = 'supported' | 'ios_install' | 'denied' | 'unsupported'

export const SERVICE_WORKER_PATH = '/sw.js'

/** What `pushSupport` reads, so the rule is tested without a browser. */
export interface PushEnvironment {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  isIos: boolean
  /** Opened from the Home Screen (display-mode standalone, or iOS's navigator.standalone). */
  isStandalone: boolean
  permission: 'default' | 'granted' | 'denied' | null
}

export function pushSupport(env: PushEnvironment): PushSupport {
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return env.isIos && !env.isStandalone ? 'ios_install' : 'unsupported'
  }
  if (env.permission === 'denied') return 'denied'
  return 'supported'
}

/** iPhone, iPad (which says "Macintosh" but has a touch screen) or iPod. */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

/** This browser, now. `unsupported` on the server. */
export function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported'
  const nav = navigator as Navigator & { standalone?: boolean }
  return pushSupport({
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isIos: isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    isStandalone: nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
    permission: 'Notification' in window ? Notification.permission : null,
  })
}

/** The VAPID public key (base64url) as the bytes PushManager.subscribe takes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normal)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const left = new Uint8Array(a)
  if (left.length !== b.length) return false
  return left.every((byte, i) => byte === b[i])
}

/** Thrown when turning notifications on cannot go ahead; `reason` says why. */
export class PushSetupError extends Error {
  constructor(public reason: 'denied' | 'dismissed' | 'unsupported') {
    super(
      reason === 'denied'
        ? 'Notifications are blocked for this site in your browser settings.'
        : reason === 'dismissed'
          ? 'Notifications were not allowed.'
          : "This browser can't show notifications."
    )
    this.name = 'PushSetupError'
  }
}

/** This browser's push subscription for this site, if it has one. Registers nothing. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof window === 'undefined' || !('PushManager' in window)) {
    return null
  }
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH)
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

/**
 * Asks for permission (from the tap that called it: iOS insists), registers
 * the service worker and subscribes. A subscription made with an older key
 * is replaced. Answers what the API stores.
 */
export async function subscribeThisBrowser(publicKey: string): Promise<PushSubscriptionJSON> {
  if (detectPushSupport() === 'unsupported' || detectPushSupport() === 'ios_install') {
    throw new PushSetupError('unsupported')
  }
  const permission = await Notification.requestPermission()
  if (permission === 'denied') throw new PushSetupError('denied')
  if (permission !== 'granted') throw new PushSetupError('dismissed')

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' })
  await navigator.serviceWorker.ready
  const key = urlBase64ToUint8Array(publicKey)
  const existing = await registration.pushManager.getSubscription()
  if (existing && sameKey(existing.options.applicationServerKey, key)) return existing.toJSON()
  if (existing) await existing.unsubscribe()
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  return subscription.toJSON()
}

/** Unsubscribes this browser. Answers the endpoint it had, or null when it had none. */
export async function unsubscribeThisBrowser(): Promise<string | null> {
  const subscription = await currentPushSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}

/**
 * On sign-out: this browser stops getting the account's notifications,
 * best effort and quickly. The API forgets the device while the session is
 * still good; the browser drops the subscription either way, so a phone
 * handed to someone else shows nothing more about the last account.
 */
export async function forgetThisBrowser(app: PushApp): Promise<void> {
  const subscription = await currentPushSubscription().catch(() => null)
  if (!subscription) return
  await removePushSubscription(app, subscription.endpoint, { auth: false }).catch(() => undefined)
  await subscription.unsubscribe().catch(() => undefined)
}
