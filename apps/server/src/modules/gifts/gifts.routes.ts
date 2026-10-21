import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import { giftCodeRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as giftsController from './gifts.controller.js'
import {
  adminGiftListQuerySchema,
  buyGiftSchema,
  cancelGiftSchema,
  giftCodeSchema,
  giftIdParamSchema,
  verifyGiftSchema,
} from './gifts.validation.js'

/**
 * Gift a wash (0049). Off while GIFTS_ENABLED is not `on`: every route below
 * but the public `/config` is the same 404 as an unknown path, before auth
 * runs, so the apps ask `/config` whether to show gifts at all.
 *
 * A code always travels in the body (POST), never the URL of an API call:
 * request logs record paths. The gift page's own address carries it (that
 * is the link the buyer shares), but the page sends it here in the body.
 */
const giftsOn = notFoundUnless(() => env.giftsEnabled)

// ─── Public: /api/v1/gifts ───────────────────────────────────────────────────

export const publicGiftRoutes = new Hono<{ Variables: Partial<AuthVariables> }>()

publicGiftRoutes.get('/config', giftsController.getConfig)

// The gift page: anyone holding the code sees the card. Wrong codes are
// counted per network address (and per customer when signed in); a per-IP
// limiter of its own caps bursts on top.
publicGiftRoutes.post(
  '/lookup',
  giftsOn,
  giftCodeRateLimiter,
  optionalAuthMiddleware,
  zValidator('json', giftCodeSchema),
  (c) => giftsController.lookup(c, c.req.valid('json').code)
)

// ─── Customer: /api/v1/users/me/gifts ────────────────────────────────────────

/**
 * Mounted at /users/me/gifts (users.routes.ts), after that file's
 * authMiddleware + requireCustomer: a signed-in customer, acting only on
 * the gifts they bought (the session's id, never a parameter). Anyone
 * else's gift is a 404.
 */
export const customerGiftRoutes = new Hono<{ Variables: AuthVariables }>()

customerGiftRoutes.use('*', giftsOn)

customerGiftRoutes.get('/', giftsController.listMine)
customerGiftRoutes.post('/', zValidator('json', buyGiftSchema), (c) => giftsController.buy(c, c.req.valid('json')))
customerGiftRoutes.post('/redeem', giftCodeRateLimiter, zValidator('json', giftCodeSchema), (c) =>
  giftsController.redeem(c, c.req.valid('json').code)
)
customerGiftRoutes.get('/:id', zValidator('param', giftIdParamSchema), (c) =>
  giftsController.getMine(c, c.req.valid('param').id)
)
customerGiftRoutes.post(
  '/:id/verify',
  zValidator('param', giftIdParamSchema),
  zValidator('json', verifyGiftSchema),
  (c) => giftsController.verify(c, c.req.valid('param').id, c.req.valid('json'))
)
customerGiftRoutes.post('/:id/link', zValidator('param', giftIdParamSchema), (c) =>
  giftsController.issueLink(c, c.req.valid('param').id)
)

// ─── Admin: /api/v1/admin/gifts ──────────────────────────────────────────────

/** Super-admin only. Mounted at /admin/gifts (admin.routes.ts) for the admin cookie's path. */
export const adminGiftRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminGiftRoutes.get('/config', ...adminMiddleware, giftsController.getConfig)
adminGiftRoutes.get('/summary', giftsOn, ...adminMiddleware, giftsController.adminSummary)
adminGiftRoutes.get('/', giftsOn, ...adminMiddleware, zValidator('query', adminGiftListQuerySchema), (c) =>
  giftsController.adminList(c, c.req.valid('query').status)
)
adminGiftRoutes.post(
  '/:id/cancel',
  giftsOn,
  ...adminMiddleware,
  zValidator('param', giftIdParamSchema),
  zValidator('json', cancelGiftSchema),
  (c) => giftsController.adminCancel(c, c.req.valid('param').id, c.req.valid('json'))
)
