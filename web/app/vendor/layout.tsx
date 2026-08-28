'use client'

import { Fragment, useEffect } from 'react'
import { onVendorSwitch, useAuthStore } from '@/lib/stores/auth-store'
import { useBookingsStore } from '@/lib/stores/bookings-store'

/**
 * Remounts every vendor screen when the active company changes.
 *
 * The alternative — a refetch effect on each screen — is one screen away from a
 * bug that looks exactly like a cross-tenant data leak: the previous company's
 * jobs, services or reviews still on screen under the new company's name.
 * Keying the subtree makes "this state belongs to one company" structural, so a
 * screen added later cannot forget.
 *
 * A Fragment key rather than a wrapper element, so the remount costs no DOM.
 */
export default function VendorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const resetBookings = useBookingsStore((s) => s.reset)

  // Stores live outside the React tree, so they survive the remount and have to
  // be cleared explicitly. This fires synchronously during the switch, before
  // the remounted screens fetch anything.
  useEffect(() => onVendorSwitch(resetBookings), [resetBookings])

  return <Fragment key={activeVendorId ?? 'none'}>{children}</Fragment>
}
