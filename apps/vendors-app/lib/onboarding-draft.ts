import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useAuth } from './auth';
import { devicePrefs } from './device-prefs';
import { EMPTY_DRAFT, type OnboardingDraft } from './onboarding-logic';

/**
 * The wizard's draft, in place of core's stores/vendor-onboarding-store.ts, which keeps it in
 * the browser's localStorage. Here it is kept on the phone (lib/device-prefs.ts) so a killed
 * app picks up where it left off. It holds no credential. It is emptied when the wizard
 * finishes and when the person signs out, and a draft that belongs to another number is not
 * used (draftFor).
 */
interface DraftState extends OnboardingDraft {
  update: (data: Partial<OnboardingDraft>) => void;
  /** Finished: forget everything. */
  reset: () => void;
}

export const useOnboardingDraft = create<DraftState>()(
  persist(
    (set) => ({
      ...EMPTY_DRAFT,
      update: (data) => set(data),
      reset: () => set({ ...EMPTY_DRAFT }),
    }),
    {
      name: 'detlio.onboardingDraft',
      version: 1,
      storage: createJSONStorage(() => devicePrefs),
      // The data, not the functions.
      partialize: ({ update: _update, reset: _reset, ...data }) => data,
    }
  )
);

/** The draft's data, without its actions. */
export function draftData(state: DraftState): OnboardingDraft {
  const { update: _update, reset: _reset, ...data } = state;
  return data;
}

/**
 * A step still on screen writes its form into the draft as it closes. After the wizard has
 * finished or the person has signed out, that last write must not bring the draft back.
 */
let sealed = false;

/** The wizard is open: writes land. */
export const openDraft = () => {
  sealed = false;
};

/** Finished or signed out: the draft is emptied and takes no more writes until the wizard opens again. */
export function closeDraft() {
  sealed = true;
  useOnboardingDraft.getState().reset();
}

/** A step's write into the draft; ignored once the draft is closed. */
export function writeDraft(data: Partial<OnboardingDraft>) {
  if (!sealed) useOnboardingDraft.getState().update(data);
}

// Signing out (or a session that ended) leaves nothing of the person behind.
useAuth.subscribe((state, previous) => {
  if (previous.user && !state.user) closeDraft();
});
