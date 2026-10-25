import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { rateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as rewardsController from './rewards.controller.js'
import { rewardsMasterOn as masterOn, rewardsOn } from './rewards.guards.js'
import {
  adjustRewardsSchema,
  birthdaySchema,
  monthQuerySchema,
  saveSettingsSchema,
  claimInviteSchema,
  customerIdParamSchema,
  findCustomerSchema,
  openInviteSchema,
  scratchCardParamSchema,
} from './rewards.validation.js'

/**
 * Public: whether the app shows rewards (always answers), and the invite
 * page's lookup by code (first name only), rate limited like a promo code.
 * Mounted at /api/v1/rewards.
 */
export const publicRewardRoutes = new Hono()

publicRewardRoutes.get('/config', rewardsController.getConfig)
publicRewardRoutes.post('/invites/open', rewardsOn, rateLimiter, zValidator('json', openInviteSchema), (c) =>
  rewardsController.openInvite(c, c.req.valid('json').code)
)

/**
 * The customer's own rewards. Mounted at /users/me/rewards (users.routes.ts),
 * after that file's authMiddleware + requireCustomer; always the session's.
 */
export const customerRewardRoutes = new Hono<{ Variables: AuthVariables }>()

customerRewardRoutes.use('*', rewardsOn)
customerRewardRoutes.get('/', rewardsController.getMine)
customerRewardRoutes.get('/summary', rewardsController.getSummary)
customerRewardRoutes.post('/scratch-cards/:id/scratch', zValidator('param', scratchCardParamSchema), (c) =>
  rewardsController.scratch(c, c.req.valid('param').id)
)
customerRewardRoutes.put('/birthday', zValidator('json', birthdaySchema), (c) =>
  rewardsController.setBirthday(c, c.req.valid('json').birthday)
)
customerRewardRoutes.post('/invite', rewardsController.createInvite)
customerRewardRoutes.post('/invite/claim', zValidator('json', claimInviteSchema), (c) =>
  rewardsController.claimInvite(c, c.req.valid('json').token)
)

/**
 * Admin → Rewards: the month's tracking, the CSV ledger, one customer found
 * by phone (in the body) with their timeline, a manual adjustment, and the
 * settings form (every number of the programme, versioned and audit-logged).
 * Super-admin only. While REWARDS_ENABLED (the master switch) is off every
 * route but /config is a 404; the admin's own switch does not hide these,
 * so the team can set things up before turning it on. Mounted at
 * /admin/rewards.
 */
export const adminRewardRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [masterOn, authMiddleware, requireSuperAdmin] as const

adminRewardRoutes.get('/config', authMiddleware, requireSuperAdmin, (c) =>
  c.json({ success: true, data: { masterSwitch: env.rewardsEnabled } })
)
adminRewardRoutes.get('/settings', ...adminMiddleware, rewardsController.adminSettings)
adminRewardRoutes.put('/settings', ...adminMiddleware, zValidator('json', saveSettingsSchema), (c) =>
  rewardsController.adminSaveSettings(c, c.req.valid('json'))
)
adminRewardRoutes.get('/summary', ...adminMiddleware, zValidator('query', monthQuerySchema), (c) =>
  rewardsController.adminSummary(c, c.req.valid('query').month)
)
adminRewardRoutes.get('/ledger', ...adminMiddleware, zValidator('query', monthQuerySchema), (c) =>
  rewardsController.adminLedger(c, c.req.valid('query').month)
)
adminRewardRoutes.post('/find', ...adminMiddleware, zValidator('json', findCustomerSchema), (c) =>
  rewardsController.adminFind(c, c.req.valid('json').phone)
)
adminRewardRoutes.get('/customers/:userId', ...adminMiddleware, zValidator('param', customerIdParamSchema), (c) =>
  rewardsController.adminCustomer(c, c.req.valid('param').userId)
)
adminRewardRoutes.post(
  '/customers/:userId/adjust',
  ...adminMiddleware,
  zValidator('param', customerIdParamSchema),
  zValidator('json', adjustRewardsSchema),
  (c) => rewardsController.adminAdjust(c, c.req.valid('param').userId, c.req.valid('json'))
)
