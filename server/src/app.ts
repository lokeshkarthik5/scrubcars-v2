import type { IncomingMessage, ServerResponse } from 'node:http'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { env } from './lib/env.js'
import { AppError } from './lib/errors.js'
import { logger } from './lib/logger.js'
import { globalRateLimiter } from './middleware/rate-limit.middleware.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { usersRoutes } from './modules/users/users.routes.js'
import { bookingsRoutes } from './modules/bookings/bookings.routes.js'
import { reviewsRoutes } from './modules/reviews/reviews.routes.js'
import { paymentsRoutes } from './modules/payments/payments.routes.js'
import { vendorsRoutes } from './modules/vendors/vendors.routes.js'
import { adminRoutes } from './modules/admin/admin.routes.js'
import { discountsRoutes } from './modules/discounts/discounts.routes.js'

console.log('[BOOT] app.ts loading')

export const app = new Hono()

// Tracks whether the current Vercel function instance is handling its first request.
// A cold start means the DB connection hasn't been warmed up yet.
let coldStart = true

app.use('/api/*', async (c, next) => {
  const isCold = coldStart
  coldStart = false
  const t = performance.now()
  logger.info({ method: c.req.method, path: c.req.path }, 'request:start')
  await next()
  const ms = (performance.now() - t).toFixed(1)
  const cold = isCold ? ' [cold-start]' : ''
  logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms: Number(ms), cold: isCold }, 'request:end')
  console.log(`[REQ]${cold} ${c.req.method} ${c.req.path} → ${c.res.status} (${ms}ms)`)
})

app.use(
  '/api/*',
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
)

app.use('/api/*', globalRateLimiter)

app.onError((err, c) => {
  if (err instanceof AppError) {
    const ctx = { code: err.code, status: err.statusCode, method: c.req.method, path: c.req.path }
    if (err.statusCode >= 500) {
      logger.error({ err, ...ctx }, 'app error')
    } else {
      logger.warn(ctx, err.message)
    }
    return c.json(
      { success: false, message: err.message, code: err.code },
      err.statusCode as ContentfulStatusCode
    )
  }

  if (err instanceof HTTPException) {
    logger.warn({ status: err.status, method: c.req.method, path: c.req.path }, err.message)
    return err.getResponse()
  }

  if (err instanceof Error && err.name === 'TimeoutError') {
    logger.error({ err, method: c.req.method, path: c.req.path }, 'upstream timeout')
    return c.json({ success: false, message: 'Upstream service timed out', code: 'UPSTREAM_TIMEOUT' }, 504)
  }

  logger.error({ err, method: c.req.method, path: c.req.path }, 'unhandled error')
  return c.json({ success: false, message: 'Internal server error' }, 500)
})

app.get('/', (c) => c.text('Detlio API'))

app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/users', usersRoutes)
app.route('/api/v1/vendors', vendorsRoutes)
app.route('/api/v1/bookings', bookingsRoutes)
app.route('/api/v1/payments', paymentsRoutes)
app.route('/api/v1/reviews', reviewsRoutes)
app.route('/api/v1/discounts', discountsRoutes)
app.route('/api/v1/admin', adminRoutes)

console.log('[BOOT] app.ts ready')

// Vercel Node.js runtime calls handlers as (req: IncomingMessage, res: ServerResponse).
// hono/vercel's handle() expects a Web-standard Request and returns a Response, which the
// Node.js runtime ignores — it waits for res.end() that never arrives → 300 s timeout.
// This adapter converts Node.js ↔ Web Fetch API so res.end() is always called.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https'
  const host = (req.headers['host'] as string | undefined) ?? 'localhost'
  const url = `${proto}://${host}${req.url ?? '/'}`

  const headers = new Headers()
  for (const [key, raw] of Object.entries(req.headers)) {
    if (!raw) continue
    if (Array.isArray(raw)) raw.forEach((v) => headers.append(key, v))
    else headers.set(key, raw)
  }

  const method = (req.method ?? 'GET').toUpperCase()
  const webReq = new Request(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? null : (req as unknown as BodyInit),
    // @ts-ignore – required for Node.js readable stream as body
    duplex: 'half',
  })

  console.log(`[REQ] ${method} ${req.url}`)

  const response = await app.fetch(webReq)

  console.log(`[RES] ${response.status} ${method} ${req.url}`)

  const respHeaders: Record<string, string | string[]> = {}
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') {
      respHeaders[key] = value
    }
  })
  // getSetCookie() returns each Set-Cookie header as a separate string,
  // avoiding the overwrite bug when two cookies (refresh + access) are set
  // on the same response (e.g. after OTP verify or token refresh).
  const setCookies = response.headers.getSetCookie()
  if (setCookies.length > 0) {
    respHeaders['set-cookie'] = setCookies
  }
  res.writeHead(response.status, respHeaders)
  res.end(Buffer.from(await response.arrayBuffer()))
}
