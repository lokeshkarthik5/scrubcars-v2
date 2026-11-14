import { addWalkIn, type NewWalkIn, type OwnJob } from '@repo/core/api/garage-book';
import { BOOK_KEY } from '@repo/core/api/hooks/use-garage-book';
import { t } from '@repo/core/i18n';
import { File, Paths } from 'expo-file-system';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { toast } from '@repo/native-ui/toast';

import { onBeforeSignOut, useAuth } from './auth';
import { isFinalRefusal, isNoSignal } from './book-offline-rules';
import { queryClient } from './query-client';

/**
 * Walk-ins saved with no signal (SPEC.md decision 9): kept on the phone and sent as soon as
 * it is back online. Each carries the `client_id` it was made with, so a resend (the app
 * killed mid-send, a timeout after the server wrote it) is the same job on the server, never
 * a second one. Kept in the app's own documents folder, per garage, and emptied on sign-out.
 */
export interface QueuedWalkIn {
  vendorId: string;
  input: NewWalkIn;
  /** How Today shows it until it is sent. */
  preview: OwnJob;
  savedAt: string;
}

interface QueueState {
  items: QueuedWalkIn[];
  /** The last try to reach the server failed for want of a connection. */
  offline: boolean;
  add: (item: QueuedWalkIn) => void;
  remove: (clientId: string) => void;
  setOffline: (offline: boolean) => void;
  clear: () => void;
}

const queueFile = () => new File(Paths.document, 'garage-book-walk-ins.json');

const fileStorage = {
  async getItem(): Promise<string | null> {
    try {
      const file = queueFile();
      return file.exists ? await file.text() : null;
    } catch {
      return null;
    }
  },
  async setItem(_key: string, value: string): Promise<void> {
    try {
      const file = queueFile();
      if (!file.exists) file.create();
      file.write(value);
    } catch {
      // Kept in memory for this run; the next save tries the disk again.
    }
  },
  async removeItem(): Promise<void> {
    try {
      const file = queueFile();
      if (file.exists) file.delete();
    } catch {
      // Nothing to remove.
    }
  },
};

export const useWalkInQueue = create<QueueState>()(
  persist(
    (set) => ({
      items: [],
      offline: false,
      add: (item) => set((state) => ({ items: [...state.items.filter((i) => i.input.clientId !== item.input.clientId), item] })),
      remove: (clientId) => set((state) => ({ items: state.items.filter((i) => i.input.clientId !== clientId) })),
      setOffline: (offline) => set({ offline }),
      clear: () => set({ items: [], offline: false }),
    }),
    {
      name: 'detlio.garageBook.walkIns',
      version: 1,
      storage: createJSONStorage(() => fileStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
);

onBeforeSignOut(() => useWalkInQueue.getState().clear());

export { isNoSignal };

/**
 * Saves a walk-in: sent now when there is signal, kept on the phone when there isn't.
 * Resolves to the saved job and whether it is waiting to be sent.
 */
export async function saveWalkIn(input: NewWalkIn, preview: OwnJob): Promise<{ job: OwnJob; queued: boolean }> {
  const vendorId = useAuth.getState().activeVendorId;
  const queue = useWalkInQueue.getState();
  try {
    const job = await addWalkIn(input);
    queue.setOffline(false);
    void queryClient.invalidateQueries({ queryKey: BOOK_KEY });
    return { job, queued: false };
  } catch (error) {
    if (!isNoSignal(error) || !vendorId) throw error;
    queue.setOffline(true);
    queue.add({ vendorId, input, preview: { ...preview, pending: true }, savedAt: new Date().toISOString() });
    return { job: { ...preview, pending: true }, queued: true };
  }
}

let sending = false;

/** Sends what is waiting for the garage being acted on, oldest first; stops at the first no-signal. */
export async function sendWaiting(): Promise<void> {
  if (sending) return;
  const vendorId = useAuth.getState().activeVendorId;
  if (!vendorId) return;
  sending = true;
  try {
    for (const item of useWalkInQueue.getState().items.filter((i) => i.vendorId === vendorId)) {
      try {
        await addWalkIn(item.input);
        useWalkInQueue.getState().remove(item.input.clientId);
        useWalkInQueue.getState().setOffline(false);
      } catch (error) {
        if (isNoSignal(error)) {
          useWalkInQueue.getState().setOffline(true);
          return;
        }
        // A server hiccup (5xx), a sign-in refresh or a rate limit: keep it and try later.
        if (!isFinalRefusal(error)) return;
        // The server refused it (a service since removed, say): it will never go, so say so
        // and let it go rather than retry it for ever.
        useWalkInQueue.getState().remove(item.input.clientId);
        toast.error(
          t("{name}'s walk-in couldn't be saved: {reason}", {
            name: item.preview.name,
            reason: error instanceof Error ? error.message : t('try again'),
          })
        );
      }
    }
    void queryClient.invalidateQueries({ queryKey: BOOK_KEY });
  } finally {
    sending = false;
  }
}

/** Mounted once in the tabs: sends what waits on start, when the app comes back, and every 20 s while any wait. */
export function useSendWaitingWalkIns(enabled: boolean) {
  const waiting = useWalkInQueue((s) => s.items.length);
  useEffect(() => {
    if (!enabled) return;
    void sendWaiting();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sendWaiting();
    });
    return () => subscription.remove();
  }, [enabled]);
  useEffect(() => {
    if (!enabled || waiting === 0) return;
    const timer = setInterval(() => void sendWaiting(), 20_000);
    return () => clearInterval(timer);
  }, [enabled, waiting]);
}

/** The walk-ins waiting on this phone for the active garage, on a given IST day. */
export function useWaitingWalkIns(dateKey: string): OwnJob[] {
  const vendorId = useAuth((s) => s.activeVendorId);
  const items = useWalkInQueue((s) => s.items);
  return items
    .filter((item) => item.vendorId === vendorId)
    .map((item) => item.preview)
    .filter((job) => new Date(new Date(job.scheduledAt).getTime() + 330 * 60_000).toISOString().slice(0, 10) === dateKey);
}
