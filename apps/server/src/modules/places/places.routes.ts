import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { placesSearchRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as controller from './places.controller.js'
import { placesSearchSchema } from './places.validation.js'

/**
 * The zone finder (0064): POST /api/v1/admin/places/search. Super-admin
 * only, rate limited per signed-in admin per hour (PLACES_SEARCH_RATE_LIMIT,
 * default 30), after the auth that names the admin.
 */
export const adminPlacesRoutes = new Hono<{ Variables: AuthVariables }>()

adminPlacesRoutes.post(
  '/search',
  authMiddleware,
  requireSuperAdmin,
  placesSearchRateLimiter,
  zValidator('json', placesSearchSchema),
  (c) => controller.search(c, c.req.valid('json'))
)
