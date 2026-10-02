'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import { setUnauthorizedHandler } from '@repo/core/api/client'
import { APP_VERSION } from '@repo/core/version'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { SIGNED_IN_HINT_KEY } from './signed-in-landing'

/**
 * Route gate for the customer app.
 *
 * This host serves customers only, so there is no audience to disambiguate:
 * anyone signed in is browsing as a customer here. A vendor owner who visits
 * detlio.com stays on the customer site — the vendor portal is its own
 * deployment on its own domain, and bouncing them off this one would make the
 * two accounts they actually have impossible to use at the same time.
 */
type RouteAccess = 'marketing' | 'public' | 'guest' | 'customer'

/**
 * The marketing homepage. Unlike every other route it renders before the
 * session resolves: it is the page search engines index and first-time
 * visitors land on, so it has to arrive as server-rendered HTML rather than
 * waiting on a round trip to the API. Signed-in customers are still sent on
 * to the app — before paint by a localStorage hint, or here once the session
 * resolves if the hint was missing (see signed-in-landing.ts).
 */
const MARKETING_ROUTES = ['/']
const GUEST_ROUTES = ['/login', '/verify-otp']
const CUSTOMER_ROUTES = ['/book', '/profile-setup']

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

function getRouteAccess(pathname: string): RouteAccess {
  // Exact match: matchesRoute would treat every path as under '/'.
  if (MARKETING_ROUTES.includes(pathname)) return 'marketing'
  if (matchesRoute(pathname, GUEST_ROUTES)) return 'guest'
  if (matchesRoute(pathname, CUSTOMER_ROUTES)) return 'customer'
  return 'public'
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isHydrated, isSessionReady, user, restoreSession } = useAuthStore(
    useShallow((s) => ({
      isHydrated: s.isHydrated,
      isSessionReady: s.isSessionReady,
      user: s.user,
      restoreSession: s.restoreSession,
    }))
  )

  // Printed once per load so a bug report can name the build it came from.
  useEffect(() => {
    console.log(`%cDetlio v${APP_VERSION}`, 'color:#E33402;font-weight:600')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      const { logout, clearSession } = useAuthStore.getState()

      try {
        await logout()
      } catch {
        clearSession()
        useAuthStore.setState({ isSessionReady: true })
      }

      useUserStore.getState().reset()
      useBookingsStore.getState().reset()

      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    })

    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    void restoreSession()
  }, [isHydrated, restoreSession])

  const routeAccess = getRouteAccess(pathname)
  const isProfileIncomplete = user?.name === 'User'
  const signedInLanding = isProfileIncomplete ? '/profile-setup' : '/home'

  let redirectPath: string | null = null

  if (isHydrated && isSessionReady) {
    if (routeAccess === 'marketing' || routeAccess === 'guest') {
      redirectPath = user ? signedInLanding : null
    } else if (routeAccess === 'public') {
      redirectPath = null
    } else if (!user) {
      redirectPath = '/login'
    } else if (isProfileIncomplete && pathname !== '/profile-setup') {
      redirectPath = '/profile-setup'
    }
  }

  useEffect(() => {
    if (redirectPath && redirectPath !== pathname) router.replace(redirectPath)
  }, [pathname, redirectPath, router])

  useEffect(() => {
    if (!isHydrated || !isSessionReady) return
    try {
      if (user && !isProfileIncomplete) window.localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
      else window.localStorage.removeItem(SIGNED_IN_HINT_KEY)
    } catch {
      // Storage blocked (private mode, policy). The hint is an optimisation;
      // the redirect above still runs once the session resolves.
    }
  }, [isHydrated, isSessionReady, user, isProfileIncomplete])

  // Never gated: the homepage is server-rendered for every visitor. A
  // signed-in one keeps seeing it, rather than a blank screen, for the moment
  // the redirect takes.
  if (routeAccess === 'marketing') return <>{children}</>

  if (
    !isHydrated ||
    !isSessionReady ||
    (redirectPath && redirectPath !== pathname)
  ) {
    return null
  }

  return <>{children}</>
}
