import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './leads.controller.js'
import {
  createLeadSchema,
  duplicatesSchema,
  fromPlacesSchema,
  pastePreviewSchema,
  pasteSaveSchema,
  resolvePinSchema,
  updateLeadSchema,
} from './leads.validation.js'

/**
 * Leads (0064, Coverage & leads): garages the team wants to sign up.
 * Mounted at /api/v1/admin/leads. Super-admin only; every write is signed
 * with the session's name.
 *
 *   POST   /                  add one (Add lead)
 *   POST   /resolve-pin       a Maps link's pin and zone ("Pin found")
 *   POST   /duplicates        what a lead about to be saved looks like
 *   POST   /paste/preview     a pasted list, line by line (nothing saved)
 *   POST   /paste             save the lines kept
 *   POST   /from-places       ticked finder results become leads
 *   GET    /:id               one lead (Onboard's prefill)
 *   PATCH  /:id               status, assign, note, name, phone, pin, garage
 *   DELETE /:id               remove a lead
 */
export const adminLeadsRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const
const idParam = zValidator('param', z.object({ id: z.string().uuid() }))

adminLeadsRoutes.post(
  '/',
  ...adminMiddleware,
  adminSignedJson(createLeadSchema),
  (c) => controller.create(c, c.req.valid('json'))
)

adminLeadsRoutes.post(
  '/resolve-pin',
  ...adminMiddleware,
  zValidator('json', resolvePinSchema),
  (c) => controller.resolvePin(c, c.req.valid('json'))
)

adminLeadsRoutes.post(
  '/duplicates',
  ...adminMiddleware,
  zValidator('json', duplicatesSchema),
  (c) => controller.duplicates(c, c.req.valid('json'))
)

adminLeadsRoutes.post(
  '/paste/preview',
  ...adminMiddleware,
  zValidator('json', pastePreviewSchema),
  (c) => controller.pastePreview(c, c.req.valid('json'))
)

adminLeadsRoutes.post(
  '/paste',
  ...adminMiddleware,
  adminSignedJson(pasteSaveSchema),
  (c) => controller.pasteSave(c, c.req.valid('json'))
)

adminLeadsRoutes.post(
  '/from-places',
  ...adminMiddleware,
  adminSignedJson(fromPlacesSchema),
  (c) => controller.fromPlaces(c, c.req.valid('json'))
)

adminLeadsRoutes.get('/:id', ...adminMiddleware, idParam, (c) =>
  controller.get(c, c.req.valid('param').id)
)

adminLeadsRoutes.patch(
  '/:id',
  ...adminMiddleware,
  idParam,
  adminSignedJson(updateLeadSchema),
  (c) => controller.update(c, c.req.valid('param').id, c.req.valid('json'))
)

adminLeadsRoutes.delete('/:id', ...adminMiddleware, idParam, (c) =>
  controller.remove(c, c.req.valid('param').id)
)
