import { isExpoPushToken, type DevicePushSender, type DeviceTarget } from '../../lib/expo-push.js'
import { MAX_SEND_FAILURES, type PushMessage, type SendResult } from '../../lib/push.js'
import type { DeliveryStore, DeliverySummary } from './push.rules.js'

/**
 * push.rules.ts's delivery, for phones (push_devices, 0067): one message to a
 * set of devices over the store and sender it is given, keeping the table
 * clean as it goes. Same outcomes, same summary:
 *
 * - Sent: the failure count goes back to 0.
 * - Gone (Expo says DeviceNotRegistered): deleted at once.
 * - Failed (anything else): kept and counted; after MAX_SEND_FAILURES in a
 *   row it is deleted too.
 * - A token that is not an Expo token (only possible for a row that got past
 *   the CHECK somehow) is deleted, never sent.
 *
 * A sender that throws (it should not) counts as a failure, so one bad
 * device never stops the others. No database, env or network import here.
 */
export function deviceDeliveryWith(deps: { store: DeliveryStore; sender: DevicePushSender; now?: () => Date }) {
  const now = deps.now ?? (() => new Date())

  return async function deliverToDevices(
    targets: Array<DeviceTarget & { id: string }>,
    message: PushMessage
  ): Promise<DeliverySummary> {
    const summary: DeliverySummary = { devices: targets.length, sent: 0, removed: 0, failed: 0, failures: [] }

    const results: SendResult[] = await Promise.all(
      targets.map(async (target): Promise<SendResult> => {
        if (!isExpoPushToken(target.token)) return { kind: 'gone' }
        try {
          return await deps.sender.send(target, message)
        } catch {
          return { kind: 'failed', status: null }
        }
      })
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
