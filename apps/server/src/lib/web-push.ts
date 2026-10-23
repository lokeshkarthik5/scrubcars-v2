import webpush from 'web-push'
import { env } from './env.js'
import { classifySendFailure, pushPayload, type PushMessage, type SendResult } from './push.js'

/**
 * Sends one browser notification through the browser's push service, signed
 * with Detlio's VAPID key. The only file that imports the `web-push` package
 * (one exact version, pinned in apps/server/package.json).
 *
 * A future native-app sender (FCM for Android, APNs for iPhone) implements
 * the same `PushSender` and is chosen per subscription in modules/push; the
 * messages and who gets them do not change.
 */

/** Where a message goes: one browser's push service URL and its keys. */
export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushSender {
  /** Never throws: every outcome is a SendResult. */
  send(target: PushTarget, message: PushMessage): Promise<SendResult>
}

/** A push service that does not answer in this long is a failure, not a hang. */
const SEND_TIMEOUT_MS = 5_000

/**
 * PUSH_FAKE (E2E) only: what would have been sent, newest last, for a test to
 * read. Holds the message, never the endpoint or keys. Capped so a long run
 * cannot grow it without end.
 */
export const fakePushOutbox: Array<Pick<PushMessage, 'title' | 'body' | 'url' | 'tag' | 'category'>> = []
const FAKE_OUTBOX_MAX = 200

/**
 * An endpoint ending in this answers 410 under PUSH_FAKE, so a test can
 * watch a dropped browser's subscription being removed.
 */
export const FAKE_GONE_SUFFIX = '/e2e-gone'

export const webPushSender: PushSender = {
  async send(target, message) {
    if (env.pushFake) {
      if (target.endpoint.endsWith(FAKE_GONE_SUFFIX)) return { kind: 'gone' }
      fakePushOutbox.push({
        title: message.title,
        body: message.body,
        url: message.url,
        tag: message.tag,
        category: message.category,
      })
      if (fakePushOutbox.length > FAKE_OUTBOX_MAX) fakePushOutbox.shift()
      return { kind: 'sent' }
    }

    if (!env.vapidPublicKey || !env.vapidPrivateKey || !env.vapidSubject) {
      return { kind: 'failed', status: null }
    }

    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        pushPayload(message),
        {
          vapidDetails: {
            subject: env.vapidSubject,
            publicKey: env.vapidPublicKey,
            privateKey: env.vapidPrivateKey,
          },
          TTL: message.ttlSeconds,
          urgency: message.urgency,
          timeout: SEND_TIMEOUT_MS,
        }
      )
      return { kind: 'sent' }
    } catch (err) {
      // A WebPushError carries the endpoint and the service's body; only
      // the status leaves this function, so neither reaches a log.
      const status = (err as { statusCode?: unknown }).statusCode
      return classifySendFailure(typeof status === 'number' ? status : null)
    }
  },
}
