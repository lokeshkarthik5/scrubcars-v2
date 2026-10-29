'use client'

import { useState } from 'react'
import { IconLogout } from '@tabler/icons-react'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'

/**
 * "Sign out" on the first sign-up step (0066). A login with no garage lands
 * here and had no way out: the wrong number, a staff login whose garage
 * removed it, or someone who only wanted to look.
 */
export function OnboardingSignOut() {
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    setBusy(true)
    try {
      await useAuthStore.getState().logout()
    } finally {
      useUserStore.getState().reset()
      useBookingsStore.getState().reset()
      useVendorOnboardingStore.getState().reset()
      window.location.href = '/login'
    }
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      className="flex min-h-11 items-center gap-1.5 px-1 text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
    >
      <IconLogout size={18} aria-hidden="true" />
      Sign out
    </button>
  )
}
