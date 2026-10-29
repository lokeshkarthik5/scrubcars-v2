import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as behaviourController from './behaviour.controller.js'
import { behaviourQuerySchema } from './behaviour.validation.js'

// Statistics → Behaviour (0061): where customers leave between the landing
// page and a paid booking. Read-only aggregates, super-admin only. Mounted
// at /api/v1/admin/stats/behaviour (admin.routes.ts), beside the other
// Statistics reads, for the admin cookie's path.
export const adminBehaviourRoutes = new Hono<{ Variables: AuthVariables }>()

adminBehaviourRoutes.get(
  '/',
  authMiddleware,
  requireSuperAdmin,
  zValidator('query', behaviourQuerySchema),
  (c) => behaviourController.getBehaviour(c, c.req.valid('query'))
)
