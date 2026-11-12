import { cache } from 'react'
import type { ApiSuccessResponse } from '@repo/core/api/types'
import type { PublicBill, PublicLinkPage } from '@repo/core/api/garage-book'

/**
 * Garage Book's two public pages' reads (API 0073): a garage's own booking
 * page (/g/<slug>) and a bill (/b/<token>), made from this app's server so
 * the pages arrive complete. Server-side, so not through @repo/core's
 * client: on Preview deployments NEXT_PUBLIC_API_URL is the relative
 * /api/v1 proxy, which means nothing to a fetch from the server. Resolved
 * as lib/certificates.ts resolves it.
 *
 * The API answers 404 while its GARAGE_BOOK switch is off, for an unknown
 * or switched-off link and for an unknown bill: the pages are then a 404
 * too.
 */
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL
const API_V1 =
  PUBLIC_API && /^https?:\/\//.test(PUBLIC_API)
    ? PUBLIC_API
    : `${
        process.env.BACKEND_URL ||
        (process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : 'https://api.detlio.com')
      }/api/v1`

const TIMEOUT_MS = 6000

export type PublicRead<T> = { kind: 'found'; data: T } | { kind: 'not_found' } | { kind: 'rate_limited' } | { kind: 'unavailable' }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TOKEN = /^[A-Za-z0-9_-]{22,64}$/

async function read<T>(path: string, what: string): Promise<PublicRead<T>> {
  try {
    const response = await fetch(`${API_V1}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (response.status === 404) return { kind: 'not_found' }
    if (response.status === 429) return { kind: 'rate_limited' }
    if (!response.ok) return { kind: 'unavailable' }
    const { data } = (await response.json()) as ApiSuccessResponse<T>
    return { kind: 'found', data }
  } catch {
    // Never the slug or token in a log line.
    console.error(`[garage-book] ${what} read failed`)
    return { kind: 'unavailable' }
  }
}

/** A garage's booking page; once per request (the page and its title share it). */
export const readLinkPage = cache(async (slug: string): Promise<PublicRead<PublicLinkPage>> => {
  if (!SLUG.test(slug) || slug.length > 80) return { kind: 'not_found' }
  return read<PublicLinkPage>(`/public/g/${encodeURIComponent(slug)}`, 'booking page')
})

/** A bill, by its token. */
export const readBill = cache(async (token: string): Promise<PublicRead<PublicBill>> => {
  if (!TOKEN.test(token)) return { kind: 'not_found' }
  return read<PublicBill>(`/public/bills/${encodeURIComponent(token)}`, 'bill')
})

/**
 * The UPI payment link a bill's QR carries: the garage's own UPI id (read
 * from its QR picture), the amount and the bill number, so the customer's
 * app opens with everything filled in. Null without a UPI id.
 */
export function upiLink(pay: { upiId: string | null; upiName: string | null }, totalPaise: number, numberText: string): string | null {
  if (!pay.upiId) return null
  const params = new URLSearchParams({ pa: pay.upiId, ...(pay.upiName ? { pn: pay.upiName } : {}), am: (totalPaise / 100).toFixed(2), cu: 'INR', tn: `Bill ${numberText}` })
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`
}
