import { createMiddleware } from 'hono/factory'
import { AppError } from '../lib/errors.js'

interface RateLimitEntry {
  count: number
  resetAt: number
}

function createRateLimiter(limit: number, windowMs: number) {
  const store = new Map<string, RateLimitEntry>()

  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
      c.req.header('x-real-ip') ??
      'unknown'

    const now = Date.now()
    const entry = store.get(ip)

    if (!entry || now >= entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      throw new AppError(429, 'Too many requests', 'RATE_LIMIT_EXCEEDED')
    }

    entry.count++
    return next()
  })
}

// 5 requests per minute — for sensitive auth actions
export const rateLimiter = createRateLimiter(10, 60 * 1000)

// 100 requests per minute — global API guard
export const globalRateLimiter = createRateLimiter(100, 60 * 1000)
