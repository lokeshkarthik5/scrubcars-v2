import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware, requireSuperAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as controller from './garage-closure.controller.js'
import { requestClosureSchema, vendorIdParamSchema } from './garage-closure.validation.js'

/**
 * "Close my garage" (0066): /vendors/me/closure. The owner seat's role
 * (default deny) and, in the service, the garage's own owner only; the
 * garage is always resolveTenant's.
 */
export const garageClosureRoutes = new Hono<{ Variables: TenantVariables }>()

const ownerSeat = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

garageClosureRoutes.get('/', ...ownerSeat, controller.getMine)
garageClosureRoutes.post('/', ...ownerSeat, zValidator('json', requestClosureSchema), (c) =>
  controller.requestMine(c, c.req.valid('json'))
)
garageClosureRoutes.post('/cancel', ...ownerSeat, controller.cancelMine)

/**
 * Admin: GET /garage-closures (every open request) and
 * GET /vendors/:id/closure-request (the garage page's banner). Confirming is
 * moving the garage to the Bin (modules/vendor-bin). Mounted at the root of
 * /admin for the cookie's sake, like the Bin's.
 */
export const adminGarageClosureRoutes = new Hono<{ Variables: AuthVariables }>()

const admin = [authMiddleware, requireSuperAdmin] as const

adminGarageClosureRoutes.get('/garage-closures', ...admin, controller.listOpen)
adminGarageClosureRoutes.get('/vendors/:id/closure-request', ...admin, zValidator('param', vendorIdParamSchema), (c) =>
  controller.getForGarage(c, c.req.valid('param').id)
)
