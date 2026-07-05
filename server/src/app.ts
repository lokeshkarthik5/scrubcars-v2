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

console.log('[BOOT] app.ts loading')

export const app = new Hono()

// Tracks whether the current Vercel function instance is handling its first request.
// A cold start means the DB connection hasn't been warmed up yet.
let coldStart = true

app.use('/api/*', async (c, next) => {
  const isCold = coldStart
  coldStart = false
  const t = performance.now()
  await next()
  const ms = (performance.now() - t).toFixed(1)
  const cold = isCold ? ' [cold-start]' : ''
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
    return c.json(
      { success: false, message: err.message, code: err.code },
      err.statusCode as ContentfulStatusCode
    )
  }

  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  if (err instanceof Error && err.name === 'TimeoutError') {
    logger.error(`Upstream timeout on ${c.req.method} ${c.req.path}`, err)
    return c.json({ success: false, message: 'Upstream service timed out', code: 'UPSTREAM_TIMEOUT' }, 504)
  }

  logger.error(`Unhandled error on ${c.req.method} ${c.req.path}`, err)
  return c.json({ success: false, message: 'Internal server error' }, 500)
})

app.get('/', (c) => c.text('Scrub Cars API'))

app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/users', usersRoutes)
app.route('/api/v1/vendors', vendorsRoutes)
app.route('/api/v1/bookings', bookingsRoutes)
app.route('/api/v1/payments', paymentsRoutes)
app.route('/api/v1/reviews', reviewsRoutes)

console.log('[BOOT] app.ts ready')
