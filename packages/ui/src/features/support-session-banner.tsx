'use client'

import { useEffect, useState } from 'react'
import { IconShieldLock } from '@tabler/icons-react'
import { subscribeToSupportSession } from '@repo/core/api/client'
import { useAuthStore } from '@repo/core/stores/auth-store'

/**
 * Persistent banner shown while Detlio staff are acting inside a customer's
 * company through a platform grant rather than a seat.
 *
 * A support session resolves as `vendor_admin` — it can change this garage's
 * prices and read its earnings — so the least it can do is say so on every
 * screen. The signal is a response header, not a body field, because it has to
 * be true of the whole session rather than of one endpoint's payload.
 */
export function SupportSessionBanner() {
  const [active, setActive] = useState(false)
  const vendor = useAuthStore((s) => s.vendor)

  useEffect(() => subscribeToSupportSession(setActive), [])

  if (!active) return null

  return (
    <div className="flex items-center gap-2 rounded-[10px] border-l-[3px] border-warning bg-warning-muted/30 px-3 py-2 text-[12px] text-text-primary">
      <IconShieldLock size={16} stroke={1.5} className="shrink-0" />
      <span>
        Detlio support session
        {vendor?.businessName ? ` on ${vendor.businessName}` : ''}. Actions here
        are recorded.
      </span>
    </div>
  )
}
