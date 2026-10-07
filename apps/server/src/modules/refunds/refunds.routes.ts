import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as refundsController from './refunds.controller.js'
import { listRefundsQuerySchema, recordRefundSchema } from './refunds.validation.js'

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

// Records a refund ops has done in Razorpay (or outside it). Nothing here
// moves money: refunds stay manual in the Razorpay dashboard for the pilot.
adminRefundRoutes.post(
  '/',
  ...adminMiddleware,
  zValidator('json', recordRefundSchema),
  (c) => refundsController.recordRefund(c, c.req.valid('json'))
)
