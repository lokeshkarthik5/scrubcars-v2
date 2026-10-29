import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as tiersController from './tiers.controller.js'
import { tierHiddenSchema, tierSwitchSchema, vendorIdParamSchema } from './tiers.validation.js'

/**
 * Mounted at /api/v1/tiers (app.ts): which tiers customers see, so the
 * customer app knows whether to offer "Silver & above". Public; no garage's
 * data.
 */
export const publicTierRoutes = new Hono()

publicTierRoutes.get('/', tiersController.getPublicTierConfig)

/**
 * Mounted at /vendors/me/tier (vendors.routes.ts). The owner seat only: no
 * widening, so it is vendor_admin and an operator gets a 403 (default deny);
 * the garage is always the tenant resolveTenant produced.
 */
export const garageTierRoutes = new Hono<{ Variables: TenantVariables }>()

garageTierRoutes.get('/', authMiddleware, resolveTenant, requireVendorRole('vendor_admin'), tiersController.getGarageTier)

/**
 * Mounted at /api/v1/admin/tiers (admin.routes.ts), like Documents: the admin
 * session cookie is scoped to /api/v1/admin. Super-admin only.
 */
export const adminTierRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminTierRoutes.get('/settings', ...adminMiddleware, tiersController.getTierSettings)

adminTierRoutes.post('/settings', ...adminMiddleware, adminSignedJson(tierSwitchSchema), (c) =>
  tiersController.setTierSwitch(c, c.req.valid('json'))
)

adminTierRoutes.get('/vendors/:vendorId', ...adminMiddleware, zValidator('param', vendorIdParamSchema), (c) =>
  tiersController.getAdminTier(c, c.req.valid('param').vendorId)
)

adminTierRoutes.post(
  '/vendors/:vendorId/hidden',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(tierHiddenSchema),
  (c) => tiersController.setTierHidden(c, c.req.valid('param').vendorId, c.req.valid('json'))
)
