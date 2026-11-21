import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as controller from './pickup-fees.controller.js'
import {
  adminGarageFeeSchema,
  adminLimitsSchema,
  changeIdParamSchema,
  decideSchema,
  garageFeeSchema,
  listQuerySchema,
  lockSchema,
  pickupFeeSettingsSchema,
  vendorIdParamSchema,
} from './pickup-fees.validation.js'

/**
 * Mounted at /api/v1/pickup-fee (app.ts): Detlio's suggested fee and its
 * convenience fee, for Ask for pickup's suggestion and checkout's lines.
 * Public; no garage's data.
 */
export const publicPickupFeeRoutes = new Hono()

publicPickupFeeRoutes.get('/', controller.getPublicConfig)

/**
 * Mounted at /vendors/me/pickup-fee (vendors.routes.ts). The owner seat only
 * (default deny), as the rest of Pickup & drop; a Detlio support session may
 * read it but changes the fee from admin instead.
 */
export const garagePickupFeeRoutes = new Hono<{ Variables: TenantVariables & AuthVariables }>()

const garageMiddleware = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

garagePickupFeeRoutes.get('/', ...garageMiddleware, controller.getGarageFee)
garagePickupFeeRoutes.put('/', ...garageMiddleware, zValidator('json', garageFeeSchema), (c) =>
  controller.setGarageFee(c, c.req.valid('json'))
)

/**
 * Mounted at /api/v1/admin/pickup-fees (admin.routes.ts). Super-admin only:
 * Settings → Pickup fee, the garage editor's pickup card (the fee, who sets
 * it, the garage's own limits) and Issues → Pickup fees. The garage's own
 * route above takes the fee alone (garageFeeSchema is strict), so no garage
 * reaches who sets it, its limits or its source.
 */
export const adminPickupFeeRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminPickupFeeRoutes.get('/settings', ...adminMiddleware, controller.getSettings)
adminPickupFeeRoutes.put('/settings', ...adminMiddleware, adminSignedJson(pickupFeeSettingsSchema), (c) =>
  controller.saveSettings(c, c.req.valid('json'))
)

adminPickupFeeRoutes.get('/', ...adminMiddleware, zValidator('query', listQuerySchema), (c) =>
  controller.listForCheck(c, c.req.valid('query').show)
)

adminPickupFeeRoutes.post(
  '/changes/:changeId/decide',
  ...adminMiddleware,
  zValidator('param', changeIdParamSchema),
  adminSignedJson(decideSchema),
  (c) => controller.decide(c, c.req.valid('param').changeId, c.req.valid('json'))
)

adminPickupFeeRoutes.get('/vendors/:vendorId', ...adminMiddleware, zValidator('param', vendorIdParamSchema), (c) =>
  controller.getAdminGarage(c, c.req.valid('param').vendorId)
)

adminPickupFeeRoutes.put(
  '/vendors/:vendorId',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(adminGarageFeeSchema),
  (c) => controller.setAdminGarageFee(c, c.req.valid('param').vendorId, c.req.valid('json'))
)

adminPickupFeeRoutes.post(
  '/vendors/:vendorId/lock',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(lockSchema),
  (c) => controller.setLock(c, c.req.valid('param').vendorId, c.req.valid('json'))
)

adminPickupFeeRoutes.put(
  '/vendors/:vendorId/limits',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(adminLimitsSchema),
  (c) => controller.setLimits(c, c.req.valid('param').vendorId, c.req.valid('json'))
)
