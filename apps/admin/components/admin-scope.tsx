'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { PanelShell, type PanelNavItem } from '@repo/ui/sc/panel-shell'
import { adminLogout, getAdminMe } from '@repo/core/api/admin'
import { useDataResetConfig } from '@repo/core/api/hooks/use-admin-data-reset'

const NAV: PanelNavItem[] = [
  { href: '/vendors', label: 'Vendors' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/complaints', label: 'Complaints' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/payouts', label: 'Payouts' },
  { href: '/discounts', label: 'Discounts' },
  { href: '/coverage', label: 'Coverage' },
  { href: '/statistics', label: 'Statistics' },
]

// Only while the API has it switched on (ADMIN_DATA_RESET); otherwise the
// API answers 404 and the item is not there. On a phone the bottom bar has
// no room for a seventh tab, so the Bookings page links to it instead.
const RESET_NAV: PanelNavItem = { href: '/data-reset', label: 'Start pilot clean' }

export function AdminScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // Login page renders standalone, without the chrome (and without a guard).
  // '/' is the redirect stub in front of it, and must not be guarded either or
  // a signed-out visitor lands on a black screen instead of the login form.
  const isLogin = pathname === '/' || pathname === '/login'

  // Guard every non-login admin page: bounce to /login when the session is
  // missing or invalid. Hold the UI back until the session check resolves so
  // the chrome/content never flashes for signed-out visitors.
  const [authed, setAuthed] = useState(false)
  const { data: resetConfig } = useDataResetConfig(authed)

  useEffect(() => {
    if (isLogin) return
    let active = true
    getAdminMe()
      .then((me) => {
        if (!active) return
        if (me.isSuperAdmin) setAuthed(true)
        else router.replace('/login')
      })
      .catch(() => {
        if (active) router.replace('/login')
      })
    return () => {
      active = false
    }
  }, [isLogin, pathname, router])

  if (isLogin) {
    return <>{children}</>
  }

  if (!authed) {
    return <div className="min-h-dvh bg-brand-black" />
  }

  const handleLogout = async () => {
    try {
      await adminLogout()
    } finally {
      router.replace('/login')
    }
  }

  return (
    <PanelShell
      brandLabel="Admin"
      navItems={resetConfig?.enabled ? [...NAV, RESET_NAV] : NAV}
      navType="admin"
      onLogout={handleLogout}
      className="gap-5"
    >
      {children}
    </PanelShell>
  )
}
