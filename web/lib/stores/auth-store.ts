'use client'

import { create } from 'zustand'
import {
  getAuthMe,
  logout as apiLogout,
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
    console.log('[auth] verifyOtp called', { audience: options.audience, purpose: options.purpose })
    set({ isLoading: true })
    try {
      const result = await apiVerifyOtp(options)
      console.log('[auth] verifyOtp success — setting session', { userId: result.user.id, isNewUser: result.isNewUser })
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
    console.log('[auth] restoreSession called')
    set({ isSessionReady: false })
    try {
      const me = await getAuthMe({ auth: false })
      console.log('[auth] restoreSession success', { userId: me.user.id })
      set({
        user: mapAuthUser(me.user),
        vendor: me.vendor,
        audience: get().audience ?? (me.vendor ? 'vendor' : 'customer'),
        isSessionReady: true,
      })
      return true
    } catch (err) {
      console.log('[auth] restoreSession failed — clearing session', err instanceof Error ? err.message : err)
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
