import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as paymentsController from './payments.controller.js'
import {
  createOrderSchema,
  verifyPaymentSchema,
} from './payments.validation.js'

export const paymentsRoutes = new Hono<{ Variables: AuthVariables }>()

paymentsRoutes.post('/webhook', paymentsController.handleWebhook)

paymentsRoutes.use('*', authMiddleware, requireCustomer)

paymentsRoutes.post(
  '/orders',
  zValidator('json', createOrderSchema),
  (c) => paymentsController.createOrder(c, c.req.valid('json').bookingId)
)

paymentsRoutes.post(
  '/verify',
  zValidator('json', verifyPaymentSchema),
  (c) => paymentsController.verifyPayment(c, c.req.valid('json'))
)
