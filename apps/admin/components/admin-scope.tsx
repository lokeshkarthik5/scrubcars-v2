'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { adminLogout, getAdminMe } from '@repo/core/api/admin'
import { setUnauthorizedHandler } from '@repo/core/api/client'
import { adminLoginKeys, useAdminMe } from '@repo/core/api/hooks/use-admin-logins'
import { useAdminGiftsConfig } from '@repo/core/api/hooks/use-admin-gifts'
import { useAdminGuaranteeConfig } from '@repo/core/api/hooks/use-guarantee'
import { useAdminRewardsConfig } from '@repo/core/api/hooks/use-admin-rewards'
import { AdminShell } from '@/components/admin-shell'
import { adminTodayKeys, useAdminToday } from '@/hooks/use-admin-today'
import { navCounts } from '@/lib/today'

/** After an action, the menu's counts are read again at most this often. */
const TODAY_REFRESH_AFTER_ACTION_MS = 3_000

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
  // Who is signed in, for the sidebar: the session check below fills it.
  const { data: me } = useAdminMe(authed)

  // Anything ops does on any page (accept, refund, acknowledge, verify) can
  // change a count, so the summary is read again after an action that
  // worked: once, a few seconds after a burst of them, not once per press.
  const queryClient = useQueryClient()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void queryClient.invalidateQueries({ queryKey: adminTodayKeys.all })
      }, TODAY_REFRESH_AFTER_ACTION_MS)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [queryClient])

  // A 401 on any admin call means the session is over: it ran out, or (a
  // personal login, 0058) it was turned off or its password reset
  // (ADMIN_SESSION_ENDED). Back to sign in, rather than an error on the page.
  useEffect(() => {
    if (isLogin) return
    setUnauthorizedHandler(() => {
      setAuthed(false)
      queryClient.removeQueries({ queryKey: adminLoginKeys.me })
      router.replace('/login')
    })
    return () => setUnauthorizedHandler(null)
  }, [isLogin, queryClient, router])

  useEffect(() => {
    if (isLogin) return
    let active = true
    // Through the query cache, so useAdminMe (the sidebar, "Signed as") has
    // the answer without asking again.
    queryClient
      .fetchQuery({ queryKey: adminLoginKeys.me, queryFn: getAdminMe, staleTime: 0 })
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
  }, [isLogin, pathname, queryClient, router])

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
      // The next person to sign in on this device is not shown as this one.
      setAuthed(false)
      queryClient.removeQueries({ queryKey: adminLoginKeys.me })
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
      me={me}
      onLogout={handleLogout}
    >
      {children}
    </AdminShell>
  )
}
