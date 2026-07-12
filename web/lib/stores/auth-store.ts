'use client'

import { create } from 'zustand'
import {
  getAuthMe,
  logout as apiLogout,
  refreshSession,
  verifyOtp as apiVerifyOtp,
  type SendOtpOptions,
  type VerifyOtpOptions,
} from '@/lib/api/auth'
import { mapAuthUser } from '@/lib/api/mappers'
import type { ApiAuthVendor, ApiAuthUser } from '@/lib/api/types'
import type { User } from '@/lib/types'

export type AuthAudience = 'customer' | 'vendor'

interface AuthState {
  user: User | null
  vendor: ApiAuthVendor | null
  audience: AuthAudience | null
  isHydrated: boolean
  isSessionReady: boolean
  isLoading: boolean

  applySession: (
    user: ApiAuthUser,
    vendor: ApiAuthVendor | null,
    audience?: AuthAudience
  ) => void
  fetchSession: () => Promise<void>
  verifyOtp: (options: VerifyOtpOptions) => Promise<{ isNewUser: boolean }>
  restoreSession: () => Promise<boolean>
  logout: () => Promise<void>
  setHydrated: () => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  vendor: null,
  audience: null,
  isHydrated: true, // no localStorage rehydration needed — cookies handle persistence
  isSessionReady: false,
  isLoading: false,

  applySession(user, vendor, audience) {
    set({
      user: mapAuthUser(user),
      vendor,
      audience: audience ?? (vendor ? 'vendor' : 'customer'),
    })
  },

  clearSession() {
    set({ user: null, vendor: null, audience: null })
  },

  async fetchSession() {
    const me = await getAuthMe()
    set({
      user: mapAuthUser(me.user),
      vendor: me.vendor,
      audience: get().audience ?? (me.vendor ? 'vendor' : 'customer'),
    })
  },

  async verifyOtp(options) {
    set({ isLoading: true })
    try {
      const result = await apiVerifyOtp(options)
      set({
        user: mapAuthUser(result.user),
        vendor: result.vendor,
        audience: options.audience,
        isSessionReady: true,
      })
      return { isNewUser: result.isNewUser }
    } finally {
      set({ isLoading: false })
    }
  },

  async restoreSession() {
    set({ isSessionReady: false })
    try {
      const session = await refreshSession()
      set({
        user: mapAuthUser(session.user),
        vendor: session.vendor,
        audience: session.audience,
        isSessionReady: true,
      })
      return true
    } catch {
      get().clearSession()
      set({ isSessionReady: true })
      return false
    }
  },

  async logout() {
    set({ isLoading: true })
    try {
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
