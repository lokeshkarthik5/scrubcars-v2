import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { env } from '../lib/env.js'
import { AppError } from '../lib/errors.js'

interface RateLimitEntry {
  count: number
  resetAt: number
}

/** Who a request counts against: the client's IP unless a limiter says otherwise. */
type RateLimitKey = (c: Context) => string

const byClientIp: RateLimitKey = (c) =>
  c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
  c.req.header('x-real-ip') ??
  'unknown'

function createRateLimiter(
  limit: number,
  windowMs: number,
  keyOf: RateLimitKey = byClientIp
) {
  const store = new Map<string, RateLimitEntry>()

  return createMiddleware(async (c, next) => {
    const key = keyOf(c)

    const now = Date.now()
    const entry = store.get(key)

    if (!entry || now >= entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      // Carried on the error rather than set here: app.onError builds the
      // response, and it writes the Retry-After header from this.
      throw new AppError(429, 'Too many requests', 'RATE_LIMIT_EXCEEDED', {
        retryAfterSeconds: retryAfter,
      })
    }

    entry.count++
    return next()
  })
}

// Sensitive auth actions. 10 per minute in production; see env.authRateLimit
// for why it is configurable.
export const rateLimiter = createRateLimiter(env.authRateLimit, 60 * 1000)

// Global API guard. 100 per minute in production.
export const globalRateLimiter = createRateLimiter(env.globalRateLimit, 60 * 1000)

// Address autocomplete is the only endpoint whose call volume tracks typing
// rather than saves, so it is the only one that can burn the map provider's
// free tier through ordinary use. The client debounces; this is the backstop
// for a client that stops debouncing.
export const geoAutocompleteRateLimiter = createRateLimiter(
  env.geoAutocompleteRateLimit,
  60 * 1000
)

// The customer app's usage events (POST /events). Per IP here; the service
// also caps each visit (modules/analytics). The route is left out of the
// global limiter (app.ts), so this is its only limit and analytics never
// spends the allowance a customer needs for checkout.
export const analyticsRateLimiter = createRateLimiter(env.analyticsRateLimit, 60 * 1000)

// "Write with AI" in the admin editor. Each call is a paid OpenAI request, so
// it is counted per signed-in admin rather than per IP, and per hour: a
// "Fill all empty descriptions" on a big garage is a burst of calls, which a
// per-minute limit would cut short for no saving. Mounted after
// authMiddleware, which is what puts `auth` on the context; the IP is only a
// fallback for a route that forgot to.
export const aiDescribeRateLimiter = createRateLimiter(
  env.aiDescribeRateLimit,
  60 * 60 * 1000,
  (c) => {
    const auth = c.get('auth') as { sub?: string } | undefined
    return auth?.sub ? `admin:${auth.sub}` : byClientIp(c)
  }
)
