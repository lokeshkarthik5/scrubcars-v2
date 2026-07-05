import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
  requireVendor,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { rateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as authController from './auth.controller.js'
import { sendOtpSchema, verifyOtpSchema } from './auth.validation.js'

export const authRoutes = new Hono<{ Variables: AuthVariables }>()

authRoutes.post(
  '/otp/send',
  rateLimiter,
  zValidator('json', sendOtpSchema),
  (c) => authController.sendOtp(c, c.req.valid('json'))
)

authRoutes.post(
  '/otp/verify',
  rateLimiter,
  zValidator('json', verifyOtpSchema),
  (c) => authController.verifyOtp(c, c.req.valid('json'))
)

authRoutes.post('/refresh', rateLimiter, authController.refresh)
authRoutes.post('/logout', rateLimiter, authController.logout)

authRoutes.get('/me', authMiddleware, authController.getMe)
authRoutes.get(
  '/me/customer',
  authMiddleware,
  requireCustomer,
  authController.getMeCustomer
)
authRoutes.get(
  '/me/vendor',
  authMiddleware,
  requireVendor,
  authController.getMeVendor
)
