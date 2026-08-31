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
 * Route gate for the vendor portal.
 *
 * This host serves vendors only, so anyone signed in here is treated as one
 * regardless of what `audience` the session resolved to — after a reload the
 * store derives audience from the company list, and a vendor with no company
 * yet would otherwise fall through to a customer landing that does not exist
 * on this deployment.
 */
type RouteAccess = 'public' | 'guest' | 'vendor' | 'vendor-onboarding'

const GUEST_ROUTES = ['/', '/login', '/verify-otp']
const VENDOR_ROUTES = [
  '/home',
  '/bookings',
  '/earnings',
  '/reviews',
  '/services',
  '/settings',
  '/photos',
]
const ONBOARDING_ROUTE = '/onboarding'

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

function getRouteAccess(pathname: string): RouteAccess {
  if (matchesRoute(pathname, GUEST_ROUTES)) return 'guest'
  if (pathname.startsWith(ONBOARDING_ROUTE)) return 'vendor-onboarding'
  if (matchesRoute(pathname, VENDOR_ROUTES)) return 'vendor'
  return 'public'
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isHydrated, isSessionReady, user, vendor, restoreSession } =
    useAuthStore(
      useShallow((s) => ({
        isHydrated: s.isHydrated,
        isSessionReady: s.isSessionReady,
        user: s.user,
        vendor: s.vendor,
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
  const signedInLanding = vendor ? '/home' : '/onboarding/step-1'

  let redirectPath: string | null = null

  if (isHydrated && isSessionReady) {
    if (routeAccess === 'guest') {
      redirectPath = user ? signedInLanding : pathname === '/' ? '/login' : null
    } else if (routeAccess === 'public') {
      redirectPath = null
    } else if (!user) {
      redirectPath = '/login'
    } else if (routeAccess === 'vendor-onboarding' && vendor) {
      // Onboarding means "your first garage". Anyone who already has one is
      // sent home — deliberately not conditioned on `isOnboardingComplete`,
      // which is persisted per browser, so the same account used to reach this
      // flow or not depending on local storage that has nothing to do with the
      // question. Additional garages are created from the admin panel.
      redirectPath = '/home'
    } else if (routeAccess === 'vendor' && !vendor) {
      redirectPath = '/onboarding/step-1'
    }
  }

  useEffect(() => {
    if (redirectPath && redirectPath !== pathname) router.replace(redirectPath)
  }, [pathname, redirectPath, router])

  if (
    !isHydrated ||
    !isSessionReady ||
    (redirectPath && redirectPath !== pathname)
  ) {
    return null
  }

  return <>{children}</>
}
