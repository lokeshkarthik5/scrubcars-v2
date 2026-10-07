import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
} from '../../middleware/auth.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as chargesController from './booking-charges.controller.js'
import {
  chargeParamSchema,
  jobIdParamSchema,
  raiseFinalBillSchema,
  verifyChargePaymentSchema,
} from './booking-charges.validation.js'

/**
 * The customer's side of a final bill, mounted at /bookings: paying the
 * balance in the app. Only the customer who owns the booking can open or
 * confirm it; for anyone else the bill does not exist (404).
 */
export const bookingChargesRoutes = new Hono<{ Variables: TenantVariables }>()

bookingChargesRoutes.post(
  '/:id/charges/:chargeId/pay',
  authMiddleware,
  requireCustomer,
  zValidator('param', chargeParamSchema),
  (c) =>
    chargesController.payCharge(
      c,
      c.req.valid('param').id,
      c.req.valid('param').chargeId
    )
)

bookingChargesRoutes.post(
  '/:id/charges/:chargeId/verify',
  authMiddleware,
  requireCustomer,
  zValidator('param', chargeParamSchema),
  zValidator('json', verifyChargePaymentSchema),
  (c) =>
    chargesController.verifyChargePayment(
      c,
      c.req.valid('param').id,
      c.req.valid('param').chargeId,
      c.req.valid('json')
    )
)

/**
 * The garage's side, mounted at /vendors/me/bookings: raising the final bill
 * of an inspection job. Widened to operators on purpose — whoever inspects
 * the car and does the work writes the bill — while the payout and every
 * earnings figure stay behind GET /vendors/me/earnings.
 */
export const vendorFinalBillRoutes = new Hono<{ Variables: TenantVariables }>()

const jobMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin', 'vendor_operator'),
] as const

vendorFinalBillRoutes.get(
  '/:id/final-bill',
  ...jobMiddleware,
  zValidator('param', jobIdParamSchema),
  (c) => chargesController.getFinalBill(c, c.req.valid('param').id)
)

vendorFinalBillRoutes.post(
  '/:id/final-bill',
  ...jobMiddleware,
  zValidator('param', jobIdParamSchema),
  zValidator('json', raiseFinalBillSchema),
  (c) =>
    chargesController.raiseFinalBill(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
