import { useBookingsStore } from '@repo/core/stores/bookings-store';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';

import { useAuth } from './auth';
import { resumeWaitingSteps } from './deferred-status';
import { readFreshBookings } from './fresh-bookings';
import { currentEpoch } from './session-epoch';

/**
 * ONE poller for the garage's jobs, shared by every screen that shows them. A copy
 * of apps/vendors/lib/use-vendor-bookings.ts with AppState in place of the page's
 * visibility: every 10 seconds while the app is in front, and once more as it
 * comes back.
 */
export const POLL_MS = 10_000;

interface PollState {
  vendorId: string | null;
  /** The session and garage this state is about: the same garage, signed in again, starts afresh. */
  epoch: number;
  loaded: boolean;
  failed: boolean;
  retrying: boolean;
}

let state: PollState = { vendorId: null, epoch: currentEpoch(), loaded: false, failed: false, retrying: false };
const listeners = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let appState: NativeEventSubscription | null = null;
let inFlight: { epoch: number; promise: Promise<void> } | null = null;

function update(patch: Partial<PollState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function read(): Promise<void> {
  const epoch = currentEpoch();
  if (inFlight?.epoch === epoch) return inFlight.promise;
  const vendorId = state.vendorId;
  const promise: Promise<void> = readFreshBookings()
    .then((jobs) => {
      if (!jobs) {
        // The last garage's or session's read, undone. A screen still open needs this one's.
        if (users > 0 && useAuth.getState().activeVendorId) void read();
        return;
      }
      if (epoch !== state.epoch) return;
      update({ failed: false, loaded: true });
      resumeWaitingSteps(jobs, vendorId);
    })
    .catch(() => {
      if (epoch === state.epoch) update({ failed: true, loaded: true });
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { epoch, promise };
  return promise;
}

const inFront = () => AppState.currentState === 'active';

function start(vendorId: string) {
  users++;
  if (vendorId !== state.vendorId || currentEpoch() !== state.epoch) {
    update({ vendorId, epoch: currentEpoch(), loaded: false, failed: false });
    void read();
  } else if (users === 1) {
    void read();
  }
  if (!timer) {
    timer = setInterval(() => {
      if (inFront()) void read();
    }, POLL_MS);
    appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void read();
    });
  }
}

function stop() {
  users--;
  if (users > 0 || !timer) return;
  clearInterval(timer);
  timer = null;
  appState?.remove();
  appState = null;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function retry() {
  update({ retrying: true });
  void read().finally(() => update({ retrying: false }));
}

/**
 * The garage's jobs. `loaded` is false only until the first read for this garage
 * settles, so the list never blinks on a poll. `failed` with no earlier list is
 * "Couldn't load", never an empty list or a 0.
 */
export function useVendorBookings() {
  const vendorId = useAuth((s) => s.vendor?.id ?? null);
  const bookings = useBookingsStore((s) => s.vendorBookings);
  const poll = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (!vendorId) return;
    start(vendorId);
    return stop;
  }, [vendorId]);

  const current = poll.vendorId === vendorId && poll.epoch === currentEpoch();
  return {
    bookings,
    loaded: current && poll.loaded,
    failed: current && poll.failed,
    retrying: poll.retrying,
    reload: retry,
  };
}
