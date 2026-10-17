import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { aiDescribeRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as aiController from './ai.controller.js'
import { describeServiceSchema } from './ai.validation.js'

// AI helpers for the admin panel. Mounted at the root of /api/v1/admin (see
// admin.routes.ts) for the same cookie reason as discounts: the admin session
// cookie is scoped to path=/api/v1/admin. Super-admin only, like everything
// else there.
export const adminAiRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

// Which helpers are switched on, so the panel can hide the buttons rather
// than show ones that can only fail.
adminAiRoutes.get('/ai/config', ...adminMiddleware, aiController.getConfig)

// A description for one service, written from its name, category, pricing
// and duration. Rate limited per admin: each call is a paid request.
adminAiRoutes.post(
  '/services/describe',
  ...adminMiddleware,
  aiDescribeRateLimiter,
  zValidator('json', describeServiceSchema),
  (c) => aiController.describeService(c, c.req.valid('json'))
)
