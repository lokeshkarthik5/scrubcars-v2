import { env } from '../env.js'
import { AppError } from '../errors.js'
import { createOlaProvider } from './ola.js'
import type { GeoProvider, GeoProviderName } from './types.js'

export * from './types.js'

/**
 * Provider selection. The one `switch` the rest of the app depends on —
 * adding Google, MapmyIndia or Geoapify later is one new file in this
 * directory plus one `case` here. Nothing outside `lib/geo` names a provider.
 */
function build(name: GeoProviderName): GeoProvider | null {
  switch (name) {
    case 'ola':
      return env.olaMapsApiKey ? createOlaProvider(env.olaMapsApiKey) : null
    // 'google' | 'mappls' | 'geoapify' | 'locationiq' — add adapters here.
    default:
      throw new Error(`Unsupported GEO_PROVIDER: ${name}`)
  }
}

// Resolved once at module load rather than per request. A missing key is not a
// boot failure: the rest of the API must still run locally without one, so the
// error surfaces at call time with something a developer can act on.
const provider = build(env.geoProvider)

export function getGeoProvider(): GeoProvider {
  if (!provider) {
    throw new AppError(
      503,
      'Address search is not configured',
      'GEO_PROVIDER_UNCONFIGURED'
    )
  }
  return provider
}

/** Whether address search/geocoding is available at all. */
export function isGeoConfigured(): boolean {
  return provider !== null
}

export const geoProviderName = env.geoProvider
