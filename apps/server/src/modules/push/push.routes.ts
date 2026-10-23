import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { isPushEnabled } from '../../lib/env.js'
import { authMiddleware, type AuthVariables } from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as pushController from './push.controller.js'
import { endpointSchema, preferencesSchema, subscribeSchema } from './push.validation.js'

/**
 * Browser notifications (0044). Off while VAPID is unset: every route below
 * but `/config` is the same 404 as an unknown path, before auth runs, so
 * the apps ask `/config` whether to offer notifications at all.
 *
 * An endpoint travels in the body (POST), never the URL: it identifies a
 * device, and request logs record paths.
 */
const pushOn = notFoundUnless(isPushEnabled)

// ─── Customer ────────────────────────────────────────────────────────────────

/**
 * Mounted at /users/me/push (users.routes.ts), after that file's
 * authMiddleware + requireCustomer: a signed-in customer, acting only on
 * their own subscriptions (the session's id, never a parameter).
 */
export const customerPushRoutes = new Hono<{ Variables: AuthVariables }>()

customerPushRoutes.get('/config', pushController.getCustomerConfig)

customerPushRoutes.post('/subscriptions', pushOn, zValidator('json', subscribeSchema), (c) =>
  pushController.subscribeCustomer(c, c.req.valid('json'))
)
customerPushRoutes.post('/unsubscribe', pushOn, zValidator('json', endpointSchema), (c) =>
  pushController.unsubscribeCustomer(c, c.req.valid('json'))
)
customerPushRoutes.post('/status', pushOn, zValidator('json', endpointSchema), (c) =>
  pushController.customerStatus(c, c.req.valid('json'))
)
customerPushRoutes.patch('/preferences', pushOn, zValidator('json', preferencesSchema), (c) =>
  pushController.setCustomerPreferences(c, c.req.valid('json'))
)
customerPushRoutes.post('/test', pushOn, zValidator('json', endpointSchema), (c) =>
  pushController.testCustomer(c, c.req.valid('json'))
)

// ─── Garage seats ────────────────────────────────────────────────────────────

/**
 * Mounted at /vendors/me/push (vendors.routes.ts). Deliberately widened to
 * operators: the people at the counter are the ones who need to hear about
 * a new booking. The garage is always the tenant resolveTenant produced; a
 * customer has no seat and gets its 404.
 */
export const garagePushRoutes = new Hono<{ Variables: TenantVariables }>()

const seatMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin', 'vendor_operator'),
] as const

garagePushRoutes.get('/config', ...seatMiddleware, pushController.getGarageConfig)

garagePushRoutes.post('/subscriptions', pushOn, ...seatMiddleware, zValidator('json', subscribeSchema), (c) =>
  pushController.subscribeGarage(c, c.req.valid('json'))
)
garagePushRoutes.post('/unsubscribe', pushOn, ...seatMiddleware, zValidator('json', endpointSchema), (c) =>
  pushController.unsubscribeGarage(c, c.req.valid('json'))
)
garagePushRoutes.post('/status', pushOn, ...seatMiddleware, zValidator('json', endpointSchema), (c) =>
  pushController.garageStatus(c, c.req.valid('json'))
)
garagePushRoutes.post('/test', pushOn, ...seatMiddleware, zValidator('json', endpointSchema), (c) =>
  pushController.testGarage(c, c.req.valid('json'))
)
