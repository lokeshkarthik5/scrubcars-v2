import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import { reachWriteRateLimiter, repairQuoteAiRateLimiter } from '../../middleware/rate-limit.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as controller from './repair-quotes.controller.js'
import {
  adminListQuerySchema,
  adminSettingSchema,
  answerSchema,
  bookVisitSchema,
  briefSchema,
  createRequestSchema,
  garageListQuerySchema,
  quoteIdParamSchema,
  quoteParamsSchema,
  requestIdParamSchema,
  uploadUrlSchema,
  vendorIdParamSchema,
} from './repair-quotes.validation.js'

/**
 * Repair & bodywork quotes (0076; lib/repair-quotes.ts). Off while
 * REPAIR_QUOTES_ENABLED is not `on`: every route below but the public
 * `/config` is the same 404 as an unknown path, so the apps ask `/config`
 * whether to show it at all.
 */
const repairQuotesOn = notFoundUnless(() => env.repairQuotesEnabled)

// ─── Public: /api/v1/repair-quotes ───────────────────────────────────────────

export const publicRepairQuoteRoutes = new Hono()

publicRepairQuoteRoutes.get('/config', controller.config)

// ─── Customer: /api/v1/users/me/repair-quotes ────────────────────────────────

/**
 * Mounted at /users/me/repair-quotes (users.routes.ts), after that file's
 * authMiddleware + requireCustomer: the session's own requests only; anyone
 * else's is a 404. Sending is rate limited with the other customer reach
 * writes, the AI brief on its own allowance.
 */
export const customerRepairQuoteRoutes = new Hono<{ Variables: AuthVariables }>()

customerRepairQuoteRoutes.use('*', repairQuotesOn)

customerRepairQuoteRoutes.post('/upload-url', zValidator('json', uploadUrlSchema), (c) =>
  controller.uploadUrl(c, c.req.valid('json'))
)
customerRepairQuoteRoutes.post('/brief', repairQuoteAiRateLimiter, zValidator('json', briefSchema), (c) =>
  controller.brief(c, c.req.valid('json'))
)
customerRepairQuoteRoutes.get('/', controller.listMine)
customerRepairQuoteRoutes.post('/', reachWriteRateLimiter, zValidator('json', createRequestSchema), (c) =>
  controller.create(c, c.req.valid('json'))
)
customerRepairQuoteRoutes.get('/:id', zValidator('param', requestIdParamSchema), (c) =>
  controller.getMine(c, c.req.valid('param').id)
)
customerRepairQuoteRoutes.post('/:id/cancel', zValidator('param', requestIdParamSchema), (c) =>
  controller.cancelMine(c, c.req.valid('param').id)
)
customerRepairQuoteRoutes.get('/:id/quotes/:quoteId/next-free', zValidator('param', quoteParamsSchema), (c) => {
  const { id, quoteId } = c.req.valid('param')
  return controller.nextFree(c, id, quoteId)
})
customerRepairQuoteRoutes.post(
  '/:id/quotes/:quoteId/book',
  zValidator('param', quoteParamsSchema),
  zValidator('json', bookVisitSchema),
  (c) => {
    const { id, quoteId } = c.req.valid('param')
    return controller.book(c, id, quoteId, c.req.valid('json').scheduledAt)
  }
)

// ─── Garage: /api/v1/vendors/me/repair-quotes ────────────────────────────────

/**
 * Mounted at /vendors/me/repair-quotes (vendors.routes.ts). Widened to
 * operators on purpose, like visit requests: the people at the counter see
 * a request come in and answer it. The garage is always the tenant
 * resolveTenant produced; another garage's quote is a 404. The customer's
 * name and phone are never in these payloads (only a booked visit carries
 * them, in its contact window).
 */
export const garageRepairQuoteRoutes = new Hono<{ Variables: TenantVariables }>()

const seat = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin', 'vendor_operator')] as const

garageRepairQuoteRoutes.use('*', repairQuotesOn)

garageRepairQuoteRoutes.get('/', ...seat, zValidator('query', garageListQuerySchema), (c) =>
  controller.listForGarage(c, c.req.valid('query').scope)
)
garageRepairQuoteRoutes.get('/count', ...seat, controller.waitingCount)
garageRepairQuoteRoutes.post(
  '/:quoteId/answer',
  ...seat,
  zValidator('param', quoteIdParamSchema),
  zValidator('json', answerSchema),
  (c) => controller.answer(c, c.req.valid('param').quoteId, c.req.valid('json'))
)

// ─── Admin: /api/v1/admin/repair-quotes ──────────────────────────────────────

/**
 * Mounted at /admin/repair-quotes (admin.routes.ts). Super-admin only.
 *
 *   GET /                ?filter=all|open|booked|no_quote|expired
 *   GET /vendors/:id     the garage editor's card: its switch and numbers
 *   PUT /vendors/:id     { enabled } (signed)
 */
export const adminRepairQuoteRoutes = new Hono<{ Variables: AuthVariables }>()

const admin = [authMiddleware, requireSuperAdmin] as const

adminRepairQuoteRoutes.use('*', repairQuotesOn)

adminRepairQuoteRoutes.get('/', ...admin, zValidator('query', adminListQuerySchema), (c) =>
  controller.listForAdmin(c, c.req.valid('query'))
)
adminRepairQuoteRoutes.get('/vendors/:id', ...admin, zValidator('param', vendorIdParamSchema), (c) =>
  controller.garageSetting(c, c.req.valid('param').id)
)
adminRepairQuoteRoutes.put(
  '/vendors/:id',
  ...admin,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(adminSettingSchema),
  (c) => controller.setGarageSetting(c, c.req.valid('param').id, c.req.valid('json').enabled)
)
