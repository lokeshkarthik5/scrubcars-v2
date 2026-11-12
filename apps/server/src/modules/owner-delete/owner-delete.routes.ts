import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireOwner,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './owner-delete.controller.js'
import {
  ownerCouponCodeDeleteSchema,
  ownerDeleteIdParamSchema,
  ownerDeleteSchema,
  ownerTypedDeleteSchema,
  zoneSignupParamSchema,
} from './owner-delete.validation.js'

/**
 * The owner deletes anything (owner, 10 Nov 2026): hard deletes beside the
 * soft actions the rest of the team has (lib/owner-delete.ts has the rules).
 * Owner only: the owner's login or the shared break-glass login; any other
 * admin is 403 ADMIN_OWNER_ONLY. Every delete is signed and audited, and a
 * missing row is a 404. Mounted at the root of /api/v1/admin for the
 * cookie's sake:
 *
 *   DELETE /owner-delete/reviews/:id
 *   DELETE /owner-delete/complaints/:id            { confirmText: "C-000123" }
 *   DELETE /owner-delete/bypass-reports/:id
 *   DELETE /owner-delete/guarantee-claims/:id      { confirmText: booking reference }
 *   GET    /owner-delete/discounts/:id             what Delete anyway leaves
 *   DELETE /owner-delete/discounts/:id             { confirmText: the code }
 *   GET    /owner-delete/coupon-batches/:id        how many codes were redeemed
 *   DELETE /owner-delete/coupon-batches/:id        { confirmText: the batch name }
 *   DELETE /owner-delete/coupon-batches/:id/codes  { code: "DTL-7K4QM-92MXA", typed as for Void }
 *   DELETE /owner-delete/notices/:id
 *   DELETE /owner-delete/gifts/:id                 { confirmText: "G-000123" }
 *   DELETE /owner-delete/reward-challenges/:id     { confirmText: the title }
 *   GET    /owner-delete/zones/:id/signups         the zone's list
 *   DELETE /owner-delete/zones/:id/signups/:userId
 *   DELETE /owner-delete/admin-logins/:id          { confirmText: the username }
 *   DELETE /owner-delete/job-photos/:id
 *
 * Not here on purpose: refunds, payouts, receipts, the audit log and the
 * deleted-test-payments ledger (money records; they go only with their
 * booking, through Delete test booking). A zone in use is the coverage
 * module's (DELETE /coverage/zones/:id/anyway), a customer's account the
 * Customers page's (DELETE /customers/:id), a booking Delete test booking's.
 */
export const adminOwnerDeleteRoutes = new Hono<{ Variables: AuthVariables }>()

const owner = [authMiddleware, requireSuperAdmin, requireOwner] as const
const idParam = zValidator('param', ownerDeleteIdParamSchema)
const plain = adminSignedJson(ownerDeleteSchema)
const typed = adminSignedJson(ownerTypedDeleteSchema)

adminOwnerDeleteRoutes.delete('/owner-delete/reviews/:id', ...owner, idParam, plain, (c) =>
  controller.deleteReview(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete('/owner-delete/complaints/:id', ...owner, idParam, typed, (c) =>
  controller.deleteComplaint(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete('/owner-delete/bypass-reports/:id', ...owner, idParam, plain, (c) =>
  controller.deleteBypassReport(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete('/owner-delete/guarantee-claims/:id', ...owner, idParam, typed, (c) =>
  controller.deleteClaim(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.get('/owner-delete/discounts/:id', ...owner, idParam, (c) =>
  controller.discountPreview(c, c.req.valid('param').id)
)
adminOwnerDeleteRoutes.delete('/owner-delete/discounts/:id', ...owner, idParam, typed, (c) =>
  controller.deleteDiscountAnyway(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.get('/owner-delete/coupon-batches/:id', ...owner, idParam, (c) =>
  controller.couponBatchPreview(c, c.req.valid('param').id)
)
adminOwnerDeleteRoutes.delete('/owner-delete/coupon-batches/:id', ...owner, idParam, typed, (c) =>
  controller.deleteCouponBatch(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete(
  '/owner-delete/coupon-batches/:id/codes',
  ...owner,
  idParam,
  adminSignedJson(ownerCouponCodeDeleteSchema),
  (c) => controller.deleteCouponCode(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete('/owner-delete/notices/:id', ...owner, idParam, plain, (c) =>
  controller.deleteNotice(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete('/owner-delete/gifts/:id', ...owner, idParam, typed, (c) =>
  controller.deleteGift(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete('/owner-delete/reward-challenges/:id', ...owner, idParam, typed, (c) =>
  controller.deleteChallenge(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.get('/owner-delete/zones/:id/signups', ...owner, idParam, (c) =>
  controller.listZoneSignups(c, c.req.valid('param').id)
)
adminOwnerDeleteRoutes.delete(
  '/owner-delete/zones/:id/signups/:userId',
  ...owner,
  zValidator('param', zoneSignupParamSchema),
  plain,
  (c) => controller.removeZoneSignup(c, c.req.valid('param').id, c.req.valid('param').userId, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete('/owner-delete/admin-logins/:id', ...owner, idParam, typed, (c) =>
  controller.deleteAdminLogin(c, c.req.valid('param').id, c.req.valid('json'))
)
adminOwnerDeleteRoutes.delete('/owner-delete/job-photos/:id', ...owner, idParam, plain, (c) =>
  controller.deleteJobPhoto(c, c.req.valid('param').id, c.req.valid('json'))
)
