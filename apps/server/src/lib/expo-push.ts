import type { PushMessage, SendResult } from './push.js'

/**
 * Notifications for the native apps, through Expo's push service
 * (https://docs.expo.dev/push-notifications/sending-notifications/). Decision:
 * Expo instead of calling FCM and APNs directly, because it needs no Apple
 * key or Firebase service account on this server; the apps hand us an Expo
 * token and Expo does the rest. The only file that talks to Expo.
 *
 * The words are the same `PushMessage` the browsers get (lib/push-messages.ts,
 * written once, no personal data), and `url` travels in the payload exactly as
 * it does to a browser. This file holds the pure parts (token shape, the
 * request, what an answer means) and the sender, which takes its `fetch` and
 * settings (no env import here; modules/push wires them) so unit tests never
 * reach Expo.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export const DEVICE_PLATFORMS = ['ios', 'android'] as const
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]

/**
 * `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`, or the newer spelling
 * `ExpoPushToken[…]`, which Expo accepts alike. The part inside is 22
 * characters of letters, digits, `-` and `_` today; the bounds are loose so
 * a longer one is not refused, but nothing that could carry other text gets
 * in. The same pattern is the database CHECK (0067).
 */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{16,64}\]$/

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN.test(token)
}

/** Where a message goes: one phone's Expo token and its platform. */
export interface DeviceTarget {
  token: string
  platform: DevicePlatform
}

export interface DevicePushSender {
  /** Never throws: every outcome is a SendResult. */
  send(target: DeviceTarget, message: PushMessage): Promise<SendResult>
}

/**
 * One request body for Expo: the same title and body a browser shows, and
 * `data` with the app path to open (`url`) and the tag, as the browsers get
 * them. Reminders go to the customer app's Android `reminders` channel, so
 * they can be silenced apart from booking news; everything else takes the
 * default channel, because a channel the app has not created would hide the
 * notification. Only customers get the 'reminder' category. `collapseId` (≤ 64 bytes) lets a booking's news replace its
 * earlier notification instead of piling up.
 */
export function expoRequestMessage(target: DeviceTarget, message: PushMessage) {
  return {
    to: target.token,
    title: message.title,
    body: message.body,
    data: { url: message.url, tag: message.tag },
    sound: 'default',
    ttl: message.ttlSeconds,
    priority: message.urgency === 'high' ? 'high' : 'default',
    ...(message.category === 'reminder' ? { channelId: 'reminders' } : {}),
    ...(message.tag.length <= 64 ? { collapseId: message.tag } : {}),
  }
}

/**
 * What Expo's answer to a send means. A ticket `ok` is "Expo has it"; a
 * ticket error `DeviceNotRegistered` means the token is dead (the app was
 * uninstalled or notifications were revoked): delete it. Anything else (a
 * rate limit, a bad credential, a server error, an answer that is not JSON)
 * may pass: the device stays, counted.
 */
export function classifyExpoResponse(status: number, body: unknown): SendResult {
  if (status < 200 || status >= 300) return { kind: 'failed', status }

  const data = (body as { data?: unknown } | null)?.data
  const ticket = Array.isArray(data) ? data[0] : data
  if (!ticket || typeof ticket !== 'object') return { kind: 'failed', status }

  const { status: ticketStatus, details } = ticket as { status?: unknown; details?: { error?: unknown } }
  if (ticketStatus === 'ok') return { kind: 'sent' }
  if (details?.error === 'DeviceNotRegistered') return { kind: 'gone' }
  return { kind: 'failed', status }
}

/** Expo that does not answer in this long is a failure, not a hang. */
const SEND_TIMEOUT_MS = 5_000

/**
 * PUSH_FAKE (the same test switch as browser notifications) only: what would
 * have been sent, newest last, for a test to read. Holds the message, never
 * the token. Capped so a long run cannot grow it without end.
 */
export const fakeDeviceOutbox: Array<Pick<PushMessage, 'title' | 'body' | 'url' | 'tag' | 'category'> & { platform: DevicePlatform }> = []
const FAKE_OUTBOX_MAX = 200

export interface ExpoSenderDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  /** Read on each send. Set: sent as `Authorization: Bearer`. */
  accessToken: () => string | undefined
  /** Read on each send. On: recorded in `fakeDeviceOutbox`, Expo never called. */
  fake: () => boolean
}

export function createExpoPushSender(deps: ExpoSenderDeps): DevicePushSender {
  return {
    async send(target, message) {
      if (deps.fake()) {
        fakeDeviceOutbox.push({
          title: message.title,
          body: message.body,
          url: message.url,
          tag: message.tag,
          category: message.category,
          platform: target.platform,
        })
        if (fakeDeviceOutbox.length > FAKE_OUTBOX_MAX) fakeDeviceOutbox.shift()
        return { kind: 'sent' }
      }

      const accessToken = deps.accessToken()
      try {
        const response = await deps.fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          },
          // An array of one: the answer is then always an array of tickets.
          body: JSON.stringify([expoRequestMessage(target, message)]),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        })
        let body: unknown = null
        try {
          body = await response.json()
        } catch {
          // Not JSON: classified by status alone.
        }
        return classifyExpoResponse(response.status, body)
      } catch {
        // The error can carry the request (and so the token): nothing of it
        // leaves this function; the caller logs the failure by its status.
        return { kind: 'failed', status: null }
      }
    },
  }
}
