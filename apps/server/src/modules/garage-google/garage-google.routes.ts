import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { placesSearchRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as controller from './garage-google.controller.js'
import {
  garageGoogleLinkSchema,
  garageGoogleSearchSchema,
  garageGoogleUnlinkSchema,
  vendorIdParamSchema,
} from './garage-google.validation.js'

/**
 * Google rating for new garages (21 Nov 2026): the garage side panel's
 * "Link to Google listing". Mounted at the root of /api/v1/admin
 * (admin.routes.ts) beside the other /vendors routes, for the admin
 * cookie's path. Super-admin only; link and unlink are signed with the
 * session's name and audited (garage_google_linked / _unlinked). The search
 * shares the zone finder's per-admin hourly limit (PLACES_SEARCH_RATE_LIMIT).
 */
export const adminGarageGoogleRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminGarageGoogleRoutes.post(
  '/vendors/:id/google/search',
  ...adminMiddleware,
  placesSearchRateLimiter,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', garageGoogleSearchSchema),
  (c) => controller.search(c, c.req.valid('param').id, c.req.valid('json'))
)

adminGarageGoogleRoutes.post(
  '/vendors/:id/google/link',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(garageGoogleLinkSchema),
  (c) => controller.link(c, c.req.valid('param').id, c.req.valid('json'))
)

adminGarageGoogleRoutes.post(
  '/vendors/:id/google/unlink',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(garageGoogleUnlinkSchema),
  (c) => controller.unlink(c, c.req.valid('param').id, c.req.valid('json'))
)
