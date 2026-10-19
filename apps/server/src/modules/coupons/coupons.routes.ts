import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireSuperAdmin,
  type AuthVariables,
  adminSignedJson,
} from '../../middleware/auth.middleware.js'
import { couponCodeRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as couponsController from './coupons.controller.js'
import {
  batchIdParamSchema,
  createBatchSchema,
  lookupCouponSchema,
  redeemCouponSchema,
  voidBatchSchema,
  voidCodeSchema,
} from './coupons.validation.js'

/**
 * Printed coupons with QR codes (0056). No switch: nothing happens until the
 * team makes a batch.
 *
 * A code always travels in the body (POST), never the URL of an API call:
 * request logs record paths. The coupon page's own address carries it (that
 * is what the QR holds), but the page sends it here in the body.
 */

// ─── Public: /api/v1/coupons ─────────────────────────────────────────────────

export const publicCouponRoutes = new Hono<{ Variables: Partial<AuthVariables> }>()

// The /c/<code> page: anyone holding the code sees the offer. Wrong codes are
// counted per network address (and per customer when signed in); a per-IP
// limiter of its own caps bursts on top.
publicCouponRoutes.post(
  '/lookup',
  couponCodeRateLimiter,
  optionalAuthMiddleware,
  zValidator('json', lookupCouponSchema),
  (c) => couponsController.lookup(c, c.req.valid('json').code)
)

// ─── Customer: /api/v1/users/me/coupons ──────────────────────────────────────

/**
 * Mounted at /users/me/coupons (users.routes.ts), after that file's
 * authMiddleware + requireCustomer: the session's customer only, never a
 * parameter. Nobody can list or add coupons for anyone else.
 */
export const customerCouponRoutes = new Hono<{ Variables: AuthVariables }>()

customerCouponRoutes.get('/', couponsController.listMine)
customerCouponRoutes.post('/redeem', couponCodeRateLimiter, zValidator('json', redeemCouponSchema), (c) =>
  couponsController.redeem(c, c.req.valid('json'))
)

// ─── Admin: /api/v1/admin/coupons ────────────────────────────────────────────

/** Super-admin only. Mounted at /admin/coupons (admin.routes.ts) for the admin cookie's path. */
export const adminCouponRoutes = new Hono<{ Variables: AuthVariables }>()

adminCouponRoutes.use('*', authMiddleware, requireSuperAdmin)

adminCouponRoutes.get('/config', couponsController.adminConfig)
adminCouponRoutes.get('/batches', couponsController.listBatches)
adminCouponRoutes.post('/batches', adminSignedJson(createBatchSchema), (c) =>
  couponsController.createBatch(c, c.req.valid('json'))
)
adminCouponRoutes.get('/batches/:id', zValidator('param', batchIdParamSchema), (c) =>
  couponsController.getBatch(c, c.req.valid('param').id)
)
adminCouponRoutes.get('/batches/:id/codes', zValidator('param', batchIdParamSchema), (c) =>
  couponsController.listCodes(c, c.req.valid('param').id)
)
adminCouponRoutes.get('/batches/:id/redemptions', zValidator('param', batchIdParamSchema), (c) =>
  couponsController.listRedemptions(c, c.req.valid('param').id)
)
adminCouponRoutes.post(
  '/batches/:id/void',
  zValidator('param', batchIdParamSchema),
  adminSignedJson(voidBatchSchema),
  (c) => couponsController.voidBatch(c, c.req.valid('param').id, c.req.valid('json'))
)
adminCouponRoutes.post(
  '/batches/:id/codes/void',
  zValidator('param', batchIdParamSchema),
  adminSignedJson(voidCodeSchema),
  (c) => couponsController.voidCode(c, c.req.valid('param').id, c.req.valid('json'))
)
