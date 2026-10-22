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
import * as proposalsController from './time-proposals.controller.js'
import {
  chooseTimeSchema,
  proposalBookingParamSchema,
  proposalSlotsQuerySchema,
  suggestTimesSchema,
} from './time-proposals.validation.js'

/**
 * The customer's side of "Suggest another time" (0041), mounted at
 * /bookings: picking one of the garage's times, or saying none work. Only
 * the booking's own customer; for anyone else the booking does not exist.
 */
export const customerTimeProposalRoutes = new Hono<{ Variables: TenantVariables }>()

customerTimeProposalRoutes.post(
  '/:id/time-proposal/choose',
  authMiddleware,
  requireCustomer,
  zValidator('param', proposalBookingParamSchema),
  zValidator('json', chooseTimeSchema),
  (c) => proposalsController.choose(c, c.req.valid('param').id, c.req.valid('json'))
)

customerTimeProposalRoutes.post(
  '/:id/time-proposal/decline',
  authMiddleware,
  requireCustomer,
  zValidator('param', proposalBookingParamSchema),
  (c) => proposalsController.decline(c, c.req.valid('param').id)
)

/**
 * The garage's side, mounted at /vendors/me/bookings. Open to operators like
 * Accept and Decline, which this stands in for; nothing here touches money.
 */
export const vendorTimeProposalRoutes = new Hono<{ Variables: TenantVariables }>()

const jobMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin', 'vendor_operator'),
] as const

vendorTimeProposalRoutes.get(
  '/:id/time-proposal/slots',
  ...jobMiddleware,
  zValidator('param', proposalBookingParamSchema),
  zValidator('query', proposalSlotsQuerySchema),
  (c) => proposalsController.getSlots(c, c.req.valid('param').id, c.req.valid('query'))
)

vendorTimeProposalRoutes.post(
  '/:id/time-proposal',
  ...jobMiddleware,
  zValidator('param', proposalBookingParamSchema),
  zValidator('json', suggestTimesSchema),
  (c) => proposalsController.suggest(c, c.req.valid('param').id, c.req.valid('json'))
)

vendorTimeProposalRoutes.post(
  '/:id/time-proposal/withdraw',
  ...jobMiddleware,
  zValidator('param', proposalBookingParamSchema),
  (c) => proposalsController.withdraw(c, c.req.valid('param').id)
)
