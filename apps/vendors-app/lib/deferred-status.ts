import { markAtGarage, markOutForDelivery, markPickedUp } from '@repo/core/api/bookings';
import { useBookingsStore } from '@repo/core/stores/bookings-store';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { showUndoToast, toast } from '@/components/toast';

import { onBeforeSessionChange, useAuth } from './auth';
import { devicePrefs } from './device-prefs';
import { readFreshBookings } from './fresh-bookings';
import {
  createStepQueue,
  isPickupStep,
  type ResumableJob,
  type Step,
  type StepPhase,
  type StepStatus,
} from './jobs';
import { errorText } from './error-text';

/**
 * Accept, Start, Complete and pickup's steps behind a 5-second Undo. A copy of
 * apps/vendors/lib/deferred-status.ts (which needs the DOM and react-toastify);
 * the queue itself is the web's lib/step-queue.ts. What differs is what leaving
 * means: a phone has no pagehide, keepalive or "Leave site?", so a waiting step is
 * sent as the app goes to the background. If the system kills the app inside the
 * five seconds, the step goes on the next launch, if its job hasn't moved on.
 */
export const UNDO_MS = 5_000;

export type DeferredStatus = StepStatus;

const MESSAGES: Record<DeferredStatus, string> = {
  confirmed: 'Booking accepted',
  in_progress: 'Job started',
  completed: 'Job completed',
  picked_up: 'Picked up',
  at_garage: 'At garage',
  out_for_delivery: 'Out for delivery',
};

export const DEFERRED_WORDS: Record<DeferredStatus, string> = {
  confirmed: 'Accepting the booking…',
  in_progress: 'Starting the job…',
  completed: 'Completing the job…',
  picked_up: 'Marking picked up…',
  at_garage: 'Marking at garage…',
  out_for_delivery: 'Marking out for delivery…',
};

function sendStep(step: Step) {
  const store = useBookingsStore.getState();
  const options = { vendorId: step.vendorId };
  if (isPickupStep(step.status)) {
    const status = step.status;
    return store.writeVendorBooking(step.bookingId, () =>
      status === 'picked_up'
        ? markPickedUp(step.bookingId, step.code ?? '', options)
        : status === 'at_garage'
          ? markAtGarage(step.bookingId, options)
          : markOutForDelivery(step.bookingId, options)
    );
  }
  return store.updateStatus(step.bookingId, step.status, undefined, options);
}

const undoToastId = (bookingId: string) => `undo-step-${bookingId}`;

const queue = createStepQueue({
  delayMs: UNDO_MS,
  storage: devicePrefs,
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  send: (step) => {
    // Gone to the server: there is nothing left to undo.
    toast.dismiss(undoToastId(step.bookingId));
    return sendStep(step);
  },
  onFailed: (_step, error) => {
    // Refused (photos removed meanwhile, the time ran out): say why, and re-read.
    toast.error(errorText(error, 'Could not update this job'));
    void readFreshBookings().catch(() => undefined);
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'background') void queue.flush();
});
onBeforeSessionChange(() => queue.flush());

/** The status a job has when each step's button shows. */
const FROM: Record<DeferredStatus, string> = {
  confirmed: 'pending',
  in_progress: 'confirmed',
  completed: 'in_progress',
  picked_up: 'confirmed',
  at_garage: 'confirmed',
  out_for_delivery: 'confirmed',
};

/** Accept, start or complete a job, or take a pickup step, in five seconds, unless Undo is pressed. */
export function changeStatusWithUndo(bookingId: string, status: DeferredStatus, code?: string) {
  const job = useBookingsStore.getState().vendorBookings.find((b) => b.id === bookingId);
  const queued = queue.enqueue({
    bookingId,
    status,
    from: job?.status ?? FROM[status],
    vendorId: useAuth.getState().activeVendorId,
    ...(code !== undefined ? { code } : {}),
  });
  if (!queued) return;
  showUndoToast(MESSAGES[status], {
    durationMs: UNDO_MS,
    toastId: undoToastId(bookingId),
    onUndo: () => {
      if (!queue.undo(bookingId)) toast.info('Already saved: it can no longer be undone.');
    },
  });
}

/** Steps a killed app left behind: sent if their job hasn't moved on. */
export function resumeWaitingSteps(
  jobs: readonly { id: string; status: string; pickup?: { nextStep?: string | null } | null }[],
  vendorId: string | null
) {
  const resumable: ResumableJob[] = jobs.map((job) => ({
    id: job.id,
    status: job.status,
    pickupNext: job.pickup?.nextStep ?? null,
  }));
  queue.resume(resumable, vendorId);
}

export function useDeferredStatus(bookingId: string): DeferredStatus | undefined {
  return useSyncExternalStore(queue.subscribe, () => queue.get(bookingId)?.status);
}

export function useDeferredPhase(bookingId: string): StepPhase | undefined {
  return useSyncExternalStore(queue.subscribe, () => queue.get(bookingId)?.phase);
}
