import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { requireCronSecret } from '../../middleware/cron-auth.middleware.js'
import * as opsController from './ops.controller.js'
import { pendingDigestQuerySchema } from './ops.validation.js'

// Jobs an outside scheduler runs on a timer, never people: every route here
// needs CRON_SECRET, and none exists where it is unset.
export const opsRoutes = new Hono()

opsRoutes.use('*', requireCronSecret)

// POST: a run can post a message.
opsRoutes.post('/pending-digest', zValidator('query', pendingDigestQuerySchema), (c) =>
  opsController.pendingDigest(c, c.req.valid('query'))
)
