import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import {
  dismissRecommendationSchema,
  fromRecommendationSchema,
} from '../leads/leads.validation.js'
import * as controller from './coverage.controller.js'
import { createZoneSchema, updateZoneSchema } from './coverage.validation.js'

/**
 * Coverage (0064): Chennai's zones with the team's garages and leads.
 * Mounted at /api/v1/admin/coverage. Super-admin only.
 *
 *   GET    /             zones, garages (with their zone), leads, finder sources
 *   POST   /zones        add a zone
 *   PATCH  /zones/:id    rename, priority, target, move the centre
 *   DELETE /zones/:id    remove a zone nothing points at (leads, sign-ups,
 *                        requests, recommendations)
 *   POST   /recommendations/:id/duplicates  what a lead made of it looks like
 *   POST   /recommendations/:id/lead        Make lead (or link to a lead)
 *   POST   /recommendations/:id/dismiss     Dismiss
 *
 * Zone changes reach customers through GET /zones (customer reach), whose
 * cache is cleared here; other instances' within a minute.
 */
export const adminCoverageRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const
const idParam = zValidator('param', z.object({ id: z.string().uuid() }))

adminCoverageRoutes.get('/', ...adminMiddleware, controller.overview)

adminCoverageRoutes.post(
  '/zones',
  ...adminMiddleware,
  adminSignedJson(createZoneSchema),
  (c) => controller.createZone(c, c.req.valid('json'))
)

adminCoverageRoutes.patch(
  '/zones/:id',
  ...adminMiddleware,
  idParam,
  adminSignedJson(updateZoneSchema),
  (c) => controller.updateZone(c, c.req.valid('param').id, c.req.valid('json'))
)

adminCoverageRoutes.delete('/zones/:id', ...adminMiddleware, idParam, (c) =>
  controller.removeZone(c, c.req.valid('param').id)
)

adminCoverageRoutes.post(
  '/recommendations/:id/duplicates',
  ...adminMiddleware,
  idParam,
  (c) => controller.recommendationDuplicates(c, c.req.valid('param').id)
)

adminCoverageRoutes.post(
  '/recommendations/:id/lead',
  ...adminMiddleware,
  idParam,
  adminSignedJson(fromRecommendationSchema),
  (c) =>
    controller.fromRecommendation(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)

adminCoverageRoutes.post(
  '/recommendations/:id/dismiss',
  ...adminMiddleware,
  idParam,
  adminSignedJson(dismissRecommendationSchema),
  (c) =>
    controller.dismissRecommendation(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
