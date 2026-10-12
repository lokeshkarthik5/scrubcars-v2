import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import * as homeController from './home.controller.js'
import {
  homeIdParamSchema,
  homeQuerySchema,
  markUpdatesSeenSchema,
} from './home.validation.js'

// The customer's Home hub and Updates feed. Mounted at /users/me inside the
// users routes (users.routes.ts), which already require a signed-in
// customer for everything under them; no auth is added a second time here.
export const homeRoutes = new Hono<{ Variables: AuthVariables }>()

homeRoutes.get('/home', zValidator('query', homeQuerySchema), (c) =>
  homeController.getHome(c, c.req.valid('query'))
)

homeRoutes.get('/updates', homeController.getUpdates)

homeRoutes.post('/updates/seen', zValidator('json', markUpdatesSeenSchema), (c) =>
  homeController.markUpdatesSeen(c, c.req.valid('json'))
)

homeRoutes.post(
  '/notices/:id/dismiss',
  zValidator('param', homeIdParamSchema),
  (c) => homeController.dismissNotice(c, c.req.valid('param').id)
)

homeRoutes.post(
  '/offers/:id/dismiss',
  zValidator('param', homeIdParamSchema),
  (c) => homeController.dismissOffer(c, c.req.valid('param').id)
)
