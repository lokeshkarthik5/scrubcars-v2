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
    ],
  },
}

export default nextConfig
