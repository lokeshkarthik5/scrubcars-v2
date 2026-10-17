import {
  isAllowedPushEndpoint,
  MAX_SEND_FAILURES,
  type PushMessage,
  type SendResult,
} from '../../lib/push.js'
import type { PushSender, PushTarget } from '../../lib/web-push.js'

/**
 * Sending one message to a set of devices, and keeping the subscriptions
 * clean as it goes, over the store and sender it is given: push.service.ts
 * passes the repository and the web-push sender, the unit tests stand-ins.
 * No database, env or network import here.
 *
 * - Sent: the subscription's failure count goes back to 0.
 * - Gone (the push service answered 404 or 410: the browser unsubscribed,
 *   or its data was cleared): the subscription is deleted at once.
 * - Failed (anything else: 429, 5xx, a timeout): kept and counted; after
 *   MAX_SEND_FAILURES in a row it is deleted too.
 * - An endpoint that is not a known push service (only possible for a row
 *   stored before the allow-list tightened) is deleted, never called.
 */

export interface DeliveryStore {
  markSent(id: string, at: Date): Promise<void>
  /** Answers the new count of failures in a row. */
  markFailed(id: string): Promise<number>
  deleteSubscription(id: string): Promise<void>
}

export interface DeliverySummary {
  devices: number
  sent: number
  removed: number
  failed: number
  /** Status codes of the failures, for the log: never an endpoint. */
  failures: Array<number | null>
}

export function deliveryWith(deps: { store: DeliveryStore; sender: PushSender; now?: () => Date }) {
  const now = deps.now ?? (() => new Date())

  return async function deliver(
    targets: Array<PushTarget & { id: string }>,
    message: PushMessage
  ): Promise<DeliverySummary> {
    const summary: DeliverySummary = { devices: targets.length, sent: 0, removed: 0, failed: 0, failures: [] }

    // The sends go out together (a garage's few devices, a customer's one or
    // two); the bookkeeping after them one at a time, on the one connection.
    const results: SendResult[] = await Promise.all(
      targets.map((target) =>
        isAllowedPushEndpoint(target.endpoint)
          ? deps.sender.send(target, message)
          : Promise.resolve<SendResult>({ kind: 'gone' })
      )
    )

    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i]
      const result = results[i]
      if (result.kind === 'sent') {
        summary.sent += 1
        await deps.store.markSent(target.id, now())
      } else if (result.kind === 'gone') {
        summary.removed += 1
        await deps.store.deleteSubscription(target.id)
      } else {
        summary.failed += 1
        summary.failures.push(result.status)
        const count = await deps.store.markFailed(target.id)
        if (count >= MAX_SEND_FAILURES) {
          summary.removed += 1
          await deps.store.deleteSubscription(target.id)
        }
      }
    }
    return summary
  }
}
