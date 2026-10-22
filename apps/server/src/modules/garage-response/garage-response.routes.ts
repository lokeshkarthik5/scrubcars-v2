import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware, requireCustomer } from '../../middleware/auth.middleware.js'
import type { TenantVariables } from '../../middleware/tenant.middleware.js'
import * as garageResponseController from './garage-response.controller.js'
import { otherGaragesParamSchema } from './garage-response.validation.js'

/**
 * The customer's side of the garage response deadline (0042), mounted at
 * /bookings: other garages to book when theirs did not accept in time. Only
 * the booking's own customer; for anyone else the booking does not exist.
 */
export const garageResponseRoutes = new Hono<{ Variables: TenantVariables }>()

garageResponseRoutes.get(
  '/:id/other-garages',
  authMiddleware,
  requireCustomer,
  zValidator('param', otherGaragesParamSchema),
  (c) => garageResponseController.otherGarages(c, c.req.valid('param').id)
)
