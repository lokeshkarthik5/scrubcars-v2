import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware, requireSuperAdmin, type AuthVariables, adminSignedJson } from '../../middleware/auth.middleware.js'
import { rewardsMasterOn, rewardsOn } from '../rewards/rewards.guards.js'
import * as controller from './reward-extras.controller.js'
import {
  challengeActionSchema,
  challengeIdParamSchema,
  challengeSchema,
  customerIdParamSchema,
  seenSchema,
  wrappedEventSchema,
  wrappedQuerySchema,
  wrappedYearParamSchema,
} from './reward-extras.validation.js'

/**
 * The customer's badges, challenges and Detlio Wrapped (0054). Mounted at
 * /users/me/rewards beside 0050's routes (users.routes.ts, after its
 * authMiddleware + requireCustomer); always the session's own. A 404 while
 * rewards are not live, like every customer rewards route.
 */
export const customerRewardExtrasRoutes = new Hono<{ Variables: AuthVariables }>()

customerRewardExtrasRoutes.use('*', rewardsOn)
customerRewardExtrasRoutes.get('/extras', controller.getExtras)
customerRewardExtrasRoutes.get('/extras/summary', controller.getExtrasSummary)
customerRewardExtrasRoutes.post('/badges/seen', zValidator('json', seenSchema), (c) => controller.markSeen(c, c.req.valid('json').ids))
customerRewardExtrasRoutes.get('/wrapped', zValidator('query', wrappedQuerySchema), (c) => controller.getWrapped(c, c.req.valid('query').year))
customerRewardExtrasRoutes.post(
  '/wrapped/:year/events',
  zValidator('param', wrappedYearParamSchema),
  zValidator('json', wrappedEventSchema),
  (c) => controller.wrappedEvent(c, c.req.valid('param').year, c.req.valid('json').kind)
)

/**
 * Admin → Rewards → Achievements, Challenges and Wrapped (0054).
 * Super-admin only; a 404 while REWARDS_ENABLED (the master switch) is off,
 * like 0050's admin routes, whatever the admin's own switch says. Badges
 * are switched and their bonus stamps set through 0050's settings
 * (`PUT /admin/rewards/settings`). Mounted at /admin/rewards.
 */
export const adminRewardExtrasRoutes = new Hono<{ Variables: AuthVariables }>()

const admin = [rewardsMasterOn, authMiddleware, requireSuperAdmin] as const

adminRewardExtrasRoutes.get('/achievements', ...admin, controller.adminAchievements)
adminRewardExtrasRoutes.get('/challenges', ...admin, controller.adminChallenges)
adminRewardExtrasRoutes.post('/challenges', ...admin, adminSignedJson(challengeSchema), (c) =>
  controller.createChallenge(c, c.req.valid('json'))
)
adminRewardExtrasRoutes.get('/challenges/:id', ...admin, zValidator('param', challengeIdParamSchema), (c) =>
  controller.adminChallenge(c, c.req.valid('param').id)
)
adminRewardExtrasRoutes.put(
  '/challenges/:id',
  ...admin,
  zValidator('param', challengeIdParamSchema),
  adminSignedJson(challengeSchema),
  (c) => controller.updateChallenge(c, c.req.valid('param').id, c.req.valid('json'))
)
adminRewardExtrasRoutes.post(
  '/challenges/:id/publish',
  ...admin,
  zValidator('param', challengeIdParamSchema),
  adminSignedJson(challengeActionSchema),
  (c) => controller.publishChallenge(c, c.req.valid('param').id, c.req.valid('json').actorName)
)
adminRewardExtrasRoutes.post(
  '/challenges/:id/end',
  ...admin,
  zValidator('param', challengeIdParamSchema),
  adminSignedJson(challengeActionSchema),
  (c) => controller.endChallenge(c, c.req.valid('param').id, c.req.valid('json').actorName)
)
adminRewardExtrasRoutes.get('/challenges/:id/results', ...admin, zValidator('param', challengeIdParamSchema), (c) =>
  controller.adminChallengeResults(c, c.req.valid('param').id)
)
adminRewardExtrasRoutes.get('/wrapped/stats', ...admin, zValidator('query', wrappedQuerySchema), (c) =>
  controller.adminWrappedStats(c, c.req.valid('query').year)
)
adminRewardExtrasRoutes.get(
  '/customers/:userId/wrapped',
  ...admin,
  zValidator('param', customerIdParamSchema),
  zValidator('query', wrappedQuerySchema),
  (c) => controller.adminCustomerWrapped(c, c.req.valid('param').userId, c.req.valid('query').year)
)
