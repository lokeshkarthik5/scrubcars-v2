import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as jobPhotosController from './job-photos.controller.js'
import {
  jobIdParamSchema,
  jobPhotoParamSchema,
  jobPhotoUploadUrlSchema,
  recordJobPhotoSchema,
} from './job-photos.validation.js'

/**
 * A job's before/after photos, mounted at /vendors/me/bookings so the company
 * is always the one resolveTenant produced.
 *
 * Widened to operators on purpose: the photos are taken by whoever does the
 * work, the same people who start and finish the job (see the job routes in
 * bookings.routes.ts). Nothing here touches money.
 */
export const jobPhotosRoutes = new Hono<{ Variables: TenantVariables }>()

const jobMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin', 'vendor_operator'),
] as const

jobPhotosRoutes.get(
  '/:id/photos',
  ...jobMiddleware,
  zValidator('param', jobIdParamSchema),
  (c) => jobPhotosController.listPhotos(c, c.req.valid('param').id)
)

jobPhotosRoutes.post(
  '/:id/photos/upload-url',
  ...jobMiddleware,
  zValidator('param', jobIdParamSchema),
  zValidator('json', jobPhotoUploadUrlSchema),
  (c) =>
    jobPhotosController.createUploadUrl(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)

jobPhotosRoutes.post(
  '/:id/photos',
  ...jobMiddleware,
  zValidator('param', jobIdParamSchema),
  zValidator('json', recordJobPhotoSchema),
  (c) =>
    jobPhotosController.recordPhoto(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)

jobPhotosRoutes.delete(
  '/:id/photos/:photoId',
  ...jobMiddleware,
  zValidator('param', jobPhotoParamSchema),
  (c) =>
    jobPhotosController.deletePhoto(
      c,
      c.req.valid('param').id,
      c.req.valid('param').photoId
    )
)
