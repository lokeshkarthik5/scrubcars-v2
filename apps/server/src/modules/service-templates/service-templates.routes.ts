import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { serviceTemplateWriteRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as controller from './service-templates.controller.js'
import {
  createTemplateSchema,
  listTemplatesQuerySchema,
  setTemplateOnSchema,
  templateIdParamSchema,
  updateTemplateSchema,
} from './service-templates.validation.js'

/**
 * Service templates (0082). Mounted at /api/v1/admin/service-templates.
 * Super-admin only, as the rest of admin (a garage or customer token is
 * refused with 403); every write is signed with the session's name, leaves
 * an admin_audit_log row, and is rate limited per signed-in admin per hour
 * (SERVICE_TEMPLATE_WRITE_RATE_LIMIT).
 *
 *   GET    /             every template not deleted (Settings → Service
 *                        templates); ?on=true only the switched-on ones
 *                        (the garage editor's "Add from template")
 *   POST   /             Add template, or Save as template ({ fromVendorId })
 *   PATCH  /:id          Edit: only what is sent changes
 *   PATCH  /:id/on       the list's On/Off switch: { on }
 *   DELETE /:id          Delete (services added from it are untouched)
 */
export const adminServiceTemplateRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const
const writeMiddleware = [authMiddleware, requireSuperAdmin, serviceTemplateWriteRateLimiter] as const
const idParam = zValidator('param', templateIdParamSchema)

adminServiceTemplateRoutes.get('/', ...adminMiddleware, zValidator('query', listTemplatesQuerySchema), (c) =>
  controller.list(c, c.req.valid('query').on === 'true')
)

adminServiceTemplateRoutes.post('/', ...writeMiddleware, adminSignedJson(createTemplateSchema), (c) =>
  controller.create(c, c.req.valid('json'))
)

adminServiceTemplateRoutes.patch('/:id/on', ...writeMiddleware, idParam, adminSignedJson(setTemplateOnSchema), (c) =>
  controller.setOn(c, c.req.valid('param').id, c.req.valid('json'))
)

adminServiceTemplateRoutes.patch('/:id', ...writeMiddleware, idParam, adminSignedJson(updateTemplateSchema), (c) =>
  controller.update(c, c.req.valid('param').id, c.req.valid('json'))
)

adminServiceTemplateRoutes.delete('/:id', ...writeMiddleware, idParam, (c) =>
  controller.remove(c, c.req.valid('param').id)
)
