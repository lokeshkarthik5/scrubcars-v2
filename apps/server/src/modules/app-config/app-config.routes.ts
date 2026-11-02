import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import * as appConfigController from './app-config.controller.js'
import { appConfigQuerySchema } from './app-config.validation.js'

/**
 * Forced update for the Expo apps: `GET /app-config?app=customer|garage&
 * platform=ios|android&version=1.2.3`. Public and unauthenticated on
 * purpose (an app asks before anyone signs in), limited by the global per-IP
 * limiter. It reads only the environment, so there is no repository.
 */
export const appConfigRoutes = new Hono()

appConfigRoutes.get('/', zValidator('query', appConfigQuerySchema), (c) =>
  appConfigController.getAppConfig(c, c.req.valid('query'))
)
