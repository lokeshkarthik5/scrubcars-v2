import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { isDocumentStorageConfigured } from '../../lib/document-storage.js'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
  adminSignedJson,
} from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as documentsController from './vendor-documents.controller.js'
import {
  adminDocumentParamSchema,
  adminFileParamSchema,
  adminSubmitDocumentSchema,
  documentUploadUrlSchema,
  fileParamSchema,
  reviewDocumentSchema,
  submitDocumentSchema,
  vendorIdParamSchema,
} from './vendor-documents.validation.js'

/**
 * Off while R2_DOCS_BUCKET is unset: every documents route below is the same
 * 404 as an unknown path, for everyone, before auth runs. The two config
 * routes stay, so the apps can ask whether to show the section at all.
 */
const documentsOn = notFoundUnless(isDocumentStorageConfigured)

// ─── The garage's own ────────────────────────────────────────────────────────

/**
 * Mounted at /vendors/me/documents (vendors.routes.ts). The owner seat only:
 * no requireVendorRole widening, so it is vendor_admin and an operator gets
 * a 403 (default deny), and the garage is always the tenant resolveTenant
 * produced. A customer has no seat and gets resolveTenant's 404.
 */
export const garageDocumentRoutes = new Hono<{ Variables: TenantVariables }>()

const ownerMiddleware = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

garageDocumentRoutes.get('/config', ...ownerMiddleware, documentsController.getGarageConfig)

garageDocumentRoutes.get('/', documentsOn, ...ownerMiddleware, documentsController.listGarageDocuments)

garageDocumentRoutes.post(
  '/upload-url',
  documentsOn,
  ...ownerMiddleware,
  zValidator('json', documentUploadUrlSchema),
  (c) => documentsController.createGarageUploadUrl(c, c.req.valid('json'))
)

garageDocumentRoutes.post(
  '/',
  documentsOn,
  ...ownerMiddleware,
  zValidator('json', submitDocumentSchema),
  (c) => documentsController.submitGarageDocument(c, c.req.valid('json'))
)

garageDocumentRoutes.get(
  '/:documentId/files/:fileId/link',
  documentsOn,
  ...ownerMiddleware,
  zValidator('param', fileParamSchema),
  (c) => {
    const { documentId, fileId } = c.req.valid('param')
    return documentsController.getGarageFileLink(c, documentId, fileId)
  }
)

// ─── Admin ───────────────────────────────────────────────────────────────────

/**
 * Mounted at /api/v1/admin/documents (admin.routes.ts), like Payouts: the
 * admin session cookie is scoped to /api/v1/admin. Super-admin only. Writes
 * on a garage in the Bin are 409 VENDOR_IN_BIN; reads still work.
 */
export const adminDocumentRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminDocumentRoutes.get('/config', ...adminMiddleware, documentsController.getAdminConfig)

adminDocumentRoutes.get(
  '/vendors/:vendorId',
  documentsOn,
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => documentsController.listAdminDocuments(c, c.req.valid('param').vendorId)
)

adminDocumentRoutes.post(
  '/vendors/:vendorId/upload-url',
  documentsOn,
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', documentUploadUrlSchema),
  (c) => documentsController.createAdminUploadUrl(c, c.req.valid('param').vendorId, c.req.valid('json'))
)

adminDocumentRoutes.post(
  '/vendors/:vendorId',
  documentsOn,
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(adminSubmitDocumentSchema),
  (c) => documentsController.submitAdminDocument(c, c.req.valid('param').vendorId, c.req.valid('json'))
)

adminDocumentRoutes.post(
  '/vendors/:vendorId/:documentId/review',
  documentsOn,
  ...adminMiddleware,
  zValidator('param', adminDocumentParamSchema),
  adminSignedJson(reviewDocumentSchema),
  (c) => {
    const { vendorId, documentId } = c.req.valid('param')
    return documentsController.reviewAdminDocument(c, vendorId, documentId, c.req.valid('json'))
  }
)

adminDocumentRoutes.get(
  '/vendors/:vendorId/:documentId/files/:fileId/link',
  documentsOn,
  ...adminMiddleware,
  zValidator('param', adminFileParamSchema),
  (c) => {
    const { vendorId, documentId, fileId } = c.req.valid('param')
    return documentsController.getAdminFileLink(c, vendorId, documentId, fileId)
  }
)
