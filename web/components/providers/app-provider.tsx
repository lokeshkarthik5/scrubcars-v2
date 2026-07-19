'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { setUnauthorizedHandler } from '@/lib/api/client'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { useUserStore } from '@/lib/stores/user-store'
import { useVendorOnboardingStore } from '@/lib/stores/vendor-onboarding-store'

type RouteAccess = 'public' | 'guest' | 'customer' | 'vendor' | 'vendor-onboarding'

const GUEST_ROUTES = ['/', '/login', '/verify-otp', '/vendor/login', '/vendor/verify-otp']
const CUSTOMER_ROUTES = [
  '/book',
  '/profile-setup',
]
const VENDOR_ROUTES = [
  '/vendor/home',
  '/vendor/bookings',
  '/vendor/earnings',
  '/vendor/reviews',
  '/vendor/services',
  '/vendor/settings',
]
const VENDOR_ONBOARDING_ROUTE = '/vendor/onboarding'

// Clean paths served by the vendor subdomain (middleware strips the /vendor prefix)
const VENDOR_SUBDOMAIN_GUEST_ROUTES = ['/', '/login', '/verify-otp']
const VENDOR_SUBDOMAIN_VENDOR_ROUTES = ['/home', '/bookings', '/earnings', '/reviews', '/services', '/settings']
const VENDOR_SUBDOMAIN_ONBOARDING_ROUTE = '/onboarding'

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

function getRouteAccess(pathname: string, isVendorSubdomain: boolean): RouteAccess {
  if (isVendorSubdomain) {
    if (matchesRoute(pathname, VENDOR_SUBDOMAIN_GUEST_ROUTES)) return 'guest'
    if (pathname.startsWith(VENDOR_SUBDOMAIN_ONBOARDING_ROUTE)) return 'vendor-onboarding'
    if (matchesRoute(pathname, VENDOR_SUBDOMAIN_VENDOR_ROUTES)) return 'vendor'
    return 'public'
  }
  if (matchesRoute(pathname, GUEST_ROUTES)) return 'guest'
  if (pathname.startsWith(VENDOR_ONBOARDING_ROUTE)) return 'vendor-onboarding'
  if (matchesRoute(pathname, VENDOR_ROUTES)) return 'vendor'
  if (matchesRoute(pathname, CUSTOMER_ROUTES)) return 'customer'
  return 'public'
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const isSessionReady = useAuthStore((s) => s.isSessionReady)
  const user = useAuthStore((s) => s.user)
  const vendor = useAuthStore((s) => s.vendor)
  const audience = useAuthStore((s) => s.audience)
  const restoreSession = useAuthStore((s) => s.restoreSession)
  const isOnboardingComplete = useVendorOnboardingStore((s) => s.isComplete)

  // On vendor.detlio.com the middleware rewrites clean paths to /vendor/* internally,
  // so redirect targets should use the clean form (e.g. '/home' not '/vendor/home').
  const isVendorSubdomain =
    typeof window !== 'undefined' && window.location.hostname.startsWith('vendor.')
  const vp = (vendorPath: string) =>
    isVendorSubdomain ? vendorPath.replace('/vendor', '') || '/' : vendorPath

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      const { audience, logout, clearSession } = useAuthStore.getState()
      const loginPath = audience === 'vendor' ? '/vendor/login' : '/login'

      try {
        await logout()
      } catch {
        clearSession()
        useAuthStore.setState({ isSessionReady: true })
      }

      useUserStore.getState().reset()
      useBookingsStore.getState().reset()

      if (typeof window !== 'undefined' && window.location.pathname !== loginPath) {
        window.location.href = loginPath
      }
    })

    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    console.log('[app-provider] restoreSession firing, isHydrated:', isHydrated)
    void restoreSession()
  }, [isHydrated, restoreSession])

  const routeAccess = getRouteAccess(pathname, isVendorSubdomain)
  const isVendorSession = audience === 'vendor'
  const isProfileIncomplete = !isVendorSession && user?.name === 'User'
  const signedInLanding = isVendorSession
    ? vendor
      ? vp('/vendor/home')
      : vp('/vendor/onboarding/step-1')
    : isProfileIncomplete
      ? '/profile-setup'
      : '/home'

  let redirectPath: string | null = null

  if (isHydrated && isSessionReady) {
    if (routeAccess === 'guest') {
      redirectPath = user ? signedInLanding : null
    } else if (routeAccess === 'public') {
      redirectPath = null
    } else if (!user) {
      redirectPath = routeAccess === 'customer' ? '/login' : vp('/vendor/login')
    } else if (routeAccess === 'customer' && isVendorSession) {
      redirectPath = signedInLanding
    } else if (
      (routeAccess === 'vendor' || routeAccess === 'vendor-onboarding') &&
      !isVendorSession
    ) {
      redirectPath = vp('/vendor/login')
    } else if (routeAccess === 'vendor-onboarding' && vendor && isOnboardingComplete) {
      redirectPath = vp('/vendor/home')
    } else if (routeAccess === 'vendor' && !vendor) {
      redirectPath = vp('/vendor/onboarding/step-1')
    } else if (routeAccess === 'customer' && isProfileIncomplete && pathname !== '/profile-setup') {
      redirectPath = '/profile-setup'
    }
  }

  useEffect(() => {
    if (redirectPath && redirectPath !== pathname) router.replace(redirectPath)
  }, [pathname, redirectPath, router])

  if (!isHydrated || !isSessionReady || (redirectPath && redirectPath !== pathname)) {
    return null
  }

  return <>{children}</>
}
