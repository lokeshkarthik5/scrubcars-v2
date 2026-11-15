import type { IncomingMessage, ServerResponse } from 'node:http'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { abandonDb, lastStatementTable, useFreshDb } from './db/index.js'
import { env } from './lib/env.js'
import { AppError } from './lib/errors.js'
import { logger } from './lib/logger.js'
import { initMonitoring, reportError } from './lib/monitoring.js'
import { APP_VERSION } from './lib/version.js'
import { globalRateLimiter } from './middleware/rate-limit.middleware.js'
import { SUPPORT_SESSION_HEADER } from './middleware/tenant.middleware.js'
import { analyticsRoutes } from './modules/analytics/analytics.routes.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { usersRoutes } from './modules/users/users.routes.js'
import { bookingIntentsRoutes } from './modules/booking-intents/booking-intents.routes.js'
import { bookingsRoutes } from './modules/bookings/bookings.routes.js'
import { bookingChargesRoutes } from './modules/booking-charges/booking-charges.routes.js'
import { customerTimeProposalRoutes } from './modules/time-proposals/time-proposals.routes.js'
import { garageResponseRoutes } from './modules/garage-response/garage-response.routes.js'
import { customerJobPhotosRoutes } from './modules/job-photos/job-photos.routes.js'
import { customerConditionCheckRoutes } from './modules/condition-check/condition-check.routes.js'
import { reviewsRoutes } from './modules/reviews/reviews.routes.js'
import { paymentsRoutes } from './modules/payments/payments.routes.js'
import { vendorsRoutes } from './modules/vendors/vendors.routes.js'
import { adminRoutes } from './modules/admin/admin.routes.js'
import { opsRoutes } from './modules/ops/ops.routes.js'
import { discountsRoutes } from './modules/discounts/discounts.routes.js'
import { publicGiftRoutes } from './modules/gifts/gifts.routes.js'
import { publicCouponRoutes } from './modules/coupons/coupons.routes.js'
import { publicCertificateRoutes } from './modules/certificates/certificates.routes.js'
import { publicGuaranteeRoutes } from './modules/guarantee/guarantee.routes.js'
import { publicRewardRoutes } from './modules/rewards/rewards.routes.js'
import { geoRoutes } from './modules/geo/geo.routes.js'
import { publicTierRoutes } from './modules/tiers/tiers.routes.js'
import { zonesRoutes } from './modules/reach/reach.routes.js'
import { publicCityRoutes } from './modules/cities/cities.routes.js'
import { publicBookingRequestRoutes } from './modules/booking-requests/booking-requests.routes.js'
import { publicGarageBookRoutes } from './modules/garage-book/garage-book.routes.js'
import { healthRoutes } from './modules/health/health.routes.js'
import { appConfigRoutes } from './modules/app-config/app-config.routes.js'
import { accountRoutes } from './modules/account/account.routes.js'
import { fakeStreamRoutes, webhookRoutes } from './modules/service-media/service-media.routes.js'

console.log(`[BOOT] app.ts loading (v${APP_VERSION})`)

// Crash reporting. Does nothing unless SENTRY_DSN is set.
initMonitoring()

export const app = new Hono()

// Tracks whether the current Vercel function instance is handling its first request.
// A cold start means the DB connection hasn't been warmed up yet.
let coldStart = true

// A fresh database connection for a request after a quiet spell, before
// anything reads (db/index.ts, useFreshDb).
app.use('*', async (_c, next) => {
  const done = useFreshDb()
  try {
    await next()
  } finally {
    done()
  }
})

/**
 * A read still unanswered after this long is given up (Nov 2026: the live
 * garage list and garage page hung until Vercel's 60-second limit, and every
 * request behind them on the same instance waited on its one connection).
 * The connection goes with it, so the next request starts clean; the apps
 * retry a 503 at once (packages/core apiClient). The answer names the table
 * the last statement touched, the one clue to where it stuck.
 */
export const STUCK_READ_MS = 20_000

app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET') return next()
  let timer: ReturnType<typeof setTimeout> | undefined
  const stuck = new Promise<'stuck'>((resolve) => {
    timer = setTimeout(() => resolve('stuck'), STUCK_READ_MS)
  })
  const outcome = await Promise.race([next().then(() => 'done' as const), stuck])
  clearTimeout(timer)
  if (outcome === 'stuck') {
    const table = lastStatementTable()
    logger.error({ method: c.req.method, path: c.req.path, table, ms: STUCK_READ_MS }, 'request:stuck')
    abandonDb()
    c.res = c.json({ success: false, message: 'The server is busy, try again', code: 'REQUEST_STUCK', table }, 503)
  }
})

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
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Stated rather than reflected back from Access-Control-Request-Headers.
    // X-Vendor-Id is a non-simple header, so every vendor-scoped mutation now
    // preflights; naming it here means a misconfigured reflection cannot
    // silently strip the tenant header and turn every multi-company request
    // into a 400 VENDOR_ID_REQUIRED.
    allowHeaders: ['Content-Type', 'X-Vendor-Id'],
    // A custom response header is invisible to the browser unless it is
    // exposed. This one is how the vendor portal knows to render its support
    // session banner.
    exposeHeaders: [SUPPORT_SESSION_HEADER],
    // Cache the preflight for a day so the extra round-trip is paid once per
    // browser session rather than before every mutation.
    maxAge: 86400,
  })
)

// Usage events have their own limit (modules/analytics) and are left out of
// this one, so a customer's analytics can never use up the allowance their
// checkout needs.
const EVENTS_PATH = '/api/v1/events'
app.use('/api/*', (c, next) => (c.req.path === EVENTS_PATH ? next() : globalRateLimiter(c, next)))

/**
 * The driver's or Postgres's own code for an unplanned error ("57014",
 * "ECONNRESET", "CONNECTION_CLOSED"), when it has one: a short token that
 * says what kind of failure it was without anything from the request or the
 * data, so a 500 can be told apart from outside without the server's logs.
 */
export function internalErrorCode(err: unknown): { code: string } | Record<string, never> {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code) ? { code } : {}
}

app.onError((err, c) => {
  if (err instanceof AppError) {
    const ctx = { code: err.code, status: err.statusCode, method: c.req.method, path: c.req.path }
    if (err.statusCode >= 500) {
      logger.error({ err, ...ctx }, 'app error')
    } else {
      logger.warn(ctx, err.message)
    }
    // A refusal that is only about timing says when to come back, both as
    // the standard header and in the body, where the apps can read it.
    if (err.retryAfterSeconds !== undefined) {
      c.header('Retry-After', String(err.retryAfterSeconds))
    }
    return c.json(
      {
        success: false,
        message: err.message,
        code: err.code,
        ...(err.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: err.retryAfterSeconds }
          : {}),
      },
      err.statusCode as ContentfulStatusCode
    )
  }

  if (err instanceof HTTPException) {
    logger.warn({ status: err.status, method: c.req.method, path: c.req.path }, err.message)
    return err.getResponse()
  }

  if (err instanceof Error && err.name === 'TimeoutError') {
    logger.error({ err, method: c.req.method, path: c.req.path }, 'upstream timeout')
    reportError(err, { method: c.req.method, path: c.req.path })
    return c.json({ success: false, message: 'Upstream service timed out', code: 'UPSTREAM_TIMEOUT' }, 504)
  }

  logger.error({ err, method: c.req.method, path: c.req.path }, 'unhandled error')
  // Reported, like the timeout above, because nobody planned for it. An
  // AppError (even a 5xx one, like the SMS provider refusing) is the API
  // answering as designed and an HTTPException is a malformed request:
  // reporting those would bury the real bugs.
  reportError(err, { method: c.req.method, path: c.req.path })
  return c.json({ success: false, message: 'Internal server error', ...internalErrorCode(err) }, 500)
})

app.get('/', (c) => c.text(`Detlio API v${APP_VERSION}`))

app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/users', usersRoutes)
// The signed-in person's own account, from either app (0066).
app.route('/api/v1/account', accountRoutes)
app.route('/api/v1/vendors', vendorsRoutes)
app.route('/api/v1/bookings', bookingsRoutes)
// Paying a final bill: /bookings/:id/charges/:chargeId/{pay,verify}.
app.route('/api/v1/bookings', bookingChargesRoutes)
app.route('/api/v1/bookings', customerTimeProposalRoutes)
app.route('/api/v1/bookings', garageResponseRoutes)
// The customer's own photos of their car (0045): /bookings/:id/photos….
app.route('/api/v1/bookings', customerJobPhotosRoutes)
// The car condition check (0075): /bookings/:id/condition/….
app.route('/api/v1/bookings', customerConditionCheckRoutes)
app.route('/api/v1/booking-intents', bookingIntentsRoutes)
app.route('/api/v1/payments', paymentsRoutes)
app.route('/api/v1/reviews', reviewsRoutes)
app.route('/api/v1/discounts', discountsRoutes)
// Gift a wash (0049): /config, and the gift page's lookup by code.
app.route('/api/v1/gifts', publicGiftRoutes)
// Printed coupons (0056): the /c/<code> page's lookup by code.
app.route('/api/v1/coupons', publicCouponRoutes)
// Service History certificate (0053): the public /verify page's lookup and
// the shared photos it shows. No sign-in.
app.route('/api/v1/certificates', publicCertificateRoutes)
// Detlio Guarantee (0051): /config, for the checkout badge and Help.
app.route('/api/v1/guarantee', publicGuaranteeRoutes)
// Detlio Rewards (0050): /config, and the invite page's lookup by code.
app.route('/api/v1/rewards', publicRewardRoutes)
app.route('/api/v1/geo', geoRoutes)
// Chennai's zones (0062): the landing page's "Where's your car?" chips.
app.route('/api/v1/zones', zonesRoutes)
// The cities customers may pick (0070): the city chip and the area sheet.
app.route('/api/v1/cities', publicCityRoutes)
// Which tiers customers see (0063), for the "Silver & above" filter.
app.route('/api/v1/tiers', publicTierRoutes)
// Customer reach, part 2 (0062): the windows a garage can be asked for.
app.route('/api/v1/booking-requests', publicBookingRequestRoutes)
// Garage Book's public pages (0074): a bill (/b/<token>) and a garage's own
// booking page (/g/<slug>). A 404 while GARAGE_BOOK is off.
app.route('/api/v1/public', publicGarageBookRoutes)
app.route('/api/v1/admin', adminRoutes)
app.route('/api/v1/ops', opsRoutes)
app.route('/api/v1/health', healthRoutes)
// Forced update for the native apps: the minimum version, from the environment.
app.route('/api/v1/app-config', appConfigRoutes)
// The customer app's usage events (first-party, no third party).
app.route(EVENTS_PATH, analyticsRoutes)
// Cloudflare Stream says here when a service video is ready or has failed.
app.route('/api/v1/webhooks', webhookRoutes)
// STREAM_FAKE only (E2E): a 404 everywhere else.
app.route('/api/v1/fake-stream', fakeStreamRoutes)

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
