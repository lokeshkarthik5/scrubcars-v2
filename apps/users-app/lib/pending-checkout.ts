import type { PendingCheckout } from '@repo/core/stores/pending-checkout-store';
import { create } from 'zustand';

import { devicePrefs } from './device-prefs';

/**
 * What Home hands to checkout: the offer tapped, the car on screen. The rules are core's
 * (livePendingCheckout, in stores/pending-checkout-store.ts); core's store itself keeps
 * this in localStorage, so the phone has its own copy of the store. Cleared on sign-out.
 */
const KEY = 'detlio.pendingCheckout';

function read(): PendingCheckout | null {
  try {
    const stored = devicePrefs.getItem(KEY);
    return stored ? (JSON.parse(stored) as PendingCheckout) : null;
  } catch {
    return null;
  }
}

interface PendingState {
  pending: PendingCheckout | null;
  rememberOffer: (offer: Omit<PendingCheckout, 'savedAt'>) => void;
  rememberCar: (car: { userId: string; vehicleId: string }) => void;
  forgetCode: () => void;
  clear: () => void;
}

export const usePendingCheckout = create<PendingState>()((set, get) => {
  const save = (pending: PendingCheckout | null) => {
    set({ pending });
    if (pending) devicePrefs.setItem(KEY, JSON.stringify(pending));
    else devicePrefs.removeItem(KEY);
  };
  return {
    pending: read(),
    rememberOffer: (offer) => save({ ...offer, savedAt: Date.now() }),
    rememberCar: ({ userId, vehicleId }) => {
      const keep = get().pending?.userId === userId ? get().pending : null;
      save({
        userId,
        code: keep?.code ?? null,
        vendorId: keep?.vendorId ?? null,
        endsAt: keep?.endsAt ?? null,
        vehicleId,
        savedAt: Date.now(),
      });
    },
    // A code the server refused for good: keep the car, drop the code.
    forgetCode: () => {
      const keep = get().pending;
      if (keep) save({ ...keep, code: null, vendorId: null, endsAt: null });
    },
    clear: () => save(null),
  };
});
