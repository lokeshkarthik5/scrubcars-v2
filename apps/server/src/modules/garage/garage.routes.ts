import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware, requireSuperAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { rewardsMasterOn, rewardsOn } from '../rewards/rewards.guards.js'
import * as garage from './garage.controller.js'
import {
  actorSchema,
  carSchema,
  chooseArtSchema,
  givePullSchema,
  idParamSchema,
  monthQuerySchema,
  overviewQuerySchema,
  seenSchema,
  seriesSchema,
  statsQuerySchema,
  uploadUrlSchema,
  userIdParamSchema,
  useUploadSchema,
} from './garage.validation.js'

/**
 * The customer's Garage (0057). Mounted at /users/me/rewards/garage
 * (users.routes.ts, after its authMiddleware + requireCustomer); always the
 * session's own. A 404 before anything is read while rewards are not live
 * (`rewardsOn`), and from the service while the Garage itself is off or no
 * series is live.
 */
export const customerGarageRoutes = new Hono<{ Variables: AuthVariables }>()

customerGarageRoutes.use('*', rewardsOn)
customerGarageRoutes.get('/', garage.album)
customerGarageRoutes.get('/pulls', garage.pulls)
customerGarageRoutes.post('/pulls/seen', zValidator('json', seenSchema), (c) => garage.markSeen(c, c.req.valid('json').ids))

/**
 * Admin → Rewards → Garage: series, the cars (words, rarity, look, on/off,
 * art: AI with two options, a one-picture bulk fill, upload, reset), the
 * figures and the CSV, and a card given by hand. Super-admin only, every
 * write with the typed name in admin_audit_log. Like every Rewards admin
 * route: only the master switch (REWARDS_ENABLED) is needed, so the team
 * can set it up before going live. Mounted at /admin/rewards/garage.
 */
export const adminGarageRoutes = new Hono<{ Variables: AuthVariables }>()

adminGarageRoutes.use('*', rewardsMasterOn, authMiddleware, requireSuperAdmin)
adminGarageRoutes.get('/', zValidator('query', overviewQuerySchema), (c) => garage.adminOverview(c, c.req.valid('query').seriesId))
adminGarageRoutes.get('/stats', zValidator('query', statsQuerySchema), (c) => garage.adminStats(c, c.req.valid('query').seriesId, c.req.valid('query').month))
adminGarageRoutes.get('/pulls', zValidator('query', monthQuerySchema), (c) => garage.adminPulls(c, c.req.valid('query').month))
adminGarageRoutes.patch('/series/:id', zValidator('param', idParamSchema), zValidator('json', seriesSchema), (c) =>
  garage.adminUpdateSeries(c, c.req.valid('param').id, c.req.valid('json'))
)
adminGarageRoutes.patch('/cars/:id', zValidator('param', idParamSchema), zValidator('json', carSchema), (c) =>
  garage.adminUpdateCar(c, c.req.valid('param').id, c.req.valid('json'))
)
adminGarageRoutes.post('/cars/:id/art/generate', zValidator('param', idParamSchema), (c) => garage.generateArt(c, c.req.valid('param').id))
adminGarageRoutes.post('/cars/:id/art/choose', zValidator('param', idParamSchema), zValidator('json', chooseArtSchema), (c) =>
  garage.chooseArt(c, c.req.valid('param').id, c.req.valid('json'))
)
adminGarageRoutes.post('/cars/:id/art/auto', zValidator('param', idParamSchema), zValidator('json', actorSchema), (c) =>
  garage.autoArt(c, c.req.valid('param').id, c.req.valid('json').actorName)
)
adminGarageRoutes.post('/cars/:id/art/upload-url', zValidator('param', idParamSchema), zValidator('json', uploadUrlSchema), (c) =>
  garage.artUploadUrl(c, c.req.valid('param').id, c.req.valid('json').sizeBytes)
)
adminGarageRoutes.post('/cars/:id/art/upload', zValidator('param', idParamSchema), zValidator('json', useUploadSchema), (c) =>
  garage.useUpload(c, c.req.valid('param').id, c.req.valid('json'))
)
adminGarageRoutes.post('/cars/:id/art/reset', zValidator('param', idParamSchema), zValidator('json', actorSchema), (c) =>
  garage.resetArt(c, c.req.valid('param').id, c.req.valid('json').actorName)
)
adminGarageRoutes.post('/customers/:userId/pull', zValidator('param', userIdParamSchema), zValidator('json', givePullSchema), (c) =>
  garage.adminGivePull(c, c.req.valid('param').userId, c.req.valid('json'))
)
