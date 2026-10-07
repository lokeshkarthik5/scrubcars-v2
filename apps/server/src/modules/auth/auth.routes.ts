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

// Refresh sits behind the global limiter only. It is not a guessing surface —
// it needs a valid HttpOnly cookie — and every open tab calls it whenever its
// access token lapses, so a household on one IP with a few tabs open could
// spend the strict 10-a-minute auth budget on refreshes alone and be logged
// out by its own browsers.
authRoutes.post('/refresh', authController.refresh)
authRoutes.post('/logout', rateLimiter, authController.logout)

authRoutes.get('/me', authMiddleware, authController.getMe)
authRoutes.get(
  '/me/customer',
  authMiddleware,
  requireCustomer,
  authController.getMeCustomer
)
// Every company the caller can act as, with the role they hold in each. This is
// what the in-page switcher reads, and what makes "which company am I acting
// as?" answerable at all.
authRoutes.get('/me/vendors', authMiddleware, authController.getMyVendors)

// Superseded by GET /auth/me/vendors, which returns every company the caller
// can act as. Kept working through resolveTenant so existing clients — which
// send no X-Vendor-Id and have exactly one seat — are unaffected.
authRoutes.get(
  '/me/vendor',
  authMiddleware,
  resolveTenant,
  authController.getMeVendor
)
