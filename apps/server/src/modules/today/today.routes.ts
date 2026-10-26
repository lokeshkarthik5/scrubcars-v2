import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as todayController from './today.controller.js'
import { todayQuerySchema } from './today.validation.js'

/**
 * GET /admin/today: the ops inbox and the menu's counts. Read-only; every
 * task links to the page where it is acted on.
 */
export const adminTodayRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminTodayRoutes.get(
  '/',
  ...adminMiddleware,
  zValidator('query', todayQuerySchema),
  (c) => todayController.getToday(c)
)
