import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as bookingIntentsController from './booking-intents.controller.js'
import {
  createBookingIntentSchema,
  intentIdParamSchema,
} from './booking-intents.validation.js'

export const bookingIntentsRoutes = new Hono<{ Variables: AuthVariables }>()

bookingIntentsRoutes.post(
  '/',
  authMiddleware,
  requireCustomer,
  zValidator('json', createBookingIntentSchema),
  (c) => bookingIntentsController.createIntent(c, c.req.valid('json'))
)

// Polled by checkout after a payment whose confirm call never came back, to
// learn whether the webhook has written the booking since.
bookingIntentsRoutes.get(
  '/:id',
  authMiddleware,
  requireCustomer,
  zValidator('param', intentIdParamSchema),
  (c) => bookingIntentsController.getIntentStatus(c, c.req.valid('param').id)
)
