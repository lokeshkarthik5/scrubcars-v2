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
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
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
