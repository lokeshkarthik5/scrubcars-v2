import type {
  ApiSuccessResponse,
  ApiVendorList,
  ApiVendorListItem,
} from '@repo/core/api/types'

/**
 * The garages and figures the homepage quotes, read from the public listing
 * at render time so the page never claims more than the platform has.
 *
 * Server-side, so this cannot go through @repo/core's client as-is: on Preview
 * deployments NEXT_PUBLIC_API_URL is the relative /api/v1 proxy, which means
 * nothing to a fetch from the server. An absolute public URL is used directly;
 * otherwise the base is resolved the way the proxy route resolves it. `||`,
 * not `??`: an empty BACKEND_URL= line in an env file must fall through.
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

/** How long a rendered homepage may serve these figures before refetching. */
const REVALIDATE_SECONDS = 900

/**
 * Next drops a fetch's `signal` when it caches the request, so the timeout is
 * a race rather than an AbortSignal.
 */
const TIMEOUT_MS = 4000

/** Enough for the figures; the strip itself shows at most FEATURED_COUNT. */
const LIST_LIMIT = 50
const FEATURED_COUNT = 6

export interface LiveGarages {
  /** Bookable garages with at least one photo, for the strip. */
  featured: ApiVendorListItem[]
  /** Lowest starting price across every listed garage, in rupees. */
  startingPrice: number | null
  cities: string[]
}

const EMPTY: LiveGarages = { featured: [], startingPrice: null, cities: [] }

/**
 * At build time and in development a failure renders the page without the
 * live sections: the build prerenders '/', and neither the E2E build nor
 * frontend-only development has an API to reach.
 *
 * During a runtime revalidation it throws instead, so Next keeps serving the
 * last good page and retries on the next request — rather than caching a
 * homepage with no garages on it for the next fifteen minutes.
 */
export async function getLiveGarages(): Promise<LiveGarages> {
  try {
    return await fetchLiveGarages()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[homepage] could not load live garages: ${reason}`)
    const tolerant =
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.env.NODE_ENV === 'development'
    if (tolerant) return EMPTY
    throw error
  }
}

async function fetchLiveGarages(): Promise<LiveGarages> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const response = await Promise.race([
    fetch(`${API_V1}/vendors?limit=${LIST_LIMIT}`, {
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
  const items = data.items

  const prices = items
    .map((garage) => garage.startingPrice)
    .filter((price): price is number => price != null && price > 0)

  return {
    // Only garages a visitor could actually book from the card: something on
    // sale, and at least one way to have it done.
    featured: items
      .filter(
        (garage) =>
          garage.photos.length > 0 &&
          garage.startingPrice != null &&
          (garage.dropinEnabled || garage.doorstepEnabled)
      )
      .slice(0, FEATURED_COUNT),
    startingPrice: prices.length ? Math.min(...prices) : null,
    cities: [...new Set(items.map((garage) => garage.city).filter(Boolean))],
  }
}
