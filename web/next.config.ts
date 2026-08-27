import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

/**
 * This app's version, read from web/package.json at build time and inlined into
 * the bundle as NEXT_PUBLIC_APP_VERSION.
 *
 * The web app and the API version independently, so this deliberately reads its
 * own manifest and never reaches outside the app root — which also means a
 * deploy rooted at web/ has everything it needs. Falls back rather than
 * throwing: an unknown version is a worse log line, not a failed build.
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
