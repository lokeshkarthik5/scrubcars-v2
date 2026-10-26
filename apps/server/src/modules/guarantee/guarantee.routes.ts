import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
  adminSignedJson,
} from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as guaranteeController from './guarantee.controller.js'
import {
  adminClaimsQuerySchema,
  bookingIdParamSchema,
  bookRedoSchema,
  claimIdParamSchema,
  claimPhotoUploadSchema,
  createClaimSchema,
  decideClaimSchema,
  disputeClaimSchema,
  garageClaimsQuerySchema,
  redoSlotsQuerySchema,
} from './guarantee.validation.js'

/**
 * Detlio Guarantee (0051). Off while GUARANTEE_ENABLED is not `on`: every
 * route below but the public `/config` and admin's `/config` is the same 404
 * as an unknown path, before auth runs, so the apps ask `/config` whether
 * to show the guarantee at all.
 */
const guaranteeOn = notFoundUnless(() => env.guaranteeEnabled)

// ─── Public: /api/v1/guarantee ───────────────────────────────────────────────

/** Whether it is on, and its numbers: the checkout badge and the Help centre read it. */
export const publicGuaranteeRoutes = new Hono()

publicGuaranteeRoutes.get('/config', guaranteeController.getConfig)

// ─── Customer: /api/v1/users/me/guarantee ────────────────────────────────────

/**
 * Mounted at /users/me/guarantee (users.routes.ts), after that file's
 * authMiddleware + requireCustomer: a signed-in customer, acting only on
 * their own bookings and claims (the session's id, never a parameter).
 * Anyone else's booking or claim is a 404.
 */
export const customerGuaranteeRoutes = new Hono<{ Variables: AuthVariables }>()

customerGuaranteeRoutes.use('*', guaranteeOn)

customerGuaranteeRoutes.get('/bookings/:bookingId', zValidator('param', bookingIdParamSchema), (c) =>
  guaranteeController.forBooking(c, c.req.valid('param').bookingId)
)
customerGuaranteeRoutes.post(
  '/bookings/:bookingId/photos/upload-url',
  zValidator('param', bookingIdParamSchema),
  zValidator('json', claimPhotoUploadSchema),
  (c) => guaranteeController.createUploadUrl(c, c.req.valid('param').bookingId, c.req.valid('json'))
)
customerGuaranteeRoutes.post('/claims', zValidator('json', createClaimSchema), (c) =>
  guaranteeController.submit(c, c.req.valid('json'))
)
customerGuaranteeRoutes.get(
  '/claims/:id/slots',
  zValidator('param', claimIdParamSchema),
  zValidator('query', redoSlotsQuerySchema),
  (c) => guaranteeController.redoSlots(c, c.req.valid('param').id, c.req.valid('query').date)
)
customerGuaranteeRoutes.post(
  '/claims/:id/redo',
  zValidator('param', claimIdParamSchema),
  zValidator('json', bookRedoSchema),
  (c) => guaranteeController.bookRedo(c, c.req.valid('param').id, c.req.valid('json'))
)

// ─── Garage: /api/v1/vendors/me/guarantee ────────────────────────────────────

/**
 * Mounted at /vendors/me/guarantee (vendors.routes.ts). The owner seat only:
 * no widening, so an operator gets a 403 (default deny). Answering commits
 * the garage to a free redo, or starts a dispute: the owner's call. The
 * garage is always the tenant resolveTenant produced; another garage's
 * claim is a 404. A Detlio support session reads but cannot answer.
 */
export const garageGuaranteeRoutes = new Hono<{ Variables: TenantVariables }>()

const garageMiddleware = [guaranteeOn, authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

garageGuaranteeRoutes.get('/claims', ...garageMiddleware, zValidator('query', garageClaimsQuerySchema), (c) =>
  guaranteeController.listForGarage(c, c.req.valid('query'))
)
garageGuaranteeRoutes.post(
  '/claims/:id/accept',
  ...garageMiddleware,
  zValidator('param', claimIdParamSchema),
  (c) => guaranteeController.accept(c, c.req.valid('param').id)
)
garageGuaranteeRoutes.post(
  '/claims/:id/dispute',
  ...garageMiddleware,
  zValidator('param', claimIdParamSchema),
  zValidator('json', disputeClaimSchema),
  (c) => guaranteeController.dispute(c, c.req.valid('param').id, c.req.valid('json').note)
)

// ─── Admin: /api/v1/admin/guarantee ──────────────────────────────────────────

/** Super-admin only. Mounted at /admin/guarantee (admin.routes.ts) for the admin cookie's path. */
export const adminGuaranteeRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminGuaranteeRoutes.get('/config', ...adminMiddleware, guaranteeController.getConfig)
adminGuaranteeRoutes.get(
  '/claims',
  guaranteeOn,
  ...adminMiddleware,
  zValidator('query', adminClaimsQuerySchema),
  (c) => guaranteeController.adminList(c, c.req.valid('query'))
)
adminGuaranteeRoutes.get(
  '/claims/:id',
  guaranteeOn,
  ...adminMiddleware,
  zValidator('param', claimIdParamSchema),
  (c) => guaranteeController.adminGet(c, c.req.valid('param').id)
)
adminGuaranteeRoutes.post(
  '/claims/:id/decide',
  guaranteeOn,
  ...adminMiddleware,
  zValidator('param', claimIdParamSchema),
  adminSignedJson(decideClaimSchema),
  (c) => guaranteeController.decide(c, c.req.valid('param').id, c.req.valid('json'))
)
