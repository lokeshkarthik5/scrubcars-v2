import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { telegramTestRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as alertsController from './alerts.controller.js'
import { telegramTestSchema } from './alerts.validation.js'

/**
 * Admin → Alerts: is the team's Telegram set up, and a button that posts a
 * test message to it. Mounted at /api/v1/admin/alerts (admin.routes.ts) for
 * the admin cookie's path. Super-admin only; the test is rate limited per
 * admin per hour, since it posts to the real team chat.
 */
export const adminAlertRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminAlertRoutes.get('/telegram', ...adminMiddleware, alertsController.getTelegramStatus)

adminAlertRoutes.post(
  '/telegram/test',
  ...adminMiddleware,
  telegramTestRateLimiter,
  zValidator('json', telegramTestSchema),
  (c) => alertsController.sendTelegramTest(c, c.req.valid('json'))
)
