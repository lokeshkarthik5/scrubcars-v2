import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as controller from './luxury.controller.js'
import {
  approveSchema,
  editBrandsSchema,
  luxuryPhotoUploadSchema,
  noteDecisionSchema,
  sendApplicationSchema,
  vendorIdParamSchema,
} from './luxury.validation.js'

/**
 * Luxury car specialists (0083), the garage's own. Mounted at
 * /vendors/me/luxury (vendors.routes.ts). The owner seat only: no widening,
 * so it is vendor_admin and an operator gets a 403 (default deny); the
 * garage is always the tenant resolveTenant produced.
 *
 *   GET  /                    its tier, its application and the team's answer, the badge
 *   POST /photos/upload-url   a presigned PUT for one past-job photo (vendors/<id>/luxury/)
 *   PUT  /                    send the application, or edit it while under review
 */
export const garageLuxuryRoutes = new Hono<{ Variables: TenantVariables }>()

const garageMiddleware = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

garageLuxuryRoutes.get('/', ...garageMiddleware, controller.getGarageLuxury)

garageLuxuryRoutes.post('/photos/upload-url', ...garageMiddleware, zValidator('json', luxuryPhotoUploadSchema), (c) =>
  controller.createPhotoUploadUrl(c, c.req.valid('json'))
)

garageLuxuryRoutes.put('/', ...garageMiddleware, zValidator('json', sendApplicationSchema), (c) =>
  controller.sendApplication(c, c.req.valid('json'))
)

/**
 * The team's side. Mounted at /api/v1/admin/luxury (admin.routes.ts).
 * Super-admin only; every write is signed with the session's name and
 * leaves an admin_audit_log row (luxury_approved, luxury_asked_for_more,
 * luxury_declined, luxury_badge_removed, luxury_brands_edited).
 *
 *   GET   /vendors/:vendorId              the application, the badge, the tier
 *   POST  /vendors/:vendorId/approve      the badge shows at once
 *   POST  /vendors/:vendorId/ask-more     { note }
 *   POST  /vendors/:vendorId/decline      { note }
 *   POST  /vendors/:vendorId/remove       { note }: Remove badge
 *   PATCH /vendors/:vendorId/brands       { brands }: what customers see
 */
export const adminLuxuryRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const
const idParam = zValidator('param', vendorIdParamSchema)

adminLuxuryRoutes.get('/vendors/:vendorId', ...adminMiddleware, idParam, (c) =>
  controller.getAdminLuxury(c, c.req.valid('param').vendorId)
)

adminLuxuryRoutes.post('/vendors/:vendorId/approve', ...adminMiddleware, idParam, adminSignedJson(approveSchema), (c) =>
  controller.decide(c, c.req.valid('param').vendorId, 'approve', c.req.valid('json'))
)

adminLuxuryRoutes.post('/vendors/:vendorId/ask-more', ...adminMiddleware, idParam, adminSignedJson(noteDecisionSchema), (c) =>
  controller.decide(c, c.req.valid('param').vendorId, 'more', c.req.valid('json'))
)

adminLuxuryRoutes.post('/vendors/:vendorId/decline', ...adminMiddleware, idParam, adminSignedJson(noteDecisionSchema), (c) =>
  controller.decide(c, c.req.valid('param').vendorId, 'decline', c.req.valid('json'))
)

adminLuxuryRoutes.post('/vendors/:vendorId/remove', ...adminMiddleware, idParam, adminSignedJson(noteDecisionSchema), (c) =>
  controller.decide(c, c.req.valid('param').vendorId, 'remove', c.req.valid('json'))
)

adminLuxuryRoutes.patch('/vendors/:vendorId/brands', ...adminMiddleware, idParam, adminSignedJson(editBrandsSchema), (c) =>
  controller.editBrands(c, c.req.valid('param').vendorId, c.req.valid('json'))
)
