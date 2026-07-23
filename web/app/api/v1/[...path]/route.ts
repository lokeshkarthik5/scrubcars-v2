import { type NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.BACKEND_URL ?? 'https://api.detlio.com'

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname  // e.g. /api/v1/auth/me
  const search = req.nextUrl.search  // e.g. ?foo=bar

  const body =
    req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined

  const upstream = await fetch(`${API_BASE}${path}${search}`, {
    method: req.method,
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    body,
  })

  const payload = upstream.status === 204 ? null : await upstream.arrayBuffer()
  const res = new NextResponse(payload, { status: upstream.status })

  const ct = upstream.headers.get('content-type')
  if (ct) res.headers.set('content-type', ct)

  // Explicitly forward every Set-Cookie from the upstream response
  upstream.headers.getSetCookie().forEach((c) => res.headers.append('set-cookie', c))

  return res
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
