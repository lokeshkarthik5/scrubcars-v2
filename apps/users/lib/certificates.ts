import type { ApiSuccessResponse } from '@repo/core/api/types'
import type { PublicCertificate } from '@repo/core/api/certificates'
import { isCertificateTokenShaped } from '@repo/core/service-history-certificate'

/**
 * The public /verify/<token> page's one call (API 0053,
 * POST /certificates/verify), made from this app's server so the page
 * renders complete and fast, with nothing to run in the browser.
 *
 * Server-side, so it cannot go through @repo/core's client: on Preview
 * deployments NEXT_PUBLIC_API_URL is the relative /api/v1 proxy, which means
 * nothing to a fetch from the server. Resolved as components/marketing/
 * live-garages.ts resolves it.
 */
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL
const API_V1 =
  PUBLIC_API && /^https?:\/\//.test(PUBLIC_API)
    ? PUBLIC_API
    : `${
        process.env.BACKEND_URL ||
        (process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : 'https://api.detlio.com')
      }/api/v1`

/**
 * Where the visitor's browser loads a shared photo from: the API's signed
 * path under the public API address (or, on a Preview, this app's proxy).
 */
const BROWSER_API = PUBLIC_API || 'http://localhost:8080/api/v1'

export function sharedPhotoSrc(path: string): string {
  return `${BROWSER_API.replace(/\/$/, '')}${path}`
}

const TIMEOUT_MS = 6000

/**
 * Lookups per visitor (by the address Vercel gives this request) per
 * minute, on this server instance. The API limits per caller too, but from
 * here every visitor arrives from this app's server address, so this is
 * where one visitor is told apart from another.
 */
const VISITOR_LIMIT = 20
const WINDOW_MS = 60_000
const visitors = new Map<string, { count: number; resetAt: number }>()

export function allowVisitor(key: string, now = Date.now()): boolean {
  if (visitors.size > 5000) {
    for (const [k, v] of visitors) if (now >= v.resetAt) visitors.delete(k)
  }
  const entry = visitors.get(key)
  if (!entry || now >= entry.resetAt) {
    visitors.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= VISITOR_LIMIT) return false
  entry.count += 1
  return true
}

export type CertificateLookup =
  | { kind: 'found'; certificate: PublicCertificate }
  /** Unknown, malformed, revoked, run out, or its car or account gone: one answer. */
  | { kind: 'not_shared' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }

export async function lookupCertificate(token: string, visitor: string): Promise<CertificateLookup> {
  if (!isCertificateTokenShaped(token)) return { kind: 'not_shared' }
  if (!allowVisitor(visitor)) return { kind: 'rate_limited' }
  try {
    const response = await fetch(`${API_V1}/certificates/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // In the body, never the API's URL: request logs record paths.
      body: JSON.stringify({ token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 404) return { kind: 'not_shared' }
    if (response.status === 429) return { kind: 'rate_limited' }
    if (!response.ok) return { kind: 'unavailable' }
    const { data } = (await response.json()) as ApiSuccessResponse<PublicCertificate>
    return { kind: 'found', certificate: data }
  } catch {
    // Never the token in a log line.
    console.error('[verify] certificate lookup failed')
    return { kind: 'unavailable' }
  }
}
