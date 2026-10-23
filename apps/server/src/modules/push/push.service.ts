import { runInBackground } from '../../lib/background.js'
import { env, isPushEnabled } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  customerWants,
  deviceLabel,
  MAX_SUBSCRIPTIONS_PER_USER,
  type PushAudience,
  type PushMessage,
  type ScheduledPushKind,
} from '../../lib/push.js'
import {
  customerDayBefore,
  customerHourBefore,
  garageRespondSoon,
  testMessage,
  type PushBooking,
} from '../../lib/push-messages.js'
import {
  hourBeforeRange,
  isDayBeforeRun,
  respondSoonRange,
  SCHEDULED_PUSH_BATCH,
  scheduledPushDue,
  tomorrowRange,
  type Range,
} from '../../lib/push-reminders.js'
import { createKeyedLimit } from '../../lib/throttle.js'
import { webPushSender } from '../../lib/web-push.js'
import { pushRepository, type ScheduledCandidateRow } from './push.repository.js'
import { deliveryWith, type DeliverySummary } from './push.rules.js'
import type { EndpointInput, PreferencesInput, SubscribeInput } from './push.validation.js'

const log = logger.child({ module: 'push' })

/** Who a notification is for. A future native-app sender takes the same. */
export type PushRecipient = { audience: 'customer'; userId: string } | { audience: 'garage'; vendorId: string }

/** A message, or a loader for one when facts still need reading (after the response). */
export type PushMessageSource = PushMessage | (() => Promise<PushMessage | null>)

/** Whose subscription a request is about: the session's person, and the tenant's garage. */
interface Scope {
  userId: string
  audience: PushAudience
  vendorId: string | null
}

const deliver = deliveryWith({
  store: {
    markSent: (id, at) => pushRepository.markSent(id, at),
    markFailed: (id) => pushRepository.markFailed(id),
    deleteSubscription: (id) => pushRepository.deleteSubscription(id),
  },
  sender: webPushSender,
})

/** "Send me a test notification": five a person per ten minutes. */
const testLimit = createKeyedLimit(5, 10 * 60 * 1000)

/** One cron run spends at most this long sending scheduled notifications. */
const SWEEP_BUDGET_MS = 10_000

function notSubscribed(): AppError {
  return new AppError(
    404,
    "Notifications aren't on for this browser. Turn them on first.",
    'PUSH_NOT_SUBSCRIBED'
  )
}

function logDelivery(recipient: PushRecipient, message: PushMessage, summary: DeliverySummary) {
  if (summary.devices === 0) return
  // The tag says what it was about (a booking id at most); never an endpoint.
  const fields = {
    audience: recipient.audience,
    tag: message.tag,
    devices: summary.devices,
    sent: summary.sent,
    removed: summary.removed,
    failed: summary.failed,
    failures: summary.failures,
  }
  if (summary.failed > 0) log.warn(fields, 'push:delivered_with_failures')
  else log.info(fields, 'push:delivered')
}

/** The devices a recipient's message goes to (a customer's, filtered by their switches). */
async function targetsFor(recipient: PushRecipient, message: PushMessage) {
  if (recipient.audience === 'garage') return pushRepository.listGarageSubscriptions(recipient.vendorId)
  const rows = await pushRepository.listCustomerSubscriptions(recipient.userId)
  return rows.filter((row) => customerWants(message.category, row))
}

async function deliverTo(recipient: PushRecipient, message: PushMessage): Promise<DeliverySummary> {
  const targets = await targetsFor(recipient, message)
  if (targets.length === 0) return { devices: 0, sent: 0, removed: 0, failed: 0, failures: [] }
  const summary = await deliver(targets, message)
  logDelivery(recipient, message, summary)
  return summary
}

/** A cron candidate as the message builders read it. */
function candidateBooking(row: ScheduledCandidateRow): PushBooking {
  return {
    id: row.id,
    scheduledAt: row.scheduledAt,
    bookingType: row.bookingType,
    status: row.status,
    respondBy: row.respondBy,
    vendor: { businessName: row.businessName },
    items: row.serviceNames.map((name) => ({ name })),
  }
}

export const pushService = {
  /**
   * Whether the apps should offer notifications at all, and the public key
   * a browser subscribes with. For a customer, also their two switches.
   * Off, nothing is read.
   */
  async config(scope: Scope) {
    if (!isPushEnabled()) return { enabled: false as const, publicKey: null }
    const base = { enabled: true as const, publicKey: env.vapidPublicKey! }
    if (scope.audience !== 'customer') return base
    const prefs = await pushRepository.getPreferences(scope.userId)
    return {
      ...base,
      bookingUpdates: prefs?.pushBookingUpdates ?? true,
      reminders: prefs?.pushReminders ?? true,
    }
  },

  /**
   * Turns notifications on for this browser, for the session's person and
   * (garage) the tenant's garage. Keeps at most MAX_SUBSCRIPTIONS_PER_USER
   * devices per person per app, the newest.
   */
  async subscribe(scope: Scope, input: SubscribeInput, userAgent: string | undefined) {
    await pushRepository.upsertSubscription({
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userId: scope.userId,
      audience: scope.audience,
      vendorId: scope.vendorId,
      deviceLabel: deviceLabel(userAgent),
    })
    await pushRepository.pruneSubscriptions(scope, MAX_SUBSCRIPTIONS_PER_USER)
    log.info({ audience: scope.audience, vendorId: scope.vendorId, userId: scope.userId }, 'push:subscribed')
    return { subscribed: true, devices: await pushRepository.countSubscriptions(scope) }
  },

  /** Turns this browser off. Not an error when it was off already. */
  async unsubscribe(scope: Scope, input: EndpointInput) {
    const removed = await pushRepository.deleteOwnSubscription(scope, input.endpoint)
    if (removed) log.info({ audience: scope.audience, vendorId: scope.vendorId, userId: scope.userId }, 'push:unsubscribed')
    return { subscribed: false, devices: await pushRepository.countSubscriptions(scope) }
  },

  /** Whether this browser is on for this person (and garage), and how many devices are. */
  async status(scope: Scope, input: EndpointInput) {
    const own = await pushRepository.findOwnSubscription(scope, input.endpoint)
    return { subscribed: own !== undefined, devices: await pushRepository.countSubscriptions(scope) }
  },

  async setPreferences(userId: string, input: PreferencesInput) {
    const row = await pushRepository.setPreferences(userId, {
      ...(input.bookingUpdates !== undefined && { pushBookingUpdates: input.bookingUpdates }),
      ...(input.reminders !== undefined && { pushReminders: input.reminders }),
    })
    if (!row) throw new AppError(404, 'Account not found', 'USER_NOT_FOUND')
    return { bookingUpdates: row.pushBookingUpdates, reminders: row.pushReminders }
  },

  /**
   * "Send me a test notification": to this browser only, and only if it is
   * this person's (and garage's). Awaited, so the screen can say what came
   * of it. Rate limited per person.
   */
  async sendTest(scope: Scope, input: EndpointInput) {
    const limit = testLimit(`${scope.audience}:${scope.userId}`)
    if (!limit.ok) {
      throw new AppError(429, 'Too many test notifications. Try again in a few minutes.', 'PUSH_TEST_RATE_LIMIT', {
        retryAfterSeconds: limit.retryAfterSeconds,
      })
    }
    const own = await pushRepository.findOwnSubscription(scope, input.endpoint)
    if (!own) throw notSubscribed()

    const message = testMessage(scope.audience)
    const summary = await deliver([own], message)
    log.info({ audience: scope.audience, sent: summary.sent, removed: summary.removed, failures: summary.failures }, 'push:test')
    if (summary.sent === 1) return { result: 'sent' as const }
    // The push service says this browser's subscription is gone: it was
    // deleted just now, and the screen asks for notifications again.
    if (summary.removed === 1) return { result: 'expired' as const }
    return { result: 'failed' as const }
  },

  /**
   * Sends a notification to everyone it is for, after the response: never
   * awaited, never slows or fails the request that caused it, and a failure
   * is logged (without any endpoint) and dropped. Off, and free of any read,
   * while browser notifications are not set up. A loader runs after the
   * response too, only when they are on.
   */
  notify(recipient: PushRecipient, source: PushMessageSource): void {
    if (!isPushEnabled()) return
    runInBackground('push_notify', async () => {
      const message = typeof source === 'function' ? await source() : source
      if (!message) return
      await deliverTo(recipient, message)
    })
  },

  /**
   * Like notify, when even who it is for needs a read (the booking that was
   * just paid for, say): the loader runs after the response, only while
   * notifications are on, and answers every recipient with its message.
   */
  notifyLater(loader: () => Promise<Array<{ recipient: PushRecipient; message: PushMessage }>>): void {
    if (!isPushEnabled()) return
    runInBackground('push_notify', async () => {
      for (const { recipient, message } of await loader()) await deliverTo(recipient, message)
    })
  },

  notifyCustomer(userId: string, source: PushMessageSource): void {
    pushService.notify({ audience: 'customer', userId }, source)
  },

  notifyGarage(vendorId: string, source: PushMessageSource): void {
    pushService.notify({ audience: 'garage', vendorId }, source)
  },

  /**
   * The pending-digest cron's scheduled notifications (lib/push-reminders.ts):
   * the evening-before reminders in the 18:00 IST runs, the hour-before ones
   * every run, and the garage's "accept within 10 min" while
   * AUTO_CANCEL_UNANSWERED is on. Each claimed (notification_sends) before it
   * is sent, so it goes at most once; SCHEDULED_PUSH_BATCH of each kind a
   * run, within a time budget. A dry run only counts. Off, nothing is read.
   */
  async sweepScheduled(options: { dryRun: boolean }, now = new Date()) {
    if (!isPushEnabled()) return { enabled: false as const }
    const summary = { enabled: true as const, dayBefore: 0, hourBefore: 0, respondSoon: 0, skipped: 0, failed: 0 }
    const started = Date.now()
    const plan: Array<{ kind: ScheduledPushKind; range: Range; key: 'dayBefore' | 'hourBefore' | 'respondSoon' }> = []
    if (isDayBeforeRun(now)) {
      const tomorrow = tomorrowRange(now)
      // The query takes (from, to]; tomorrow starts at its midnight.
      plan.push({ kind: 'day_before', range: { from: new Date(tomorrow.from.getTime() - 1), to: tomorrow.to }, key: 'dayBefore' })
    }
    plan.push({ kind: 'hour_before', range: hourBeforeRange(now), key: 'hourBefore' })
    if (env.autoCancelUnanswered) plan.push({ kind: 'respond_soon', range: respondSoonRange(now), key: 'respondSoon' })

    for (const step of plan) {
      const rows = await pushRepository.listScheduledCandidates({
        kind: step.kind,
        from: step.range.from,
        to: step.range.to,
        limit: SCHEDULED_PUSH_BATCH,
      })
      for (const row of rows) {
        if (Date.now() - started > SWEEP_BUDGET_MS) return { ...summary, outOfTime: true }
        if (!scheduledPushDue(step.kind, row, now, { autoCancelOn: env.autoCancelUnanswered })) {
          summary.skipped += 1
          continue
        }
        if (options.dryRun) {
          summary[step.key] += 1
          continue
        }
        try {
          if (!(await pushRepository.claimScheduled(row.id, step.kind))) {
            summary.skipped += 1
            continue
          }
          const booking = candidateBooking(row)
          if (step.kind === 'respond_soon') {
            await deliverTo({ audience: 'garage', vendorId: row.vendorId }, garageRespondSoon(booking, now))
          } else {
            const message = step.kind === 'day_before' ? customerDayBefore(booking, now) : customerHourBefore(booking, now)
            await deliverTo({ audience: 'customer', userId: row.userId }, message)
          }
          summary[step.key] += 1
        } catch (err) {
          summary.failed += 1
          log.error({ err, bookingId: row.id, kind: step.kind }, 'push:scheduled_failed')
        }
      }
    }
    if (summary.dayBefore + summary.hourBefore + summary.respondSoon + summary.failed > 0) {
      log.info(summary, 'push:scheduled')
    }
    return summary
  },
}
