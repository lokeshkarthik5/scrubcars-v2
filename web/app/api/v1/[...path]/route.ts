import { type NextRequest, NextResponse } from 'next/server'

const API_BASE =
  process.env.BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:8080'
    : 'https://api.detlio.com')

/**
 * Headers this proxy carries through to the API, and back from it.
 *
 * Both lists are allowlists rather than blanket copies, because `host`,
 * `content-length` and `accept-encoding` all break the upstream call if they are
 * forwarded verbatim. That makes them a trap: a header added anywhere in the
 * client is silently dropped here until someone remembers this file.
 *
 * `x-vendor-id` is the one that matters most — it names the company every
 * vendor-scoped request acts on. Without it the API sees no tenant, and anyone
 * belonging to more than one company gets 400 VENDOR_ID_REQUIRED on every
 * request. Single-company users resolve fine with no header at all, which is
 * what makes an omission here so easy to miss.
 */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'cookie', 'x-vendor-id']

/**
 * `x-detlio-support-session` marks a response served through a Detlio staff
 * platform grant rather than a seat; the vendor portal renders its persistent
 * support banner from it. Set-Cookie is handled separately below, since it is
 * the one header that legitimately repeats.
 */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'x-detlio-support-session',
]

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname  // e.g. /api/v1/auth/me
  const search = req.nextUrl.search  // e.g. ?foo=bar

  const body =
    req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined

  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const upstream = await fetch(`${API_BASE}${path}${search}`, {
    method: req.method,
    headers,
    body,
  })

  const payload = upstream.status === 204 ? null : await upstream.arrayBuffer()
  const res = new NextResponse(payload, { status: upstream.status })

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) res.headers.set(name, value)
  }

  // Explicitly forward every Set-Cookie from the upstream response
  upstream.headers.getSetCookie().forEach((c) => res.headers.append('set-cookie', c))

  return res
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
