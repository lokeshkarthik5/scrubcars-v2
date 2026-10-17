import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as statsController from './stats.controller.js'
import {
  statsFunnelQuerySchema,
  statsOverviewQuerySchema,
  statsRangeQuerySchema,
} from './stats.validation.js'

// The admin's Statistics: read-only figures over a range of IST days
// (?from=YYYY-MM-DD&to=YYYY-MM-DD, both included, at most 366 days), for
// every garage or one (?vendorId=). Mounted under /api/v1/admin/stats (see
// admin.routes.ts), beside the pilot numbers at /stats/pilot, like refunds:
// the admin session cookie is scoped to path=/api/v1/admin.
export const adminStatsRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

// The tiles, bookings per day and collected per week; ?compare=1 adds the
// period before.
adminStatsRoutes.get(
  '/overview',
  ...adminMiddleware,
  zValidator('query', statsOverviewQuerySchema),
  (c) => statsController.getOverview(c, c.req.valid('query'))
)

// The funnel, garages, service types and busy hours.
adminStatsRoutes.get(
  '/breakdown',
  ...adminMiddleware,
  zValidator('query', statsRangeQuerySchema),
  (c) => statsController.getBreakdown(c, c.req.valid('query'))
)

// Detlio's commission and each garage's free 25. Reporting only.
adminStatsRoutes.get(
  '/commission',
  ...adminMiddleware,
  zValidator('query', statsRangeQuerySchema),
  (c) => statsController.getCommission(c, c.req.valid('query'))
)

// The booking funnel from usage events (0040), garages by views against
// bookings, devices, and returning customers (from bookings).
adminStatsRoutes.get(
  '/funnel',
  ...adminMiddleware,
  zValidator('query', statsFunnelQuerySchema),
  (c) => statsController.getFunnel(c, c.req.valid('query'))
)
