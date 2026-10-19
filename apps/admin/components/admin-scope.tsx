'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { adminLogout, getAdminMe } from '@repo/core/api/admin'
import { useAdminGiftsConfig } from '@repo/core/api/hooks/use-admin-gifts'
import { useAdminGuaranteeConfig } from '@repo/core/api/hooks/use-guarantee'
import { useAdminRewardsConfig } from '@repo/core/api/hooks/use-admin-rewards'
import { AdminShell } from '@/components/admin-shell'
import { adminTodayKeys, useAdminToday } from '@/hooks/use-admin-today'
import { navCounts } from '@/lib/today'

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
  const { data: giftsConfig } = useAdminGiftsConfig(authed)
  const { data: guaranteeConfig } = useAdminGuaranteeConfig(authed)
  const { data: rewardsConfig } = useAdminRewardsConfig(authed)
  // The menu's counts: the same summary the Today page lists, refreshed every
  // minute. A failed load leaves the counts off rather than showing zeros.
  const { data: today } = useAdminToday(authed)

  // Anything ops does on any page (accept, refund, acknowledge, verify) can
  // change a count, so the summary is read again after every action that
  // worked, not only on the minute.
  const queryClient = useQueryClient()
  useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') {
        void queryClient.invalidateQueries({ queryKey: adminTodayKeys.all })
      }
    })
  }, [queryClient])

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
    <AdminShell
      features={{
        gifts: giftsConfig?.enabled === true,
        rewards: rewardsConfig?.masterSwitch === true,
        guarantee: guaranteeConfig?.enabled === true,
      }}
      counts={today ? navCounts(today) : undefined}
      onLogout={handleLogout}
    >
      {children}
    </AdminShell>
  )
}
