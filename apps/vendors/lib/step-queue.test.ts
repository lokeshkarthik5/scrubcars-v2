import { beforeEach, describe, expect, test } from 'bun:test'
import { createStepQueue, stepStillDue, type Step, type StepStorage } from './step-queue'

/** A hand-wound clock: timers run only when `tick` says so. */
function harness(options: { failWith?: Error } = {}) {
  let pending: { run: () => void; at: number; id: number }[] = []
  let now = 0
  let nextId = 1
  const sent: Array<{ step: Step; keepalive: boolean }> = []
  const failed: Step[] = []
  const settle: Array<() => void> = []
  const memory = new Map<string, string>()
  const storage: StepStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  }
  const queue = createStepQueue({
    delayMs: 5000,
    storage,
    setTimer: (run, ms) => {
      const id = nextId++
      pending.push({ run, at: now + ms, id })
      return id
    },
    clearTimer: (id) => {
      pending = pending.filter((t) => t.id !== id)
    },
    send: (step, { keepalive }) => {
      sent.push({ step, keepalive })
      // Settles only when the test says: the request is on its way till then.
      return new Promise<void>((resolve, reject) =>
        settle.push(() =>
          options.failWith ? reject(options.failWith) : resolve()
        )
      )
    },
    onFailed: (step) => failed.push(step),
  })
  const tick = (ms: number) => {
    now += ms
    const due = pending.filter((t) => t.at <= now)
    pending = pending.filter((t) => t.at > now)
    due.forEach((t) => t.run())
  }
  const settleAll = async () => {
    while (settle.length) settle.shift()!()
    await new Promise((r) => setTimeout(r, 0))
  }
  return { queue, tick, sent, failed, settleAll, memory, storage }
}

const start = (overrides: Partial<Step> = {}): Step => ({
  bookingId: 'b1',
  status: 'in_progress',
  from: 'confirmed',
  vendorId: 'garage-a',
  ...overrides,
})

describe('the Undo queue', () => {
  let h: ReturnType<typeof harness>
  beforeEach(() => {
    h = harness()
  })

  test('a step waits five seconds, then goes, for the garage it was pressed for', async () => {
    h.queue.enqueue(start())
    h.tick(4999)
    expect(h.sent).toHaveLength(0)
    h.tick(1)
    expect(h.sent).toEqual([{ step: start(), keepalive: false }])
    await h.settleAll()
    expect(h.queue.get('b1')).toBeUndefined()
  })

  test('Undo inside the five seconds sends nothing', () => {
    h.queue.enqueue(start())
    expect(h.queue.undo('b1')).toBe(true)
    h.tick(10_000)
    expect(h.sent).toHaveLength(0)
    expect(h.memory.size).toBe(0)
  })

  test('no second tap while a step waits or is on its way, and no Undo once it has gone', async () => {
    expect(h.queue.enqueue(start())).toBe(true)
    expect(h.queue.enqueue(start({ status: 'completed' }))).toBe(false)
    h.tick(5000)
    // Sending: the request hasn't settled yet.
    expect(h.queue.get('b1')).toEqual({
      status: 'in_progress',
      phase: 'sending',
    })
    expect(h.queue.enqueue(start())).toBe(false)
    expect(h.queue.undo('b1')).toBe(false)
    await h.settleAll()
    expect(
      h.queue.enqueue(start({ status: 'completed', from: 'in_progress' }))
    ).toBe(true)
  })

  test('the page going away sends every waiting step at once, with keepalive', () => {
    h.queue.enqueue(start())
    h.queue.enqueue(
      start({ bookingId: 'b2', status: 'completed', from: 'in_progress' })
    )
    expect(h.queue.hasWaiting()).toBe(true)
    void h.queue.flush({ keepalive: true })
    expect(h.sent.map((s) => [s.step.bookingId, s.keepalive])).toEqual([
      ['b1', true],
      ['b2', true],
    ])
    expect(h.queue.hasWaiting()).toBe(false)
    // Its own timer finds it gone: not sent twice.
    h.tick(5000)
    expect(h.sent).toHaveLength(2)
  })

  test('a step a reload interrupted is resent if its job has not moved on, for its own garage only', async () => {
    h.queue.enqueue(start())
    h.queue.enqueue(start({ bookingId: 'b2' }))
    h.queue.enqueue(start({ bookingId: 'b3', vendorId: 'garage-b' }))
    // The page reloads: a new queue over the same storage.
    const after = harness()
    for (const [k, v] of h.memory) after.memory.set(k, v)
    after.queue.resume(
      [
        { id: 'b1', status: 'confirmed' },
        { id: 'b2', status: 'in_progress' },
      ],
      'garage-a'
    )
    expect(after.sent.map((s) => s.step.bookingId)).toEqual(['b1'])
    await after.settleAll()
    // b2 had moved on and is forgotten; b3 waits for its own garage.
    const left = JSON.parse(
      after.memory.get('detlio.garage.waitingSteps') ?? '[]'
    ) as Step[]
    expect(left.map((s) => s.bookingId)).toEqual(['b3'])
  })

  test('a refused step is reported and let go', async () => {
    const f = harness({ failWith: new Error('Add 2 before photos to start.') })
    f.queue.enqueue(start())
    f.tick(5000)
    await f.settleAll()
    expect(f.failed.map((s) => s.bookingId)).toEqual(['b1'])
    expect(f.queue.get('b1')).toBeUndefined()
    expect(f.memory.size).toBe(0)
  })
})

describe('Accept and pickup & drop steps (0066)', () => {
  let h: ReturnType<typeof harness>
  beforeEach(() => {
    h = harness()
  })

  test('Accept waits five seconds like Start, and Undo inside them sends nothing', async () => {
    const accept = start({ status: 'confirmed', from: 'pending' })
    expect(h.queue.enqueue(accept)).toBe(true)
    h.tick(4999)
    expect(h.sent).toHaveLength(0)
    expect(h.queue.undo('b1')).toBe(true)
    h.tick(10_000)
    expect(h.sent).toHaveLength(0)

    h.queue.enqueue(accept)
    h.tick(5000)
    expect(h.sent.map((s) => s.step.status)).toEqual(['confirmed'])
    await h.settleAll()
  })

  test("Picked up's code is never written to storage, so a reload cannot resend it", async () => {
    h.queue.enqueue(start({ status: 'picked_up', from: 'confirmed', code: '4821' }))
    expect(h.memory.size).toBe(0)
    // Still sent with its code when the five seconds are up.
    h.tick(5000)
    expect(h.sent[0]!.step.code).toBe('4821')
    await h.settleAll()
  })

  test('At garage and Out for delivery are stored, and resent only while the job still waits for that step', async () => {
    h.queue.enqueue(start({ status: 'at_garage', from: 'confirmed' }))
    h.queue.enqueue(start({ bookingId: 'b2', status: 'out_for_delivery', from: 'confirmed' }))
    expect(h.memory.size).toBe(1)
    const after = harness()
    for (const [k, v] of h.memory) after.memory.set(k, v)
    after.queue.resume(
      [
        // Still waiting for At garage: resent.
        { id: 'b1', status: 'confirmed', pickupNext: 'at_garage' },
        // Already out for delivery (the step landed before the reload): let go.
        { id: 'b2', status: 'confirmed', pickupNext: 'delivered' },
      ],
      'garage-a'
    )
    expect(after.sent.map((s) => [s.step.bookingId, s.step.status])).toEqual([['b1', 'at_garage']])
    await after.settleAll()
    expect(after.memory.size).toBe(0)
  })

  test('stepStillDue: the status for Accept, Start and Complete; the next step for pickup', () => {
    const accept = start({ status: 'confirmed', from: 'pending' })
    expect(stepStillDue(accept, { id: 'b1', status: 'pending' })).toBe(true)
    expect(stepStillDue(accept, { id: 'b1', status: 'confirmed' })).toBe(false)
    const atGarage = start({ status: 'at_garage', from: 'confirmed' })
    expect(stepStillDue(atGarage, { id: 'b1', status: 'confirmed', pickupNext: 'at_garage' })).toBe(true)
    expect(stepStillDue(atGarage, { id: 'b1', status: 'confirmed', pickupNext: 'start_work' })).toBe(false)
    expect(stepStillDue(atGarage, { id: 'b1', status: 'cancelled', pickupNext: null })).toBe(false)
  })
})
