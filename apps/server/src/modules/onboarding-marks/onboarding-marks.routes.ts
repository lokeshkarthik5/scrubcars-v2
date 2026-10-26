import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './onboarding-marks.controller.js'
import {
  createMarkSchema,
  deleteMarkSchema,
  markAskedSchema,
  markParamSchema,
  updateMarkSchema,
  vendorIdParamSchema,
} from './onboarding-marks.validation.js'

/**
 * Onboarding marks (0059): the team's notes on what to ask a garage's owner
 * for, To ask → Asked → Received. Mounted at the root of /api/v1/admin
 * (admin.routes.ts), beside the other /vendors routes, because the admin
 * session cookie is scoped to that path. Super-admin only; every write is
 * signed with the session's name (adminSignedJson).
 */
export const adminOnboardingMarkRoutes = new Hono<{
  Variables: AuthVariables
}>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminOnboardingMarkRoutes.get(
  '/vendors/:id/marks',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => controller.list(c, c.req.valid('param').id)
)

// 409 MARK_EXISTS for a second open mark of the same missing key.
adminOnboardingMarkRoutes.post(
  '/vendors/:id/marks',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(createMarkSchema),
  (c) => controller.create(c, c.req.valid('param').id, c.req.valid('json'))
)

adminOnboardingMarkRoutes.patch(
  '/vendors/:id/marks/:markId',
  ...adminMiddleware,
  zValidator('param', markParamSchema),
  adminSignedJson(updateMarkSchema),
  (c) =>
    controller.update(
      c,
      c.req.valid('param').id,
      c.req.valid('param').markId,
      c.req.valid('json')
    )
)

adminOnboardingMarkRoutes.delete(
  '/vendors/:id/marks/:markId',
  ...adminMiddleware,
  zValidator('param', markParamSchema),
  adminSignedJson(deleteMarkSchema),
  (c) =>
    controller.remove(c, c.req.valid('param').id, c.req.valid('param').markId)
)

// "Mark these as Asked today", after Ask on WhatsApp: at most 50 garages.
adminOnboardingMarkRoutes.post(
  '/onboarding-marks/asked',
  ...adminMiddleware,
  adminSignedJson(markAskedSchema),
  (c) => controller.markAsked(c, c.req.valid('json'))
)
