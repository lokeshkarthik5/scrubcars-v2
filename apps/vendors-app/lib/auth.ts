import type { ApiAuthUser, ApiAuthVendor, VendorRole } from '@repo/core/api/types';
import { clearSupportSession, setActiveVendorId, setUnauthorizedHandler } from '@repo/core/api/client';
import type { NativeSessionData } from '@repo/core/native-session';
import { useBookingsStore } from '@repo/core/stores/bookings-store';
import { create } from 'zustand';

import { devicePrefs } from './device-prefs';
import { queryClient } from './query-client';
import { session } from './session';
import { bumpEpoch } from './session-epoch';

/**
 * The app's session store, in place of core's stores/auth-store.ts, which needs
 * localStorage. The same flat fields and rules: the active garage is a
 * preference, checked against the seats on the way back in; every request is
 * stamped with it (setActiveVendorId); a switch clears whatever the last garage
 * left behind.
 */
const ACTIVE_VENDOR_KEY = 'detlio.activeVendorId';

export type SessionStatus = 'restoring' | 'unreachable' | 'ready';

interface AuthState {
  status: SessionStatus;
  user: ApiAuthUser | null;
  vendor: ApiAuthVendor | null;
  vendors: ApiAuthVendor[];
  activeVendorId: string | null;
  role: VendorRole | null;
  isOwner: boolean;
  restore: () => Promise<void>;
  applySession: (data: NativeSessionData) => void;
  setActiveVendor: (vendorId: string) => void;
  /** `sessionGone`: the server has ended it already (the account was deleted). */
  signOut: (options?: { sessionGone?: boolean }) => Promise<void>;
  /** Re-reads the garages after a seat changed, and goes on with what's left. */
  reloadSession: () => Promise<void>;
}

function vendorState(vendors: ApiAuthVendor[], preferred: string | null) {
  const active = vendors.find((v) => v.id === preferred) ?? vendors[0] ?? null;
  setActiveVendorId(active?.id ?? null);
  if (active) devicePrefs.setItem(ACTIVE_VENDOR_KEY, active.id);
  else devicePrefs.removeItem(ACTIVE_VENDOR_KEY);
  return {
    vendors,
    vendor: active,
    activeVendorId: active?.id ?? null,
    role: active?.role ?? null,
    isOwner: active?.isOwner ?? false,
  };
}

/** Work that must go under the current garage and session first: steps behind Undo. */
const beforeChange = new Set<() => void | Promise<unknown>>();

export function onBeforeSessionChange(hook: () => void | Promise<unknown>) {
  beforeChange.add(hook);
  return () => {
    beforeChange.delete(hook);
  };
}

/** Before signing out only: this phone's alerts stop while the session can still say so. */
const beforeSignOut = new Set<(options: { sessionGone: boolean }) => void | Promise<unknown>>();

export function onBeforeSignOut(hook: (options: { sessionGone: boolean }) => void | Promise<unknown>) {
  beforeSignOut.add(hook);
  return () => {
    beforeSignOut.delete(hook);
  };
}

const runBeforeChange = () => Promise.allSettled([...beforeChange].map(async (hook) => hook()));

const SIGNED_OUT = {
  user: null,
  vendor: null,
  vendors: [],
  activeVendorId: null,
  role: null,
  isOwner: false,
};

/** Nothing of the last garage or person stays, and a read still on its way is void. */
function clearGarageData() {
  bumpEpoch();
  useBookingsStore.getState().reset();
  queryClient.clear();
}

function forgetSession() {
  setActiveVendorId(null);
  devicePrefs.removeItem(ACTIVE_VENDOR_KEY);
  clearSupportSession();
  clearGarageData();
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: 'restoring',
  ...SIGNED_OUT,

  async restore() {
    set({ status: 'restoring' });
    const result = await session.refresh();
    if (result.status === 'signed-in') get().applySession(result.session);
    else if (result.status === 'unreachable') set({ status: 'unreachable' });
    else set({ status: 'ready', ...SIGNED_OUT });
  },

  applySession(data) {
    const list = data.vendors.length > 0 ? data.vendors : data.vendor ? [data.vendor] : [];
    // Leaving a garage lands here with another one active.
    const next = vendorState(list, devicePrefs.getItem(ACTIVE_VENDOR_KEY));
    if (next.activeVendorId !== get().activeVendorId) clearGarageData();
    set({ status: 'ready', user: data.user, ...next });
  },

  setActiveVendor(vendorId) {
    const { vendors, activeVendorId } = get();
    if (vendorId === activeVendorId || !vendors.some((v) => v.id === vendorId)) return;
    // Sent for the garage it was pressed for; each step names it.
    void runBeforeChange();
    // Before the new garage's screens mount: nothing of the last one stays.
    clearGarageData();
    set(vendorState(vendors, vendorId));
  },

  async reloadSession() {
    const result = await session.refresh();
    if (result.status === 'signed-in') get().applySession(result.session);
  },

  async signOut(options) {
    const sessionGone = options?.sessionGone ?? false;
    await runBeforeChange();
    await Promise.allSettled([...beforeSignOut].map(async (hook) => hook({ sessionGone })));
    await session.signOut();
    forgetSession();
    set({ status: 'ready', ...SIGNED_OUT });
  },
}));

/**
 * A 401 that could not be refreshed. Still holding a token means no signal, which
 * never signs anyone out; no token means the server ended the session.
 */
export function installUnauthorizedHandler() {
  setUnauthorizedHandler(async () => {
    if (await session.hasRefreshToken()) return;
    forgetSession();
    useAuth.setState({ status: 'ready', ...SIGNED_OUT });
  });
  return () => setUnauthorizedHandler(null);
}

/**
 * As core's useIsVendorAdmin: convenience, not a boundary. An unknown role reads
 * as admin and the server refuses what isn't allowed.
 */
export function useIsVendorAdmin(): boolean {
  return useAuth((s) => s.role ?? 'vendor_admin') === 'vendor_admin';
}
