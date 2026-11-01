import type { ApiAuthUser } from '@repo/core/api/types';
import { setUnauthorizedHandler } from '@repo/core/api/client';
import type { NativeSessionData } from '@repo/core/native-session';
import { useBookingsStore } from '@repo/core/stores/bookings-store';
import { useUserStore } from '@repo/core/stores/user-store';
import { create } from 'zustand';

import { usePendingCheckout } from './pending-checkout';
import { queryClient } from './query-client';
import { session } from './session';

/**
 * The app's session store, in place of core's stores/auth-store.ts, which needs
 * localStorage. A guest is a real state: `ready` with no user, and the whole app open.
 */
export type SessionStatus = 'restoring' | 'unreachable' | 'ready';

interface AuthState {
  status: SessionStatus;
  user: ApiAuthUser | null;
  restore: () => Promise<void>;
  applySession: (data: NativeSessionData) => void;
  setName: (name: string) => void;
  signOut: () => Promise<void>;
}

/** Nothing of the last person stays on this phone. */
function forgetPerson() {
  useUserStore.getState().reset();
  useBookingsStore.getState().reset();
  usePendingCheckout.getState().clear();
  queryClient.clear();
}

export const useAuth = create<AuthState>()((set) => ({
  status: 'restoring',
  user: null,

  async restore() {
    set({ status: 'restoring' });
    const result = await session.refresh();
    if (result.status === 'signed-in') set({ status: 'ready', user: result.session.user });
    else if (result.status === 'unreachable') set({ status: 'unreachable' });
    else set({ status: 'ready', user: null });
  },

  applySession(data) {
    // A guest's Home and lists are read again as this person.
    queryClient.clear();
    set({ status: 'ready', user: data.user });
  },

  setName(name) {
    set((state) => ({ user: state.user ? { ...state.user, name } : state.user }));
  },

  async signOut() {
    await session.signOut();
    forgetPerson();
    set({ status: 'ready', user: null });
  },
}));

/** The placeholder name: sign-up isn't finished (the web's app-provider). */
export const isProfileIncomplete = (user: ApiAuthUser | null) => user?.name === 'User';

/**
 * A 401 that could not be refreshed. Still holding a token means no signal, which never
 * signs anyone out; no token means the server ended the session.
 */
export function installUnauthorizedHandler() {
  setUnauthorizedHandler(async () => {
    if (await session.hasRefreshToken()) return;
    forgetPerson();
    useAuth.setState({ status: 'ready', user: null });
  });
  return () => setUnauthorizedHandler(null);
}
