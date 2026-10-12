import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as noticesController from './notices.controller.js'
import {
  audienceCountQuerySchema,
  createNoticeSchema,
  listNoticesQuerySchema,
  noticeIdParamSchema,
  updateNoticeSchema,
} from './notices.validation.js'

// Team notices for the customer Home and Updates. Mounted under
// /api/v1/admin/notices (see admin.routes.ts), like discounts: the admin
// session cookie is scoped to path=/api/v1/admin. There is no delete; a
// notice is ended, and the record stays.
export const adminNoticeRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminNoticeRoutes.get(
  '/',
  ...adminMiddleware,
  zValidator('query', listNoticesQuerySchema),
  (c) => noticesController.listNotices(c, c.req.valid('query'))
)

// Registered before '/:id' so "audience-count" is never read as an id.
adminNoticeRoutes.get(
  '/audience-count',
  ...adminMiddleware,
  zValidator('query', audienceCountQuerySchema),
  (c) => noticesController.audienceCount(c, c.req.valid('query'))
)

adminNoticeRoutes.post(
  '/',
  ...adminMiddleware,
  zValidator('json', createNoticeSchema),
  (c) => noticesController.createNotice(c, c.req.valid('json'))
)

adminNoticeRoutes.get(
  '/:id',
  ...adminMiddleware,
  zValidator('param', noticeIdParamSchema),
  (c) => noticesController.getNotice(c, c.req.valid('param').id)
)

adminNoticeRoutes.patch(
  '/:id',
  ...adminMiddleware,
  zValidator('param', noticeIdParamSchema),
  zValidator('json', updateNoticeSchema),
  (c) => noticesController.updateNotice(c, c.req.valid('param').id, c.req.valid('json'))
)

adminNoticeRoutes.post(
  '/:id/end',
  ...adminMiddleware,
  zValidator('param', noticeIdParamSchema),
  (c) => noticesController.endNotice(c, c.req.valid('param').id)
)
