import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

/**
 * This app's version, read from its own package.json at build time and inlined
 * into the bundle as NEXT_PUBLIC_APP_VERSION.
 *
 * Each app versions independently of the API and of its siblings, so this
 * deliberately reads its own manifest. Falls back rather than throwing: an
 * unknown version is a worse log line, not a failed build.
 */
function appVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  try {
    return JSON.parse(
      readFileSync(join(here, 'package.json'), 'utf8')
    ).version as string
  } catch {
    return 'unknown'
  }
}

const nextConfig: NextConfig = {
  // Source-only workspace packages: Next compiles them with the app rather
  // than expecting a prebuilt dist/, which keeps HMR working across the
  // package boundary and avoids a build step in the dependency graph.
  transpilePackages: ['@repo/ui', '@repo/core'],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion(),
    // Which Vercel environment this build is for, so a crash report says
    // whether it came from Production or a preview. VERCEL_ENV exists only at
    // build time on Vercel; the browser bundle needs it inlined.
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.VERCEL_ENV ?? 'development',
    // Detlio's own usage events (components/analytics.tsx): on in the
    // Production build, off in development, E2E and previews unless
    // NEXT_PUBLIC_ANALYTICS=on is set for that build.
    NEXT_PUBLIC_ANALYTICS:
      process.env.NEXT_PUBLIC_ANALYTICS ??
      (process.env.VERCEL_ENV === 'production' ? 'on' : 'off'),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      // Cloudflare Stream, where service video posters are served. Covered by
      // the pattern above today; named so it stays allowed if that is ever
      // narrowed. Posters are drawn unoptimized (Stream sizes them itself),
      // so this matters only for a caller that does optimise one.
      {
        protocol: 'https',
        hostname: 'customer-*.cloudflarestream.com',
        pathname: '/*/thumbnails/**',
      },
      // Local object storage only. The E2E stack (and anyone running MinIO
      // locally) serves uploads over plain http on localhost, which the https
      // pattern above rejects — next/image then throws and takes the page with
      // it.
      //
      // Excluded from production builds deliberately: the image optimizer
      // fetches whatever it is pointed at, so allowing localhost on a
      // deployed server would let a crafted src probe services reachable only
      // from inside it.
      ...(process.env.NODE_ENV === 'production'
        ? []
        : [{ protocol: 'http' as const, hostname: 'localhost' }]),
    ],
  },
}

export default nextConfig
