/**
 * The queue behind the garage's 5-second Undo (UX audit, garage finding 5):
 * Start job and Complete job, and since 0066 Accept and pickup & drop's
 * Picked up, At garage and Out for delivery. No React and no browser in it,
 * so it can be tested: the timers, the storage and the request are passed in.
 *
 * A step waits UNDO_MS, then is sent; it stays "sending" until the request
 * settles, so it can't be pressed twice or undone once it has gone. Each
 * step names the garage it was pressed for. Waiting steps are kept in
 * storage until they settle: a page closed or reloaded mid-wait sends them
 * on the next load, if the job still has the status it had (`from`).
 */

export type StepStatus =
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'picked_up'
  | 'at_garage'
  | 'out_for_delivery'

/** Pickup & drop's handover steps: the status stays confirmed, `pickup.nextStep` moves. */
export const PICKUP_STEPS = ['picked_up', 'at_garage', 'out_for_delivery'] as const satisfies readonly StepStatus[]

export function isPickupStep(status: StepStatus): status is (typeof PICKUP_STEPS)[number] {
  return (PICKUP_STEPS as readonly string[]).includes(status)
}

export interface Step {
  bookingId: string
  status: StepStatus
  /** The job's status when the button was pressed. */
  from: string
  /** The garage it was pressed for: sent with it, whatever is active by then. */
  vendorId: string | null
  /**
   * Picked up's 4-digit code, as the customer read it out. Held in memory
   * only: a step with a code is never written to storage (it is the
   * customer's code), so a reload cannot resend it.
   */
  code?: string
}

/** A job as the resume check reads it. */
export interface ResumableJob {
  id: string
  status: string
  /** Pickup & drop's next step (`pickup.nextStep`), if any. */
  pickupNext?: string | null
}

/**
 * Whether a stored step still has to go after a reload: its job is where it
 * was when the button was pressed. A pickup step's job keeps its status, so
 * its own next step is what says so.
 */
export function stepStillDue(step: Step, job: ResumableJob): boolean {
  if (isPickupStep(step.status)) return job.status === 'confirmed' && job.pickupNext === step.status
  return job.status === step.from
}

export type StepPhase = 'waiting' | 'sending'

export interface StepStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface StepQueueDeps {
  delayMs: number
  send: (step: Step, options: { keepalive: boolean }) => Promise<unknown>
  /** A step the server refused, or that failed to go. */
  onFailed?: (step: Step, error: unknown) => void
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  storage: StepStorage | null
  storageKey?: string
}

const DEFAULT_KEY = 'detlio.garage.waitingSteps'

export function createStepQueue(deps: StepQueueDeps) {
  const key = deps.storageKey ?? DEFAULT_KEY
  const entries = new Map<
    string,
    { step: Step; phase: StepPhase; timer: unknown }
  >()
  const listeners = new Set<() => void>()
  let snapshot: ReadonlyMap<string, { status: StepStatus; phase: StepPhase }> =
    new Map()

  function changed() {
    snapshot = new Map(
      [...entries].map(([id, e]) => [
        id,
        { status: e.step.status, phase: e.phase },
      ])
    )
    for (const listener of listeners) listener()
  }

  function readStored(): Step[] {
    try {
      const raw = deps.storage?.getItem(key)
      const list = raw ? (JSON.parse(raw) as unknown) : []
      return Array.isArray(list)
        ? (list as Step[]).filter((s) => s && typeof s.bookingId === 'string')
        : []
    } catch {
      return []
    }
  }

  function writeStored(list: Step[]) {
    try {
      if (list.length === 0) deps.storage?.removeItem(key)
      else deps.storage?.setItem(key, JSON.stringify(list))
    } catch {
      // Private mode or full storage: the step still goes, it just isn't
      // resent after a reload.
    }
  }

  function store(step: Step) {
    if (step.code !== undefined) return
    writeStored([
      ...readStored().filter((s) => s.bookingId !== step.bookingId),
      step,
    ])
  }

  function unstore(bookingId: string) {
    writeStored(readStored().filter((s) => s.bookingId !== bookingId))
  }

  async function send(bookingId: string, keepalive: boolean) {
    const entry = entries.get(bookingId)
    if (!entry || entry.phase === 'sending') return
    deps.clearTimer(entry.timer)
    entry.phase = 'sending'
    changed()
    try {
      await deps.send(entry.step, { keepalive })
    } catch (error) {
      deps.onFailed?.(entry.step, error)
    } finally {
      entries.delete(bookingId)
      unstore(bookingId)
      changed()
    }
  }

  return {
    /** Press: wait, then send. False when this job already has a step on its way. */
    enqueue(step: Step): boolean {
      if (entries.has(step.bookingId)) return false
      const timer = deps.setTimer(
        () => void send(step.bookingId, false),
        deps.delayMs
      )
      entries.set(step.bookingId, { step, phase: 'waiting', timer })
      store(step)
      changed()
      return true
    },

    /** Undo: true when it was still waiting, false once it has gone. */
    undo(bookingId: string): boolean {
      const entry = entries.get(bookingId)
      if (!entry || entry.phase !== 'waiting') return false
      deps.clearTimer(entry.timer)
      entries.delete(bookingId)
      unstore(bookingId)
      changed()
      return true
    },

    /** Send every waiting step now (the page is going, or the garage or session is changing). */
    flush(options: { keepalive?: boolean } = {}): Promise<unknown> {
      return Promise.allSettled(
        [...entries.entries()]
          .filter(([, entry]) => entry.phase === 'waiting')
          .map(([id]) => send(id, Boolean(options.keepalive)))
      )
    },

    /** Whether a step is still waiting (leaving the page now would need it flushed). */
    hasWaiting(): boolean {
      return [...entries.values()].some((entry) => entry.phase === 'waiting')
    },

    /**
     * After a reload: steps left in storage are sent if their job still has
     * the status it had when pressed, and forgotten otherwise (done already,
     * or changed elsewhere). Only the given garage's steps are looked at.
     */
    resume(jobs: ReadonlyArray<ResumableJob>, vendorId: string | null) {
      for (const step of readStored()) {
        if (entries.has(step.bookingId)) continue
        if (step.vendorId !== vendorId) continue
        const job = jobs.find((j) => j.id === step.bookingId)
        if (!job || !stepStillDue(step, job)) {
          unstore(step.bookingId)
          continue
        }
        entries.set(step.bookingId, { step, phase: 'waiting', timer: null })
        void send(step.bookingId, false)
      }
    },

    get(bookingId: string) {
      return snapshot.get(bookingId)
    },

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type StepQueue = ReturnType<typeof createStepQueue>
