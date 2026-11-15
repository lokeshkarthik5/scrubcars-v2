import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './service-categories.controller.js'
import {
  moveServiceCategorySchema,
  serviceIdParamSchema,
  setCategoryHintSchema,
} from './service-categories.validation.js'

/**
 * Settings → Services in Others (0080). Mounted at
 * /api/v1/admin/service-categories. Super-admin only, as the rest of admin
 * (a garage or customer token is refused); every write is signed with the
 * session's name.
 *
 *   GET  /others                         every garage's live services in Others
 *   POST /services/:serviceId/move       Move (and Undo): { from, category }
 *   POST /services/:serviceId/hint       "Not this": { dismissed }
 */
export const adminServiceCategoryRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminServiceCategoryRoutes.get('/others', ...adminMiddleware, controller.listOthers)

adminServiceCategoryRoutes.post(
  '/services/:serviceId/move',
  ...adminMiddleware,
  zValidator('param', serviceIdParamSchema),
  adminSignedJson(moveServiceCategorySchema),
  (c) => controller.move(c, c.req.valid('param').serviceId, c.req.valid('json'))
)

adminServiceCategoryRoutes.post(
  '/services/:serviceId/hint',
  ...adminMiddleware,
  zValidator('param', serviceIdParamSchema),
  adminSignedJson(setCategoryHintSchema),
  (c) => controller.setHint(c, c.req.valid('param').serviceId, c.req.valid('json'))
)
