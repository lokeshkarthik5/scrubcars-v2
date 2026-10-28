import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware, type AuthVariables } from '../../middleware/auth.middleware.js'
import { reachWriteRateLimiter } from '../../middleware/rate-limit.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as controller from './booking-requests.controller.js'
import {
  acceptRequestSchema,
  createRequestSchema,
  garageRequestsQuerySchema,
  requestIdParamSchema,
  windowsQuerySchema,
} from './booking-requests.validation.js'

/**
 * "Request a visit" / "Request a pickup" (customer reach, part 2, 0062;
 * lib/booking-requests.ts).
 */

// ─── Public: /api/v1/booking-requests ────────────────────────────────────────

/** The windows a garage can be asked for: the sheet shows them before sign-in. */
export const publicBookingRequestRoutes = new Hono()

publicBookingRequestRoutes.get('/windows', zValidator('query', windowsQuerySchema), (c) =>
  controller.windows(c, c.req.valid('query'))
)

// ─── Customer: /api/v1/users/me/requests ─────────────────────────────────────

/**
 * Mounted at /users/me/requests (users.routes.ts), after that file's
 * authMiddleware + requireCustomer: the session's own requests only, anyone
 * else's a 404. Sending is rate limited per customer per hour.
 */
export const customerBookingRequestRoutes = new Hono<{ Variables: AuthVariables }>()

customerBookingRequestRoutes.get('/', controller.listMine)
customerBookingRequestRoutes.post('/', reachWriteRateLimiter, zValidator('json', createRequestSchema), (c) =>
  controller.create(c, c.req.valid('json'))
)
customerBookingRequestRoutes.get('/:id', zValidator('param', requestIdParamSchema), (c) =>
  controller.getMine(c, c.req.valid('param').id)
)
customerBookingRequestRoutes.post('/:id/cancel', zValidator('param', requestIdParamSchema), (c) =>
  controller.cancelMine(c, c.req.valid('param').id)
)

// ─── Garage: /api/v1/vendors/me/requests ─────────────────────────────────────

/**
 * Mounted at /vendors/me/requests (vendors.routes.ts). Widened to operators
 * here on purpose: the people at the counter see a request come in and can
 * answer it, like a new booking. What it earns is the owner's alone (the
 * controller leaves it out for an operator). A Detlio support session may
 * answer too: the team phones a garage that has not answered and can say
 * yes for it. The garage is always the tenant resolveTenant produced;
 * another garage's request is a 404.
 */
export const garageBookingRequestRoutes = new Hono<{ Variables: TenantVariables }>()

const seat = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin', 'vendor_operator')] as const

garageBookingRequestRoutes.get('/', ...seat, zValidator('query', garageRequestsQuerySchema), (c) =>
  controller.listForGarage(c, c.req.valid('query'))
)
garageBookingRequestRoutes.get('/count', ...seat, controller.waitingCount)
garageBookingRequestRoutes.get('/:id/start-times', ...seat, zValidator('param', requestIdParamSchema), (c) =>
  controller.startTimes(c, c.req.valid('param').id)
)
garageBookingRequestRoutes.post(
  '/:id/accept',
  ...seat,
  zValidator('param', requestIdParamSchema),
  zValidator('json', acceptRequestSchema),
  (c) => controller.accept(c, c.req.valid('param').id, c.req.valid('json'))
)
garageBookingRequestRoutes.post('/:id/decline', ...seat, zValidator('param', requestIdParamSchema), (c) =>
  controller.decline(c, c.req.valid('param').id)
)
