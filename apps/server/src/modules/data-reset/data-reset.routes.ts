import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
  adminSignedJson,
} from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import * as dataResetController from './data-reset.controller.js'
import { executeSchema, previewSchema } from './data-reset.validation.js'

// "Start pilot clean": deleting test bookings, refunds and checkouts, after a
// dry run. Mounted under /api/v1/admin/data-reset (see admin.routes.ts), like
// refunds: the admin session cookie is scoped to path=/api/v1/admin.
//
// Behind ADMIN_DATA_RESET. Off (the default) and every route here is a 404
// for everyone, signed in or not, before any auth runs; see
// docs/test-data-reset.md for when it is turned on.
export const adminDataResetRoutes = new Hono<{ Variables: AuthVariables }>()

adminDataResetRoutes.use('*', notFoundUnless(() => env.adminDataReset))

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

// The admin nav asks this to decide whether to show the page at all.
adminDataResetRoutes.get('/config', ...adminMiddleware, dataResetController.getConfig)

// The dry run. POST because it carries a scope and a ticked list, and
// because it records what Razorpay says about old payments; it deletes
// nothing.
adminDataResetRoutes.post(
  '/preview',
  ...adminMiddleware,
  zValidator('json', previewSchema),
  (c) => dataResetController.preview(c, c.req.valid('json'))
)

adminDataResetRoutes.post(
  '/execute',
  ...adminMiddleware,
  adminSignedJson(executeSchema),
  (c) => dataResetController.execute(c, c.req.valid('json'))
)
