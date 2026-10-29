import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { reachWriteRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as controller from './area-signups.controller.js'
import { recommendSchema, signUpSchema, zoneSlugParamSchema } from './area-signups.validation.js'

/**
 * "Not in your area yet" (customer reach, part 2, 0062; lib/area-signups.ts):
 * the free-wash sign-up, Home's live status and recommending a garage.
 * Mounted at /users/me/area (users.routes.ts), after that file's
 * authMiddleware + requireCustomer: the session's own only. Writes are
 * rate limited per customer per hour.
 */
export const customerAreaRoutes = new Hono<{ Variables: AuthVariables }>()

customerAreaRoutes.get('/status', controller.status)
customerAreaRoutes.post('/signups', reachWriteRateLimiter, zValidator('json', signUpSchema), (c) =>
  controller.signUp(c, c.req.valid('json'))
)
// Leave an area's list, and its messages (0066).
customerAreaRoutes.delete('/signups/:zoneSlug', zValidator('param', zoneSlugParamSchema), (c) =>
  controller.leave(c, c.req.valid('param').zoneSlug)
)
customerAreaRoutes.post('/signups/:zoneSlug/banner-seen', zValidator('param', zoneSlugParamSchema), (c) =>
  controller.bannerSeen(c, c.req.valid('param').zoneSlug)
)
customerAreaRoutes.post('/recommendations', reachWriteRateLimiter, zValidator('json', recommendSchema), (c) =>
  controller.recommend(c, c.req.valid('json'))
)
