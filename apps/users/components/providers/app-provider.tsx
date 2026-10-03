'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import { setUnauthorizedHandler } from '@repo/core/api/client'
import { APP_VERSION } from '@repo/core/version'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'

/**
 * Route gate for the customer app.
 *
 * This host serves customers only, so there is no audience to disambiguate:
 * anyone signed in is browsing as a customer here. A vendor owner who visits
 * detlio.com stays on the customer site — the vendor portal is its own
 * deployment on its own domain, and bouncing them off this one would make the
 * two accounts they actually have impossible to use at the same time.
 */
type RouteAccess = 'public' | 'guest' | 'customer'

const GUEST_ROUTES = ['/', '/login', '/verify-otp']
const CUSTOMER_ROUTES = ['/book', '/profile-setup']

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

function getRouteAccess(pathname: string): RouteAccess {
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
    if (routeAccess === 'guest') {
      // '/' is the only guest route with somewhere to send a signed-out
      // visitor: the onboarding carousel. /login and /verify-otp are already
      // where they need to be.
      redirectPath = user ? signedInLanding : pathname === '/' ? '/welcome' : null
    } else if (routeAccess === 'public') {
      redirectPath = null
    } else if (!user) {
      redirectPath = '/login'
    } else if (isProfileIncomplete && pathname !== '/profile-setup') {
      redirectPath = '/profile-setup'
    }
  }

  useEffect(() => {
    if (!redirectPath || redirectPath === pathname) return
    // Bounced into profile setup on the way to a page — a customer who signed
    // up, left setup half done, and later tapped Book Now — so the page they
    // asked for rides along and setup hands them back to it. Read from
    // `window` rather than useSearchParams, which would need a Suspense
    // boundary around the whole app; the booking's services live in the query.
    if (redirectPath === '/profile-setup' && routeAccess === 'customer') {
      const next = `${window.location.pathname}${window.location.search}`
      router.replace(`/profile-setup?next=${encodeURIComponent(next)}`)
      return
    }
    router.replace(redirectPath)
  }, [pathname, redirectPath, routeAccess, router])

  if (
    !isHydrated ||
    !isSessionReady ||
    (redirectPath && redirectPath !== pathname)
  ) {
    return null
  }

  return <>{children}</>
}
