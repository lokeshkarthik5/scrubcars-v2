import type { ApiSuccessResponse, ApiVendorList } from '@repo/core/api/types'
import { mapVendorListItem } from '@repo/core/api/mappers'
import type { VendorListResult } from '@repo/core/api/vendors'

/**
 * The landing page's first page of garages (customer reach, 0062), read on
 * the server so the garages and their prices are in the HTML: At garage,
 * every category, no location, the default order (LANDING_LIST_PARAMS in
 * components/garages/garage-list.tsx, the exact question the list asks
 * first). The list takes over in the browser from there.
 *
 * Server-side, so not through @repo/core's client: on Preview deployments
 * NEXT_PUBLIC_API_URL is the relative /api/v1 proxy, which means nothing to
 * a fetch from the server. The same base as the /about page's live figures
 * (components/marketing/live-garages.ts).
 */
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL
const API_V1 =
  PUBLIC_API && /^https?:\/\//.test(PUBLIC_API)
    ? PUBLIC_API
    : `${
        process.env.BACKEND_URL ||
        (process.env.NODE_ENV === 'development'
          ? 'http://localhost:8080'
          : 'https://api.detlio.com')
      }/api/v1`

/** How long a rendered landing page may serve this page of garages. */
const REVALIDATE_SECONDS = 300

/** Next drops a fetch's `signal` when it caches it, so the timeout is a race. */
const TIMEOUT_MS = 4000

/**
 * The page, or null when it could not be read at build time or in
 * development (no API to reach): the list then loads in the browser, as
 * every other list does. During a runtime revalidation a failure throws, so
 * Next keeps serving the last good page rather than caching an empty one.
 */
export async function getLandingList(): Promise<VendorListResult | null> {
  try {
    return await fetchLandingList()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[landing] could not load garages: ${reason}`)
    const tolerant =
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.env.NODE_ENV === 'development'
    if (tolerant) return null
    throw error
  }
}

async function fetchLandingList(): Promise<VendorListResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const response = await Promise.race([
    fetch(`${API_V1}/vendors?bookingType=dropin&sort=relevance`, {
      next: { revalidate: REVALIDATE_SECONDS },
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${TIMEOUT_MS}ms`)),
        TIMEOUT_MS
      )
    }),
  ]).finally(() => clearTimeout(timer))
  if (!response.ok) throw new Error(`GET /vendors responded ${response.status}`)

  const { data } = (await response.json()) as ApiSuccessResponse<ApiVendorList>
  return {
    vendors: data.items.map(mapVendorListItem),
    nextCursor: data.nextCursor,
    radiusKm: data.radiusKm ?? null,
    reach: data.reach ?? null,
    // At garage never has a "just outside" group.
    outside: null,
  }
}
