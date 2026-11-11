import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './cities.controller.js'
import {
  cityIdParamSchema,
  createCitySchema,
  otherTownsSchema,
  updateCitySchema,
} from './cities.validation.js'

/**
 * Cities (0069). Mounted at /api/v1/admin/cities. Super-admin only, as the
 * other owner settings (tiers); every write is signed with the session's
 * name and leaves an admin_audit_log row.
 *
 *   GET    /              every city with its counts, and the Other towns row
 *   POST   /              add a city
 *   PATCH  /other-towns   garages in no city shown to customers, or not
 *   PATCH  /:id           rename, move the centre, change the reach, or
 *                         switch "Customers see garages here"
 *   DELETE /:id           delete a city (its garages move to the city that
 *                         now holds them, else Other towns)
 *
 * Every answer is the whole overview, so the page redraws from one reply.
 */
export const adminCityRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const
const idParam = zValidator('param', cityIdParamSchema)

adminCityRoutes.get('/', ...adminMiddleware, controller.overview)

adminCityRoutes.post('/', ...adminMiddleware, adminSignedJson(createCitySchema), (c) =>
  controller.createCity(c, c.req.valid('json'))
)

// Before /:id, so "other-towns" is never read as a city's id.
adminCityRoutes.patch('/other-towns', ...adminMiddleware, adminSignedJson(otherTownsSchema), (c) =>
  controller.setOtherTowns(c, c.req.valid('json'))
)

adminCityRoutes.patch('/:id', ...adminMiddleware, idParam, adminSignedJson(updateCitySchema), (c) =>
  controller.updateCity(c, c.req.valid('param').id, c.req.valid('json'))
)

adminCityRoutes.delete('/:id', ...adminMiddleware, idParam, (c) =>
  controller.deleteCity(c, c.req.valid('param').id)
)
