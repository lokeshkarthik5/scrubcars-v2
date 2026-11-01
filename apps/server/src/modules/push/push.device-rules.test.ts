import { describe, expect, test } from 'bun:test'
import type { DevicePushSender } from '../../lib/expo-push.js'
import { MAX_SEND_FAILURES, type PushMessage, type SendResult } from '../../lib/push.js'
import { deviceDeliveryWith } from './push.device-rules.js'
import type { DeliveryStore } from './push.rules.js'

const MESSAGE: PushMessage = {
  title: 'Booking confirmed',
  body: 'Exterior Wash',
  url: '/bookings/abc',
  tag: 'booking:abc',
  category: 'booking_update',
  ttlSeconds: 60,
  urgency: 'normal',
}

const device = (id: string, token = `ExponentPushToken[device${id.padEnd(16, 'x')}]`) => ({
  id,
  token,
  platform: 'ios' as const,
})

function harness(answers: Record<string, SendResult | 'throw'>, failureCount = 1) {
  const sent: string[] = []
  const deleted: string[] = []
  const markedSent: string[] = []
  const failures: string[] = []
  const sender: DevicePushSender = {
    async send(target) {
      sent.push(target.token)
      const answer = answers[target.token] ?? { kind: 'sent' }
      if (answer === 'throw') throw new Error('boom')
      return answer
    },
  }
  const store: DeliveryStore = {
    markSent: async (id) => void markedSent.push(id),
    markFailed: async (id) => {
      failures.push(id)
      return failureCount
    },
    deleteSubscription: async (id) => void deleted.push(id),
  }
  return { deliver: deviceDeliveryWith({ store, sender }), sent, deleted, markedSent, failures }
}

describe('delivering to phones', () => {
  test('sent: counted and marked', async () => {
    const h = harness({})
    const a = device('a')
    expect(await h.deliver([a], MESSAGE)).toEqual({ devices: 1, sent: 1, removed: 0, failed: 0, failures: [] })
    expect(h.markedSent).toEqual(['a'])
  })

  test('a dead token is deleted at once, and the others still go', async () => {
    const dead = device('dead')
    const fine = device('fine')
    const h = harness({ [dead.token]: { kind: 'gone' } })
    const summary = await h.deliver([dead, fine], MESSAGE)
    expect(summary).toMatchObject({ devices: 2, sent: 1, removed: 1, failed: 0 })
    expect(h.deleted).toEqual(['dead'])
    expect(h.markedSent).toEqual(['fine'])
  })

  test('a failure is kept and counted, deleted only after MAX_SEND_FAILURES in a row', async () => {
    const flaky = device('flaky')
    const kept = harness({ [flaky.token]: { kind: 'failed', status: 503 } }, MAX_SEND_FAILURES - 1)
    expect(await kept.deliver([flaky], MESSAGE)).toMatchObject({ failed: 1, removed: 0, failures: [503] })
    expect(kept.deleted).toEqual([])

    const worn = harness({ [flaky.token]: { kind: 'failed', status: 503 } }, MAX_SEND_FAILURES)
    expect(await worn.deliver([flaky], MESSAGE)).toMatchObject({ failed: 1, removed: 1 })
    expect(worn.deleted).toEqual(['flaky'])
  })

  test('a sender that throws is one failure; the other phones still get theirs', async () => {
    const bad = device('bad')
    const good = device('good')
    const h = harness({ [bad.token]: 'throw' })
    const summary = await h.deliver([bad, good], MESSAGE)
    expect(summary).toMatchObject({ sent: 1, failed: 1, failures: [null] })
    expect(h.markedSent).toEqual(['good'])
  })

  test('a token that is not an Expo token is deleted and never sent', async () => {
    const junk = device('junk', 'https://169.254.169.254/latest/meta-data')
    const h = harness({})
    const summary = await h.deliver([junk], MESSAGE)
    expect(summary).toMatchObject({ devices: 1, removed: 1, sent: 0 })
    expect(h.sent).toEqual([])
    expect(h.deleted).toEqual(['junk'])
  })

  test('nobody to send to is nothing', async () => {
    const h = harness({})
    expect(await h.deliver([], MESSAGE)).toEqual({ devices: 0, sent: 0, removed: 0, failed: 0, failures: [] })
  })
})
