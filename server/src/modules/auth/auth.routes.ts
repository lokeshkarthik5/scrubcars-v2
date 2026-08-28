import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
} from '../../middleware/auth.middleware.js'
import {
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { rateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as authController from './auth.controller.js'
import { sendOtpSchema, verifyOtpSchema } from './auth.validation.js'

export const authRoutes = new Hono<{ Variables: TenantVariables }>()

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
// Superseded by GET /auth/me/vendors, which returns every company the caller
// can act as. Kept working through resolveTenant so existing clients — which
// send no X-Vendor-Id and have exactly one seat — are unaffected.
authRoutes.get(
  '/me/vendor',
  authMiddleware,
  resolveTenant,
  authController.getMeVendor
)
