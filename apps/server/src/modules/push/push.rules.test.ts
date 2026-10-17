import { describe, expect, test } from 'bun:test'
import type { PushMessage, SendResult } from '../../lib/push.js'
import { MAX_SEND_FAILURES } from '../../lib/push.js'
import type { PushSender, PushTarget } from '../../lib/web-push.js'
import { deliveryWith, type DeliveryStore } from './push.rules.js'

const MESSAGE: PushMessage = {
  title: 'Marina Auto Spa accepted your booking',
  body: 'Exterior Wash · Sat 17 Oct, 10 AM',
  url: '/bookings/1',
  tag: 'booking:1',
  category: 'booking_update',
  ttlSeconds: 3600,
  urgency: 'normal',
}

const target = (id: string, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`) => ({
  id,
  endpoint,
  p256dh: 'p',
  auth: 'a',
})

/** A store that remembers what happened, and a sender that answers per endpoint. */
function harness(answers: Record<string, SendResult>, failuresSoFar: Record<string, number> = {}) {
  const sent: string[] = []
  const deleted: string[] = []
  const markedSent: string[] = []
  const failures = { ...failuresSoFar }
  const store: DeliveryStore = {
    async markSent(id) {
      markedSent.push(id)
      failures[id] = 0
    },
    async markFailed(id) {
      failures[id] = (failures[id] ?? 0) + 1
      return failures[id]
    },
    async deleteSubscription(id) {
      deleted.push(id)
    },
  }
  const sender: PushSender = {
    async send(t: PushTarget) {
      sent.push(t.endpoint)
      return answers[t.endpoint] ?? { kind: 'sent' }
    },
  }
  return { deliver: deliveryWith({ store, sender }), sent, deleted, markedSent, failures }
}

describe('keeping subscriptions clean while sending', () => {
  test('a 410 from the push service deletes that subscription at once; the others are sent', async () => {
    const gone = target('gone')
    const fine = target('fine')
    const h = harness({ [gone.endpoint]: { kind: 'gone' } })
    const summary = await h.deliver([gone, fine], MESSAGE)
    expect(summary).toMatchObject({ devices: 2, sent: 1, removed: 1, failed: 0 })
    expect(h.deleted).toEqual(['gone'])
    expect(h.markedSent).toEqual(['fine'])
  })

  test('a failure that may pass (429, 5xx) keeps the subscription and counts it', async () => {
    const flaky = target('flaky')
    const h = harness({ [flaky.endpoint]: { kind: 'failed', status: 503 } })
    const summary = await h.deliver([flaky], MESSAGE)
    expect(summary).toMatchObject({ sent: 0, removed: 0, failed: 1, failures: [503] })
    expect(h.deleted).toEqual([])
    expect(h.failures.flaky).toBe(1)
  })

  test(`after ${MAX_SEND_FAILURES} failures in a row it is deleted too`, async () => {
    const dead = target('dead')
    const h = harness({ [dead.endpoint]: { kind: 'failed', status: 500 } }, { dead: MAX_SEND_FAILURES - 1 })
    const summary = await h.deliver([dead], MESSAGE)
    expect(summary).toMatchObject({ failed: 1, removed: 1 })
    expect(h.deleted).toEqual(['dead'])
  })

  test('a success resets the count', async () => {
    const back = target('back')
    const h = harness({}, { back: 4 })
    await h.deliver([back], MESSAGE)
    expect(h.failures.back).toBe(0)
  })

  test('an endpoint that is not a push service is deleted and never called', async () => {
    const internal = target('internal', 'https://169.254.169.254/latest/meta-data')
    const h = harness({})
    const summary = await h.deliver([internal], MESSAGE)
    expect(h.sent).toEqual([])
    expect(h.deleted).toEqual(['internal'])
    expect(summary).toMatchObject({ sent: 0, removed: 1 })
  })

  test('nobody to send to is nothing at all', async () => {
    const h = harness({})
    expect(await h.deliver([], MESSAGE)).toMatchObject({ devices: 0, sent: 0, removed: 0, failed: 0 })
  })
})
