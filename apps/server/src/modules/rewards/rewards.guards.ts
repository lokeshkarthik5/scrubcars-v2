import { createMiddleware } from 'hono/factory'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { rewardsLive } from './rewards.settings.js'

/**
 * Not live (REWARDS_ENABLED off, or the admin's switch off): a 404 before
 * auth runs, like notFoundUnless, reading the settings through their cache.
 * Every customer and public rewards route uses it (0050, and the 0054
 * extras: badges, challenges, Wrapped).
 */
export const rewardsOn = createMiddleware(async (_c, next) => {
  if (!(await rewardsLive())) throw new AppError(404, 'Not found', 'NOT_FOUND')
  await next()
})

/** Admin's Rewards pages work while the master switch (env) is on, whatever the admin switch says. */
export const rewardsMasterOn = createMiddleware(async (_c, next) => {
  if (!env.rewardsEnabled) throw new AppError(404, 'Not found', 'NOT_FOUND')
  await next()
})
