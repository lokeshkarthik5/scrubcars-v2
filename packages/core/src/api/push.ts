import { apiClient } from '@repo/core/api/client'

/**
 * Browser notifications (0044): the customer app's (/users/me/push) and the
 * garage portal's (/vendors/me/push) calls. The endpoint of this browser's
 * subscription always travels in the body, never the URL: it identifies the
 * device, and request logs record URLs.
 */

/** Which app is asking: the customer's (detlio.com) or a garage seat's. */
export type PushApp = 'customer' | 'garage'

export interface PushConfig {
  /** False until the API has its VAPID keys: the screens are hidden. */
  enabled: boolean
  /** What the browser subscribes with; null while off. */
  publicKey: string | null
  /** The customer's switches (customer app only). */
  bookingUpdates?: boolean
  reminders?: boolean
}

export interface PushDeviceStatus {
  /** This browser is on for this person (and garage). */
  subscribed: boolean
  /** How many of their devices are on, this one included. */
  devices: number
}

export type PushTestResult = 'sent' | 'expired' | 'failed'

const base = (app: PushApp) => (app === 'customer' ? '/users/me/push' : '/vendors/me/push')

export function getPushConfig(app: PushApp) {
  return apiClient<PushConfig>(`${base(app)}/config`)
}

export function savePushSubscription(app: PushApp, subscription: PushSubscriptionJSON) {
  return apiClient<PushDeviceStatus>(`${base(app)}/subscriptions`, {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: { p256dh: subscription.keys?.p256dh ?? '', auth: subscription.keys?.auth ?? '' },
    }),
  })
}

/**
 * `auth: false` when signing out: a session that has already lapsed must not
 * set off the sign-out handler from inside the sign-out.
 */
export function removePushSubscription(app: PushApp, endpoint: string, options: { auth?: boolean } = {}) {
  return apiClient<PushDeviceStatus>(`${base(app)}/unsubscribe`, {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
    auth: options.auth ?? true,
  })
}

export function getPushStatus(app: PushApp, endpoint: string) {
  return apiClient<PushDeviceStatus>(`${base(app)}/status`, {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  })
}

export function sendTestPush(app: PushApp, endpoint: string) {
  return apiClient<{ result: PushTestResult }>(`${base(app)}/test`, {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  })
}

/** The customer's two switches, stored on the account (every device). */
export function setPushPreferences(input: { bookingUpdates?: boolean; reminders?: boolean }) {
  return apiClient<{ bookingUpdates: boolean; reminders: boolean }>('/users/me/push/preferences', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}
