'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  logout as apiLogout,
  refreshSession,
  verifyOtp as apiVerifyOtp,
  type SendOtpOptions,
  type VerifyOtpOptions,
} from '@/lib/api/auth'
import { setAccessToken } from '@/lib/api/client'
import { mapAuthUser } from '@/lib/api/mappers'
import type { ApiAuthVendor, ApiAuthUser } from '@/lib/api/types'
import type { User } from '@/lib/types'

export type AuthAudience = 'customer' | 'vendor'

interface AuthState {
  user: User | null
  vendor: ApiAuthVendor | null
  audience: AuthAudience | null
  accessToken: string | null
  isHydrated: boolean
  isLoading: boolean

  setSession: (
    user: ApiAuthUser,
    vendor: ApiAuthVendor | null,
    accessToken: string,
    audience: AuthAudience
  ) => void
  verifyOtp: (options: VerifyOtpOptions) => Promise<{ isNewUser: boolean }>
  restoreSession: () => Promise<boolean>
  logout: () => Promise<void>
  setHydrated: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      vendor: null,
      audience: null,
      accessToken: null,
      isHydrated: false,
      isLoading: false,

      setSession(user, vendor, accessToken, audience) {
        setAccessToken(accessToken)
        set({
          user: mapAuthUser(user),
          vendor,
          accessToken,
          audience,
        })
      },

      async verifyOtp(options) {
        set({ isLoading: true })
        try {
          const result = await apiVerifyOtp(options)
          get().setSession(
            result.user,
            result.vendor,
            result.accessToken,
            options.audience
          )
          return { isNewUser: result.isNewUser }
        } finally {
          set({ isLoading: false })
        }
      },

      async restoreSession() {
        const { accessToken } = get()
        if (accessToken) {
          setAccessToken(accessToken)
        }

        try {
          const session = await refreshSession()
          get().setSession(
            session.user,
            session.vendor,
            session.accessToken,
            session.audience
          )
          return true
        } catch {
          set({ user: null, vendor: null, accessToken: null, audience: null })
          setAccessToken(null)
          return false
        }
      },

      async logout() {
        try {
          await apiLogout()
        } finally {
          setAccessToken(null)
          set({
            user: null,
            vendor: null,
            accessToken: null,
            audience: null,
          })
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
        audience: state.audience,
        user: state.user,
        vendor: state.vendor,
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
