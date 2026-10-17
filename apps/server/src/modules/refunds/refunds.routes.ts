import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as refundsController from './refunds.controller.js'
import { listRefundsQuerySchema, recordRefundSchema, refundNowSchema } from './refunds.validation.js'

// Refunds owed and done. Mounted under /api/v1/admin/refunds (see
// admin.routes.ts), like discounts: the admin session cookie is scoped to
// path=/api/v1/admin, so anywhere else the browser would not send it.
export const adminRefundRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

// ?status=owed (the default) or done.
adminRefundRoutes.get(
  '/',
  ...adminMiddleware,
  zValidator('query', listRefundsQuerySchema),
  (c) => refundsController.listRefunds(c, c.req.valid('query'))
)

// Records a refund ops has done in the Razorpay dashboard (or outside
// Razorpay). Nothing here moves money; Refund now below is what sends one.
adminRefundRoutes.post(
  '/',
  ...adminMiddleware,
  zValidator('json', recordRefundSchema),
  (c) => refundsController.recordRefund(c, c.req.valid('json'))
)

// Refund now: sends a refund through Razorpay from Detlio's balance, then
// records it like the route above. Super-admin only, like every refunds
// route. Always normal speed; never more than is owed.
adminRefundRoutes.post(
  '/send',
  ...adminMiddleware,
  zValidator('json', refundNowSchema),
  (c) => refundsController.refundNow(c, c.req.valid('json'))
)
