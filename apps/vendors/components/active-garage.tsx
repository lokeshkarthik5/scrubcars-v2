'use client'

import { useAuthStore } from '@repo/core/stores/auth-store'

/**
 * Which garage this is, beside the wordmark — where the customer app shows
 * the customer's location. Left out for someone with two or more garages:
 * the company switcher above already says which one is active, and saying it
 * twice would put two names on one screen.
 */
export function ActiveGarage() {
  const vendor = useAuthStore((s) => s.vendor)
  const vendorCount = useAuthStore((s) => s.vendors.length)

  if (!vendor || vendorCount > 1) return null

  return (
    <p className="truncate text-[13px] font-medium text-text-secondary">
      {vendor.businessName}
    </p>
  )
}
