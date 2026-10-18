import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as certificationController from './certification.controller.js'
import {
  certifySchema,
  recordCheckSchema,
  revokeSchema,
  vendorIdParamSchema,
} from './certification.validation.js'

// ─── The garage's own ────────────────────────────────────────────────────────

/**
 * Mounted at /vendors/me/certification (vendors.routes.ts). The owner seat
 * only: no widening, so it is vendor_admin and an operator gets a 403
 * (default deny); the garage is always the tenant resolveTenant produced. It
 * carries the garage's own numbers (rating, complaints, no-shows), never a
 * checker's name or a check's notes.
 */
export const garageCertificationRoutes = new Hono<{ Variables: TenantVariables }>()

garageCertificationRoutes.get(
  '/',
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin'),
  certificationController.getGarageCertification
)

// ─── Admin ───────────────────────────────────────────────────────────────────

/**
 * Mounted at /api/v1/admin/certification (admin.routes.ts), like Documents:
 * the admin session cookie is scoped to /api/v1/admin. Super-admin only.
 * Writes on a garage in the Bin are 409 VENDOR_IN_BIN; reads still work.
 */
export const adminCertificationRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminCertificationRoutes.get(
  '/vendors/:vendorId',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => certificationController.getAdminCertification(c, c.req.valid('param').vendorId)
)

adminCertificationRoutes.post(
  '/vendors/:vendorId/checks',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', recordCheckSchema),
  (c) => certificationController.recordCheck(c, c.req.valid('param').vendorId, c.req.valid('json'))
)

adminCertificationRoutes.post(
  '/vendors/:vendorId/certify',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', certifySchema),
  (c) => certificationController.certify(c, c.req.valid('param').vendorId, c.req.valid('json'))
)

adminCertificationRoutes.post(
  '/vendors/:vendorId/revoke',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', revokeSchema),
  (c) => certificationController.revoke(c, c.req.valid('param').vendorId, c.req.valid('json'))
)
