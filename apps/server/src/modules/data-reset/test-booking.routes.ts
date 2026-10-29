import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as dataResetController from './data-reset.controller.js'
import {
  testBookingDeleteSchema,
  testBookingParamSchema,
  testBookingPreviewSchema,
} from './data-reset.validation.js'

/**
 * "Delete test booking" on a booking marked Test (owner, 28 Oct 2026): the
 * reset's own dry run and delete, for that booking's chain alone. Unlike
 * the rest of the reset (data-reset.routes.ts) these are not behind
 * ADMIN_DATA_RESET. Super-admin only, as the reset is. Mounted at the root
 * of /api/v1/admin for the cookie's sake:
 *
 *   POST /bookings/:id/test-delete/preview   the dry run
 *   POST /bookings/:id/test-delete           the delete (signed)
 *   GET  /deleted-test-payments              the team tests' ledger (0065)
 */
export const adminTestBookingRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminTestBookingRoutes.post(
  '/bookings/:id/test-delete/preview',
  ...adminMiddleware,
  zValidator('param', testBookingParamSchema),
  zValidator('json', testBookingPreviewSchema),
  (c) => dataResetController.previewTestBooking(c, c.req.valid('param').id, c.req.valid('json'))
)

adminTestBookingRoutes.post(
  '/bookings/:id/test-delete',
  ...adminMiddleware,
  zValidator('param', testBookingParamSchema),
  adminSignedJson(testBookingDeleteSchema),
  (c) => dataResetController.deleteTestBooking(c, c.req.valid('param').id, c.req.valid('json'))
)

// The ledger of real payments deleted as team tests (0065), newest first,
// for the CSV on the Refunds page. Ids, amounts and Razorpay ids only.
adminTestBookingRoutes.get('/deleted-test-payments', ...adminMiddleware, (c) =>
  dataResetController.listDeletedTestPayments(c)
)
