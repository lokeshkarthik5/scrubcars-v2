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
import * as shineController from './shine-score.controller.js'
import {
  bookingIdParamSchema,
  checkIdParamSchema,
  createScanSchema,
  listChecksQuerySchema,
  reviewCheckSchema,
  scanIdParamSchema,
  suggestionsQuerySchema,
} from './shine-score.validation.js'

/**
 * Shine Score (0075). Off while SHINE_SCORE_ENABLED is not `on`: every route
 * below but the public `/config` is the same 404 as an unknown path, before
 * auth runs, so the apps ask `/config` whether to show it at all.
 */
const shineOn = notFoundUnless(() => env.shineScoreEnabled)

// ─── Public: /api/v1/shine ───────────────────────────────────────────────────

export const publicShineRoutes = new Hono()

publicShineRoutes.get('/config', shineController.getConfig)

// ─── Customer: /api/v1/users/me/shine ────────────────────────────────────────

/**
 * Mounted at /users/me/shine (users.routes.ts), after that file's
 * authMiddleware + requireCustomer: signed in to scan (owner's note 1). The
 * user is always the session's; anyone else's scan or booking is a 404.
 */
export const customerShineRoutes = new Hono<{ Variables: AuthVariables }>()

customerShineRoutes.use('*', shineOn)

customerShineRoutes.get('/', shineController.getStatus)

customerShineRoutes.post('/scans', zValidator('json', createScanSchema), (c) =>
  shineController.createScan(c, c.req.valid('json'))
)

customerShineRoutes.get('/scans/:scanId', zValidator('param', scanIdParamSchema), (c) =>
  shineController.getScan(c, c.req.valid('param').scanId)
)

customerShineRoutes.get('/suggestions', zValidator('query', suggestionsQuerySchema), (c) =>
  shineController.getSuggestions(c, c.req.valid('query'))
)

customerShineRoutes.get('/bookings/:bookingId', zValidator('param', bookingIdParamSchema), (c) =>
  shineController.getForBooking(c, c.req.valid('param').bookingId)
)

// ─── Admin: /api/v1/admin/shine-checks ───────────────────────────────────────

/**
 * Issues → Shine checks: finished jobs whose after-photos scored under 60,
 * for a person to look at. Super-admin only. Marking one never touches the
 * garage: the team acts (a call, a complaint) through the usual tools.
 */
export const adminShineRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [shineOn, authMiddleware, requireSuperAdmin] as const

adminShineRoutes.get('/', ...adminMiddleware, zValidator('query', listChecksQuerySchema), (c) =>
  shineController.listChecks(c, c.req.valid('query'))
)

adminShineRoutes.post(
  '/:id/review',
  ...adminMiddleware,
  zValidator('param', checkIdParamSchema),
  adminSignedJson(reviewCheckSchema),
  (c) => shineController.reviewCheck(c, c.req.valid('param').id, c.req.valid('json'))
)
