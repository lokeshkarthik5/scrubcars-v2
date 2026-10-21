import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as bypassController from './bypass-reports.controller.js'
import {
  bookingIdParamSchema,
  confirmBypassReportSchema,
  createBypassReportSchema,
  dismissBypassReportSchema,
  listBypassReportsQuerySchema,
  reportIdParamSchema,
  vendorIdParamSchema,
} from './bypass-reports.validation.js'

// ─── The customer's ──────────────────────────────────────────────────────────

/**
 * "Did the garage ask you to book directly?" (0052): the customer's own
 * reports, at /users/me/bypass-reports. Mounted inside the users routes
 * (users.routes.ts), which already require a signed-in customer; the user is
 * always the session's, never a parameter. There is deliberately no garage
 * route anywhere: a garage never reads a report, or learns who made one.
 */
export const customerBypassReportRoutes = new Hono<{ Variables: AuthVariables }>()

customerBypassReportRoutes.get('/bypass-reports', bypassController.listMyReports)

customerBypassReportRoutes.post('/bypass-reports', zValidator('json', createBypassReportSchema), (c) =>
  bypassController.createReport(c, c.req.valid('json'))
)

customerBypassReportRoutes.get(
  '/bypass-reports/bookings/:bookingId',
  zValidator('param', bookingIdParamSchema),
  (c) => bypassController.getBookingStatus(c, c.req.valid('param').bookingId)
)

// ─── Admin ───────────────────────────────────────────────────────────────────

/**
 * Mounted at /api/v1/admin/bypass-reports (admin.routes.ts), like
 * Complaints: the admin session cookie is scoped to /api/v1/admin.
 * Super-admin only. Reports are never deleted: confirmed or dismissed, kept.
 */
export const adminBypassReportRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminBypassReportRoutes.get(
  '/',
  ...adminMiddleware,
  zValidator('query', listBypassReportsQuerySchema),
  (c) => bypassController.listReports(c, c.req.valid('query'))
)

// Before '/:id', which would otherwise take these for an id.
adminBypassReportRoutes.get('/drop-off', ...adminMiddleware, bypassController.getDropOff)

adminBypassReportRoutes.get(
  '/vendors/:vendorId',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => bypassController.getGarageStrikes(c, c.req.valid('param').vendorId)
)

adminBypassReportRoutes.get(
  '/:id',
  ...adminMiddleware,
  zValidator('param', reportIdParamSchema),
  (c) => bypassController.getReport(c, c.req.valid('param').id)
)

adminBypassReportRoutes.post(
  '/:id/confirm',
  ...adminMiddleware,
  zValidator('param', reportIdParamSchema),
  zValidator('json', confirmBypassReportSchema),
  (c) => bypassController.confirmReport(c, c.req.valid('param').id, c.req.valid('json'))
)

adminBypassReportRoutes.post(
  '/:id/dismiss',
  ...adminMiddleware,
  zValidator('param', reportIdParamSchema),
  zValidator('json', dismissBypassReportSchema),
  (c) => bypassController.dismissReport(c, c.req.valid('param').id, c.req.valid('json'))
)
