import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as bookingIntentsController from './booking-intents.controller.js'
import { createBookingIntentSchema } from './booking-intents.validation.js'

export const bookingIntentsRoutes = new Hono<{ Variables: AuthVariables }>()

bookingIntentsRoutes.post(
  '/',
  authMiddleware,
  requireCustomer,
  zValidator('json', createBookingIntentSchema),
  (c) => bookingIntentsController.createIntent(c, c.req.valid('json'))
)
