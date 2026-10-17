'use client'

import { create } from 'zustand'
import {
  getAuthMe,
  getMyVendors,
  logout as apiLogout,
  refreshSession as apiRefreshSession,
  verifyOtp as apiVerifyOtp,
  type SendOtpOptions,
  type VerifyOtpOptions,
} from '@repo/core/api/auth'
import { clearSupportSession, setActiveVendorId } from '@repo/core/api/client'
import { mapAuthUser } from '@repo/core/api/mappers'
import type { ApiAuthVendor, ApiAuthUser, VendorRole } from '@repo/core/api/types'
import type { User } from '@repo/core/types'
import { forgetThisBrowser } from '@repo/core/push'

export type AuthAudience = 'customer' | 'vendor'

const ACTIVE_VENDOR_KEY = 'detlio.activeVendorId'

/**
 * The active company survives a reload, but is never trusted on the way back
 * in: it is validated against the caller's seats on session restore and falls
 * back to the first company if it no longer resolves. A stale id left in
 * localStorage would otherwise 404 every vendor screen after a seat is revoked.
 */
function readStoredVendorId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ACTIVE_VENDOR_KEY)
}

function persistVendorId(vendorId: string | null) {
  if (typeof window === 'undefined') return
  if (vendorId) window.localStorage.setItem(ACTIVE_VENDOR_KEY, vendorId)
  else window.localStorage.removeItem(ACTIVE_VENDOR_KEY)
}

/**
 * Pick the company to act as: last used when it is still one of theirs, the
 * first otherwise — the same rule on login, on restore, and after a seat is
 * revoked mid-session.
 */
function resolveActiveVendor(
  vendors: ApiAuthVendor[],
  preferred: string | null
): ApiAuthVendor | null {
  if (vendors.length === 0) return null
  return vendors.find((v) => v.id === preferred) ?? vendors[0]
}

interface AuthState {
  user: User | null
  /** The company being acted on. Derived from `vendors` + `activeVendorId`. */
  vendor: ApiAuthVendor | null
  /** Every company this person can act as. */
  vendors: ApiAuthVendor[]
  activeVendorId: string | null
  /** Role in the active company. Null until the session reports one. */
  role: VendorRole | null
  isOwner: boolean
  audience: AuthAudience | null
  isHydrated: boolean
  isSessionReady: boolean
  isLoading: boolean

  applySession: (
    user: ApiAuthUser,
    vendor: ApiAuthVendor | null,
    audience?: AuthAudience,
    vendors?: ApiAuthVendor[]
  ) => void
  fetchSession: () => Promise<void>
  verifyOtp: (options: VerifyOtpOptions) => Promise<{ isNewUser: boolean }>
  restoreSession: () => Promise<boolean>
  setActiveVendor: (vendorId: string) => void
  refreshVendors: () => Promise<void>
  logout: () => Promise<void>
  setHydrated: () => void
  clearSession: () => void
}

/**
 * Collapses the company list and the chosen id into the flat fields every
 * screen already reads (`vendor`, `role`, `isOwner`), and tells the API client
 * which company to stamp on outgoing requests. One place, so a switch can never
 * leave the header pointing at the company before it.
 */
function vendorState(vendors: ApiAuthVendor[], preferred: string | null) {
  const active = resolveActiveVendor(vendors, preferred)
  setActiveVendorId(active?.id ?? null)
  persistVendorId(active?.id ?? null)

  return {
    vendors,
    vendor: active,
    activeVendorId: active?.id ?? null,
    role: active?.role ?? null,
    isOwner: active?.isOwner ?? false,
  }
}

/**
 * Everything a company switch must invalidate. The vendor stores hold the
 * previous company's rows, and leaving them on screen after a switch looks
 * exactly like a cross-tenant data leak — so screens subscribe here rather than
 * each remembering to refetch.
 */
const vendorSwitchListeners = new Set<() => void>()

export function onVendorSwitch(listener: () => void) {
  vendorSwitchListeners.add(listener)
  return () => {
    vendorSwitchListeners.delete(listener)
  }
}

function notifyVendorSwitch() {
  vendorSwitchListeners.forEach((listener) => listener())
}

function sessionVendors(session: {
  vendor: ApiAuthVendor | null
  vendors?: ApiAuthVendor[]
}): ApiAuthVendor[] {
  // `vendors` is the source of truth; `vendor` is the compatibility field an
  // older server (or an older cached response) may be the only one to send.
  return session.vendors ?? (session.vendor ? [session.vendor] : [])
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  vendor: null,
  vendors: [],
  activeVendorId: null,
  role: null,
  isOwner: false,
  audience: null,
  isHydrated: true, // no localStorage rehydration needed — cookies handle persistence
  isSessionReady: false,
  isLoading: false,

  applySession(user, vendor, audience, vendors) {
    const list = sessionVendors({ vendor, vendors })
    set({
      user: mapAuthUser(user),
      ...vendorState(list, readStoredVendorId()),
      audience: audience ?? (list.length > 0 ? 'vendor' : 'customer'),
    })
  },

  clearSession() {
    setActiveVendorId(null)
    persistVendorId(null)
    // The support-session flag latches for the whole session, so this is the
    // one place it comes back down.
    clearSupportSession()
    set({
      user: null,
      vendor: null,
      vendors: [],
      activeVendorId: null,
      role: null,
      isOwner: false,
      audience: null,
    })
  },

  setActiveVendor(vendorId) {
    const { vendors, activeVendorId } = get()
    if (vendorId === activeVendorId) return
    if (!vendors.some((v) => v.id === vendorId)) return

    set(vendorState(vendors, vendorId))
    notifyVendorSwitch()
  },

  /** Re-reads the company list — after creating one, or being added to one. */
  async refreshVendors() {
    const vendors = await getMyVendors()
    set(vendorState(vendors, get().activeVendorId ?? readStoredVendorId()))
  },

  async fetchSession() {
    const me = await getAuthMe()
    const list = sessionVendors(me)
    set({
      user: mapAuthUser(me.user),
      ...vendorState(list, get().activeVendorId ?? readStoredVendorId()),
      audience: get().audience ?? (list.length > 0 ? 'vendor' : 'customer'),
    })
  },

  async verifyOtp(options) {
    console.log('[auth] verifyOtp called', { audience: options.audience, purpose: options.purpose })
    set({ isLoading: true })
    try {
      const result = await apiVerifyOtp(options)
      console.log('[auth] verifyOtp success — setting session', { userId: result.user.id, isNewUser: result.isNewUser })
      const list = sessionVendors(result)
      set({
        user: mapAuthUser(result.user),
        ...vendorState(list, readStoredVendorId()),
        audience: options.audience,
        isSessionReady: true,
      })
      return { isNewUser: result.isNewUser }
    } finally {
      set({ isLoading: false })
    }
  },

  async restoreSession() {
    console.log('[auth] restoreSession called')
    set({ isSessionReady: false })

    const applyMe = (me: {
      user: ApiAuthUser
      vendor: ApiAuthVendor | null
      vendors?: ApiAuthVendor[]
    }) => {
      const list = sessionVendors(me)
      set({
        user: mapAuthUser(me.user),
        // The stored id is a preference, not a claim: if it is no longer in
        // this list, the first company wins.
        ...vendorState(list, readStoredVendorId()),
        audience: get().audience ?? (list.length > 0 ? 'vendor' : 'customer'),
        isSessionReady: true,
      })
    }

    try {
      const me = await getAuthMe({ auth: false })
      console.log('[auth] restoreSession success', { userId: me.user.id })
      applyMe(me)
      return true
    } catch (err) {
      // The short-lived access token has likely expired while the tab was
      // closed. Exchange the long-lived refresh cookie for a new access token
      // and retry before giving up, so the session survives a window reopen.
      console.log('[auth] restoreSession first attempt failed — trying refresh', err instanceof Error ? err.message : err)
      try {
        const session = await apiRefreshSession()
        console.log('[auth] restoreSession success after refresh', { userId: session.user.id })
        applyMe(session)
        return true
      } catch (refreshErr) {
        console.log('[auth] restoreSession refresh failed', refreshErr instanceof Error ? refreshErr.message : refreshErr)
      }

      console.log('[auth] restoreSession failed — clearing session')
      get().clearSession()
      set({ isSessionReady: true })
      return false
    }
  },

  async logout() {
    set({ isLoading: true })
    try {
      // This browser stops getting the account's notifications (0044),
      // while the session can still say so to the API. Never holds up or
      // fails the sign-out.
      await forgetThisBrowser(get().audience === 'vendor' ? 'garage' : 'customer').catch(() => undefined)
      await apiLogout()
    } finally {
      get().clearSession()
      set({ isLoading: false, isSessionReady: true })
    }
  },

  setHydrated() {
    set({ isHydrated: true })
  },
}))

export type { SendOtpOptions, VerifyOtpOptions }
