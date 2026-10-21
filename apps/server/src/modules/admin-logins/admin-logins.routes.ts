import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { rateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as controller from './admin-logins.controller.js'
import {
  changeOwnPasswordSchema,
  createAdminLoginSchema,
  loginIdParamSchema,
  resetAdminPasswordSchema,
  setAdminLoginStatusSchema,
} from './admin-logins.validation.js'

/**
 * Personal admin logins (0058): Settings → Team logins. Mounted at
 * /api/v1/admin/logins (admin.routes.ts) for the admin cookie's path.
 * Super-admin only, any of the three kinds: the shared env login is how the
 * first ones are made. Every change is in admin_audit_log; nothing here ever
 * returns a password or its hash.
 */
export const adminLoginRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminLoginRoutes.get('/', ...adminMiddleware, controller.list)

adminLoginRoutes.post('/', ...adminMiddleware, zValidator('json', createAdminLoginSchema), (c) =>
  controller.create(c, c.req.valid('json'))
)

adminLoginRoutes.post(
  '/:id/password',
  ...adminMiddleware,
  zValidator('param', loginIdParamSchema),
  zValidator('json', resetAdminPasswordSchema),
  (c) => controller.resetPassword(c, c.req.valid('param').id, c.req.valid('json'))
)

adminLoginRoutes.post(
  '/:id/status',
  ...adminMiddleware,
  zValidator('param', loginIdParamSchema),
  zValidator('json', setAdminLoginStatusSchema),
  (c) => controller.setStatus(c, c.req.valid('param').id, c.req.valid('json'))
)

/**
 * Your own password, with the current one: mounted at /api/v1/admin/me/password.
 * Rate limited like sign-in, since it checks a password.
 */
export const adminOwnPasswordRoutes = new Hono<{ Variables: AuthVariables }>()

adminOwnPasswordRoutes.post(
  '/',
  rateLimiter,
  ...adminMiddleware,
  zValidator('json', changeOwnPasswordSchema),
  (c) => controller.changeOwnPassword(c, c.req.valid('json'))
)
