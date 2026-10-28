import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as agreementsController from './agreements.controller.js'
import { acceptAgreementSchema, agreementUploadUrlSchema, publishAgreementSchema } from './agreements.validation.js'

// ─── The garage's own ────────────────────────────────────────────────────────

/**
 * Mounted at /vendors/me/agreement (vendors.routes.ts). The owner seat only:
 * no widening, so it is vendor_admin and an operator gets a 403 (default
 * deny); the garage is always the tenant resolveTenant produced. A Detlio
 * support session can read it but never accept it (403 AGREEMENT_GARAGE_ONLY).
 */
export const garageAgreementRoutes = new Hono<{ Variables: TenantVariables }>()

garageAgreementRoutes.get(
  '/',
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin'),
  agreementsController.getGarageAgreement
)

garageAgreementRoutes.post(
  '/accept',
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin'),
  zValidator('json', acceptAgreementSchema),
  (c) => agreementsController.acceptAgreement(c, c.req.valid('json'))
)

// ─── Admin ───────────────────────────────────────────────────────────────────

/**
 * Mounted at /api/v1/admin/agreements (admin.routes.ts), like Documents: the
 * admin session cookie is scoped to /api/v1/admin. Super-admin only.
 */
export const adminAgreementRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminAgreementRoutes.get('/', ...adminMiddleware, agreementsController.listAgreements)

adminAgreementRoutes.post(
  '/upload-url',
  ...adminMiddleware,
  zValidator('json', agreementUploadUrlSchema),
  (c) => agreementsController.createAgreementUploadUrl(c, c.req.valid('json'))
)

adminAgreementRoutes.post(
  '/',
  ...adminMiddleware,
  adminSignedJson(publishAgreementSchema),
  (c) => agreementsController.publishAgreement(c, c.req.valid('json'))
)
