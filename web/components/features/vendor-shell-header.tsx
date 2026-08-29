'use client'

import { useEffect, useState } from 'react'
import { subscribeToSupportSession } from '@/lib/api/client'
import { useAuthStore } from '@/lib/stores/auth-store'
import { CompanySwitcher } from './company-switcher'
import { SupportSessionBanner } from './support-session-banner'

/**
 * The strip above every vendor screen: which company you are acting as, and
 * whether this is a Detlio support session.
 *
 * It lives in the shell rather than in each page so a screen cannot be added
 * that quietly omits either — and it collapses to nothing for the single-company
 * case, which is almost everyone.
 */
export function VendorShellHeader() {
  const vendorCount = useAuthStore((s) => s.vendors.length)
  const [isSupportSession, setIsSupportSession] = useState(false)

  useEffect(() => subscribeToSupportSession(setIsSupportSession), [])

  if (vendorCount < 2 && !isSupportSession) return null

  return (
    <div className="flex flex-col gap-2 pt-3">
      <SupportSessionBanner />
      {vendorCount > 1 && (
        <div className="flex justify-end">
          <CompanySwitcher />
        </div>
      )}
    </div>
  )
}
