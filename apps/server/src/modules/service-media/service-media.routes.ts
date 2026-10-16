import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import { isAiPicturesEnabled } from '../../lib/ai-images.js'
import { isStreamEnabled } from '../../lib/stream.js'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as serviceMediaController from './service-media.controller.js'
import {
  adminMediaParamSchema,
  adminServiceParamSchema,
  aiPicturesSchema,
  garageMediaParamSchema,
  garageServiceParamSchema,
  startVideoSchema,
  useAiPictureSchema,
} from './service-media.validation.js'

// Photos keep their routes in the vendors and admin modules
// (/services/:id/images…), which call into this module; what is new lives
// here: video, the upload block's config, AI pictures and Stream's webhook.

// ─── Garage app: mounted at /vendors/me ─────────────────────────────────────
//
// vendor_admin only, like the service image routes beside them: the
// catalogue and its media are the owner's and admins' to change.
export const garageMediaRoutes = new Hono<{ Variables: TenantVariables }>()

const garageMiddleware = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

garageMediaRoutes.get('/media-config', ...garageMiddleware, serviceMediaController.getGarageConfig)

// Video routes do not exist while Stream is not set up.
garageMediaRoutes.post(
  '/services/:id/videos',
  notFoundUnless(isStreamEnabled),
  ...garageMiddleware,
  zValidator('param', garageServiceParamSchema),
  zValidator('json', startVideoSchema),
  (c) =>
    serviceMediaController.startGarageVideo(c, c.req.valid('param').id, c.req.valid('json'))
)
garageMediaRoutes.get(
  '/services/:id/media/:mediaId',
  ...garageMiddleware,
  zValidator('param', garageMediaParamSchema),
  (c) =>
    serviceMediaController.getGarageMedia(
      c,
      c.req.valid('param').id,
      c.req.valid('param').mediaId
    )
)

// ─── Admin: mounted at /admin ────────────────────────────────────────────────
//
// Under /api/v1/admin because the admin session cookie is scoped to that path.
export const adminMediaRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminMediaRoutes.get('/media-config', ...adminMiddleware, serviceMediaController.getAdminConfig)
// Asked by the edit page to decide whether to show "Make a picture with AI".
adminMediaRoutes.get('/ai/config', ...adminMiddleware, serviceMediaController.getAiConfig)

adminMediaRoutes.post(
  '/services/:serviceId/videos',
  notFoundUnless(isStreamEnabled),
  ...adminMiddleware,
  zValidator('param', adminServiceParamSchema),
  zValidator('json', startVideoSchema),
  (c) =>
    serviceMediaController.startAdminVideo(
      c,
      c.req.valid('param').serviceId,
      c.req.valid('json')
    )
)
adminMediaRoutes.get(
  '/services/:serviceId/media/:mediaId',
  ...adminMiddleware,
  zValidator('param', adminMediaParamSchema),
  (c) =>
    serviceMediaController.getAdminMedia(
      c,
      c.req.valid('param').serviceId,
      c.req.valid('param').mediaId
    )
)

// AI pictures cost money per call and do not exist without an OpenAI key.
adminMediaRoutes.post(
  '/services/:serviceId/ai-pictures',
  notFoundUnless(isAiPicturesEnabled),
  ...adminMiddleware,
  zValidator('param', adminServiceParamSchema),
  zValidator('json', aiPicturesSchema),
  (c) =>
    serviceMediaController.generateAiPictures(
      c,
      c.req.valid('param').serviceId,
      c.req.valid('json')
    )
)
adminMediaRoutes.post(
  '/services/:serviceId/ai-pictures/use',
  notFoundUnless(isAiPicturesEnabled),
  ...adminMiddleware,
  zValidator('param', adminServiceParamSchema),
  zValidator('json', useAiPictureSchema),
  (c) =>
    serviceMediaController.useAiPicture(
      c,
      c.req.valid('param').serviceId,
      c.req.valid('json')
    )
)

// ─── Webhooks: mounted at /api/v1/webhooks ──────────────────────────────────
//
// No session: Stream proves itself with the Webhook-Signature header.
export const webhookRoutes = new Hono()

webhookRoutes.post(
  '/cloudflare-stream',
  notFoundUnless(isStreamEnabled),
  serviceMediaController.handleStreamWebhook
)

// ─── STREAM_FAKE: mounted at /api/v1/fake-stream ────────────────────────────
//
// Stands in for Stream's upload and poster hosts in E2E. A 404 everywhere
// else; the server refuses to boot with STREAM_FAKE in production.
export const fakeStreamRoutes = new Hono()

fakeStreamRoutes.use('*', notFoundUnless(() => env.streamFake))
fakeStreamRoutes.post('/upload/:uid', serviceMediaController.fakeStreamUpload)
fakeStreamRoutes.get('/:uid/thumbnail.png', serviceMediaController.fakeStreamThumbnail)
