import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const VENDOR_HOST = process.env.NEXT_PUBLIC_VENDOR_HOST ?? 'vendor.detlio.com'
const ADMIN_HOST = process.env.NEXT_PUBLIC_ADMIN_HOST ?? 'admin.detlio.com'

function isVendorHost(host: string): boolean {
  return host === VENDOR_HOST || host.startsWith('vendor.')
}

function isAdminHost(host: string): boolean {
  return host === ADMIN_HOST || host.startsWith('admin.')
}

// Clean public path on admin.detlio.com → internal Next.js file path
const ADMIN_CLEAN_TO_INTERNAL: Record<string, string> = {
  '/':            '/admin/login',
  '/login':       '/admin/login',
  '/vendors':     '/admin/vendors',
  '/vendors/new': '/admin/vendors/new',
  '/bookings':    '/admin/bookings',
}

// Clean public path on vendors.detlio.com → internal Next.js file path
const CLEAN_TO_INTERNAL: Record<string, string> = {
  '/':                  '/vendor/login',
  '/login':             '/vendor/login',
  '/verify-otp':        '/vendor/verify-otp',
  '/home':              '/vendor/home',
  '/bookings':          '/vendor/bookings',
  '/earnings':          '/vendor/earnings',
  '/reviews':           '/vendor/reviews',
  '/services':          '/vendor/services',
  '/settings':          '/vendor/settings',
  '/photos':            '/vendor/photos',
  '/onboarding/step-1': '/vendor/onboarding/step-1',
  '/onboarding/step-2': '/vendor/onboarding/step-2',
  '/onboarding/step-3': '/vendor/onboarding/step-3',
  '/onboarding/step-4': '/vendor/onboarding/step-4',
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const { pathname } = request.nextUrl

  // Admin subdomain: mirror the vendor-host rewrite/redirect scheme.
  if (isAdminHost(host)) {
    if (pathname.startsWith('/_next/') || pathname.startsWith('/api/')) {
      return NextResponse.next()
    }

    // Keep the URL bar on the clean path (admin.detlio.com/vendors, not /admin/vendors).
    if (pathname.startsWith('/admin/')) {
      const clean = pathname.slice('/admin'.length) || '/'
      const url = request.nextUrl.clone()
      url.pathname = clean
      return NextResponse.redirect(url, 307)
    }

    const internal = ADMIN_CLEAN_TO_INTERNAL[pathname]
    if (internal) {
      const url = request.nextUrl.clone()
      url.pathname = internal
      return NextResponse.rewrite(url)
    }

    // Dynamic admin routes (e.g. /vendors/:id/edit) aren't in the static map.
    // Rewrite the clean path onto the internal /admin/* tree.
    if (/^\/vendors\/[^/]+\/edit\/?$/.test(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = `/admin${pathname}`
      return NextResponse.rewrite(url)
    }

    return NextResponse.next()
  }

  if (!isVendorHost(host)) {
    return NextResponse.next()
  }

  // Let Next.js internals pass through untouched
  if (pathname.startsWith('/_next/') || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // If something inside the app navigates to the internal /vendor/* form
  // (e.g. router.push('/vendor/home')), redirect to the clean public path
  // so the URL bar always shows vendors.detlio.com/home, not /vendor/home.
  if (pathname.startsWith('/vendor/')) {
    const clean = pathname.slice('/vendor'.length) || '/'
    const url = request.nextUrl.clone()
    url.pathname = clean
    return NextResponse.redirect(url, 307)
  }

  // Rewrite the clean public path to the internal Next.js route
  const internal = CLEAN_TO_INTERNAL[pathname]
  if (internal) {
    const url = request.nextUrl.clone()
    url.pathname = internal
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
