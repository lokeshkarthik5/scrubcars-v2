'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { PanelShell, type PanelNavItem } from '@/components/sc/panel-shell'
import { adminLogout, getAdminMe } from '@/lib/api/admin'

const NAV: PanelNavItem[] = [
  { href: '/admin/vendors', label: 'Vendors' },
  { href: '/admin/bookings', label: 'Bookings' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // Login page renders standalone, without the chrome (and without a guard).
  const isLogin = pathname.endsWith('/login') || pathname.endsWith('/admin')

  // Guard every non-login admin page: bounce to /login when the session is
  // missing or invalid. Hold the UI back until the session check resolves so
  // the chrome/content never flashes for signed-out visitors.
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    if (isLogin) return
    let active = true
    getAdminMe()
      .then((me) => {
        if (!active) return
        if (me.isAdmin) setAuthed(true)
        else router.replace('/admin/login')
      })
      .catch(() => {
        if (active) router.replace('/admin/login')
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
      router.replace('/admin/login')
    }
  }

  return (
    <PanelShell
      brandLabel="Admin"
      navItems={NAV}
      navType="admin"
      onLogout={handleLogout}
      className="gap-5"
    >
      {children}
    </PanelShell>
  )
}
