'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  getAuthMe,
  logout as apiLogout,
  refreshSession,
  verifyOtp as apiVerifyOtp,
  type SendOtpOptions,
  type VerifyOtpOptions,
} from '@/lib/api/auth'
import { setAccessToken } from '@/lib/api/client'
import { deriveAudience } from '@/lib/auth/jwt'
import { mapAuthUser } from '@/lib/api/mappers'
import type { ApiAuthVendor, ApiAuthUser } from '@/lib/api/types'
import type { User } from '@/lib/types'

export type AuthAudience = 'customer' | 'vendor'

interface AuthState {
  accessToken: string | null
  user: User | null
  vendor: ApiAuthVendor | null
  audience: AuthAudience | null
  isHydrated: boolean
  isSessionReady: boolean
  isLoading: boolean

  applySession: (
    accessToken: string,
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

function applySessionToClient(
  accessToken: string,
  user: ApiAuthUser,
  vendor: ApiAuthVendor | null,
  audience?: AuthAudience
) {
  setAccessToken(accessToken)
  return {
    accessToken,
    user: mapAuthUser(user),
    vendor,
    audience: audience ?? deriveAudience(accessToken, vendor),
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      vendor: null,
      audience: null,
      isHydrated: false,
      isSessionReady: false,
      isLoading: false,

      applySession(accessToken, user, vendor, audience) {
        set(applySessionToClient(accessToken, user, vendor, audience))
      },

      clearSession() {
        setAccessToken(null)
        set({
          accessToken: null,
          user: null,
          vendor: null,
          audience: null,
        })
      },

      async fetchSession() {
        const me = await getAuthMe()
        const token = get().accessToken
        if (!token) {
          throw new Error('No access token available')
        }
        set(applySessionToClient(token, me.user, me.vendor))
      },

      async verifyOtp(options) {
        set({ isLoading: true })
        try {
          const result = await apiVerifyOtp(options)
          set({
            ...applySessionToClient(
              result.accessToken,
              result.user,
              result.vendor,
              options.audience
            ),
            isSessionReady: true,
          })
          return { isNewUser: result.isNewUser }
        } finally {
          set({ isLoading: false })
        }
      },

      async restoreSession() {
        set({ isSessionReady: false })
        const { accessToken } = get()

        if (accessToken) {
          setAccessToken(accessToken)
          try {
            await get().fetchSession()
            set({ isSessionReady: true })
            return true
          } catch {
            get().clearSession()
          }
        }

        try {
          const session = await refreshSession()
          set({
            ...applySessionToClient(
              session.accessToken,
              session.user,
              session.vendor,
              session.audience
            ),
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
    }),
    {
      name: 'scrub-cars-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          setAccessToken(state.accessToken)
        }
        state?.setHydrated()
      },
    }
  )
)

export type { SendOtpOptions, VerifyOtpOptions }
