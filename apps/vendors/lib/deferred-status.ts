'use client'

import { useSyncExternalStore } from 'react'
import { toast } from 'react-toastify'
import { showUndoToast } from '@repo/ui/sc/undo-toast'
import {
  onBeforeSessionChange,
  useAuthStore,
} from '@repo/core/stores/auth-store'
import {
  markAtGarage,
  markOutForDelivery,
  markPickedUp,
} from '@repo/core/api/bookings'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import {
  createStepQueue,
  isPickupStep,
  type ResumableJob,
  type Step,
  type StepPhase,
  type StepStatus,
} from '@/lib/step-queue'

/**
 * Start job and Complete job with a 5-second Undo (UX audit, garage finding
 * 5), and since 0066 Accept and pickup & drop's Picked up, At garage and Out
 * for delivery too. A wet thumb on the wrong button used to close a job
 * early, and the server has no step back: an accepted or started job has
 * told the customer, a completed one has sent its push and opened the
 * review. So the step waits here five seconds behind an "Undo" toast, and
 * only then goes to the server.
 *
 * The queue (lib/step-queue.ts) lives in this module, not in a component,
 * so leaving the job page doesn't lose a step. It is sent at once:
 *   - when the tab is hidden or the page goes away, with keepalive so the
 *     request outlives the page (and the browser asks before leaving while
 *     one waits); one that still didn't land is resent on the next load
 *   - before the garage is switched or the session ends, for the garage it
 *     was pressed for (each step carries that garage's id)
 */

export const UNDO_MS = 5_000

export type DeferredStatus = StepStatus

const MESSAGES: Record<DeferredStatus, string> = {
  confirmed: 'Booking accepted',
  in_progress: 'Job started',
  completed: 'Job completed',
  picked_up: 'Picked up',
  at_garage: 'At garage',
  out_for_delivery: 'Out for delivery',
}

/** What the screen says while a step waits behind its Undo, or is on its way. */
export const DEFERRED_WORDS: Record<DeferredStatus, string> = {
  confirmed: 'Accepting the booking…',
  in_progress: 'Starting the job…',
  completed: 'Completing the job…',
  picked_up: 'Marking picked up…',
  at_garage: 'Marking at garage…',
  out_for_delivery: 'Marking out for delivery…',
}

/** The request a step makes, under the garage it was pressed for. */
function sendStep(step: Step, keepalive: boolean) {
  const store = useBookingsStore.getState()
  const options = { vendorId: step.vendorId, keepalive }
  if (isPickupStep(step.status)) {
    const status = step.status
    return store.writeVendorBooking(step.bookingId, () =>
      status === 'picked_up'
        ? markPickedUp(step.bookingId, step.code ?? '', options)
        : status === 'at_garage'
          ? markAtGarage(step.bookingId, options)
          : markOutForDelivery(step.bookingId, options)
    )
  }
  return store.updateStatus(step.bookingId, step.status, undefined, options)
}

const undoToastId = (bookingId: string) => `undo-step-${bookingId}`

function sessionStore() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

const queue = createStepQueue({
  delayMs: UNDO_MS,
  storage: sessionStore(),
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  send: (step, { keepalive }) => {
    // Gone to the server: there is nothing left to undo.
    toast.dismiss(undoToastId(step.bookingId))
    return sendStep(step, keepalive)
  },
  onFailed: (_step, error) => {
    // Refused (photos removed meanwhile, extra work asked): say why, and
    // re-read so the job shows what the server holds.
    toast.error(
      error instanceof Error ? error.message : 'Could not update this job'
    )
    void useBookingsStore
      .getState()
      .fetchVendorBookings()
      .catch(() => undefined)
  },
})

if (typeof window !== 'undefined') {
  const leaving = () => void queue.flush({ keepalive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leaving()
  })
  window.addEventListener('pagehide', leaving)
  window.addEventListener('beforeunload', (event) => {
    if (!queue.hasWaiting()) return
    // "Leave site?": a step is still waiting behind its Undo.
    event.preventDefault()
    event.returnValue = ''
  })
  // Sent under the garage and session it was pressed in.
  onBeforeSessionChange(() => queue.flush())
}

/** The status a job has when each step's button shows. */
const FROM: Record<DeferredStatus, string> = {
  confirmed: 'pending',
  in_progress: 'confirmed',
  completed: 'in_progress',
  picked_up: 'confirmed',
  at_garage: 'confirmed',
  out_for_delivery: 'confirmed',
}

/**
 * Accept, start or complete a job, or take a pickup step, in five seconds,
 * unless Undo is pressed first. `code` is Picked up's customer code.
 */
export function changeStatusWithUndo(
  bookingId: string,
  status: DeferredStatus,
  code?: string
) {
  const job = useBookingsStore
    .getState()
    .vendorBookings.find((b) => b.id === bookingId)
  const queued = queue.enqueue({
    bookingId,
    status,
    from: job?.status ?? FROM[status],
    vendorId: useAuthStore.getState().activeVendorId,
    ...(code !== undefined ? { code } : {}),
  })
  if (!queued) return
  showUndoToast(MESSAGES[status], {
    durationMs: UNDO_MS,
    toastId: undoToastId(bookingId),
    onUndo: () => {
      if (!queue.undo(bookingId))
        toast.info('Already saved: it can no longer be undone.')
    },
  })
}

/**
 * Steps a reload left behind: sent now if their job hasn't moved on. Called
 * with each fresh job list for the active garage.
 */
export function resumeWaitingSteps(
  jobs: ReadonlyArray<{
    id: string
    status: string
    pickup?: { nextStep?: string | null } | null
  }>,
  vendorId: string | null
) {
  const resumable: ResumableJob[] = jobs.map((job) => ({
    id: job.id,
    status: job.status,
    pickupNext: job.pickup?.nextStep ?? null,
  }))
  queue.resume(resumable, vendorId)
}

/** The step a job is waiting to send or sending, if any: the screen shows it as done-but-undoable. */
export function useDeferredStatus(
  bookingId: string
): DeferredStatus | undefined {
  return useSyncExternalStore(
    queue.subscribe,
    () => queue.get(bookingId)?.status,
    () => undefined
  )
}

/** Waiting (still undoable) or sending (on its way). */
export function useDeferredPhase(bookingId: string): StepPhase | undefined {
  return useSyncExternalStore(
    queue.subscribe,
    () => queue.get(bookingId)?.phase,
    () => undefined
  )
}
