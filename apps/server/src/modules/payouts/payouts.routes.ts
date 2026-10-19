import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
  adminSignedJson,
} from '../../middleware/auth.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as payoutsController from './payouts.controller.js'
import {
  earningsStatementQuerySchema,
  payoutAccountSchema,
  recordPayoutSchema,
  vendorIdParamSchema,
} from './payouts.validation.js'

// ─── The garage's own ────────────────────────────────────────────────────────

// GET /vendors/me/earnings/statement: the garage's Earnings statement. Mounted
// at /vendors/me/earnings inside the vendor routes (vendors.routes.ts), like
// the team screen. Money, so vendor_admin only, like GET /me/earnings: an
// operator gets a 403 and never sees a figure. The garage is the tenant.
export const vendorEarningsRoutes = new Hono<{ Variables: TenantVariables }>()

const ownerMiddleware = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

vendorEarningsRoutes.get(
  '/statement',
  ...ownerMiddleware,
  zValidator('query', earningsStatementQuerySchema),
  (c) => payoutsController.getStatement(c, c.req.valid('query'))
)

// ─── Admin ───────────────────────────────────────────────────────────────────

// The Payouts page. Mounted under /api/v1/admin/payouts (admin.routes.ts),
// like refunds: the admin session cookie is scoped to path=/api/v1/admin.
// Super-admin only. There is no edit or delete: a payout is money that has
// left Detlio's bank, and every statement it is on must keep saying so.
export const adminPayoutRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminPayoutRoutes.get('/', ...adminMiddleware, payoutsController.listPayouts)

adminPayoutRoutes.get(
  '/vendors/:vendorId',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => payoutsController.getGaragePayouts(c, c.req.valid('param').vendorId)
)

adminPayoutRoutes.post(
  '/vendors/:vendorId',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(recordPayoutSchema),
  (c) => payoutsController.recordPayout(c, c.req.valid('param').vendorId, c.req.valid('json'))
)

// The garage's payout details: bank account and/or UPI id. In full: these
// are only for the garage's own pages in admin; the list masks them.
adminPayoutRoutes.get(
  '/vendors/:vendorId/account',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => payoutsController.getPayoutAccount(c, c.req.valid('param').vendorId)
)

adminPayoutRoutes.put(
  '/vendors/:vendorId/account',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(payoutAccountSchema),
  (c) => payoutsController.savePayoutAccount(c, c.req.valid('param').vendorId, c.req.valid('json'))
)

adminPayoutRoutes.delete(
  '/vendors/:vendorId/account',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => payoutsController.removePayoutAccount(c, c.req.valid('param').vendorId)
)
