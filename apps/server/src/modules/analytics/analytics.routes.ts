import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { MAX_BODY_BYTES } from '../../lib/analytics.js'
import { optionalAuthMiddleware, type AuthVariables } from '../../middleware/auth.middleware.js'
import { analyticsRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as analyticsController from './analytics.controller.js'

// The customer app's usage events (lib/analytics.ts): POST /api/v1/events.
// Open to everyone, signed in or not; the session, when there is one, only
// names the customer. Limited per IP here (and left out of the global
// limiter in app.ts), per visit in the service, and to MAX_BODY_BYTES
// before anything is read.
export const analyticsRoutes = new Hono<{ Variables: Partial<AuthVariables> }>()

analyticsRoutes.post(
  '/',
  analyticsRateLimiter,
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json({ success: false, message: 'Too many events in one request', code: 'EVENTS_TOO_LARGE' }, 413),
  }),
  optionalAuthMiddleware,
  analyticsController.recordEvents
)
