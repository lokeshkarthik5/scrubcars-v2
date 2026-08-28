'use client'

import { useAuthStore } from '@/lib/stores/auth-store'
import type { VendorRole } from '@/lib/api/types'

/**
 * The caller's role in the company they are currently acting as.
 *
 * This is convenience, not a boundary — the server refuses what an operator may
 * not do regardless of what the UI renders. So when the role is not yet known
 * (a session restored by an older client, or the moment before the switcher
 * hydrates) this reports admin and lets the screen render; the request behind it
 * is the thing that gets refused.
 */
export function useVendorRole(): VendorRole {
  return useAuthStore((s) => s.role) ?? 'vendor_admin'
}

export function useIsVendorAdmin(): boolean {
  return useVendorRole() === 'vendor_admin'
}
