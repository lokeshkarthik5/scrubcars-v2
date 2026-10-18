import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import * as carHistoryController from './car-history.controller.js'
import { carHistoryParamSchema, carHistoryQuerySchema, reminderParamSchema } from './car-history.validation.js'

// A car's history and its service reminders (0046): GET
// /users/me/vehicles/:vehicleId/history, POST
// /users/me/service-reminders/:reminderId/dismiss and …/snooze. Mounted at
// /users/me inside the users routes (users.routes.ts), which already require
// a signed-in customer for everything under them; no auth is added a second
// time here. The user is always the session's: a car or reminder of anyone
// else's is a 404, never a 403.
export const carHistoryRoutes = new Hono<{ Variables: AuthVariables }>()

carHistoryRoutes.get(
  '/vehicles/:vehicleId/history',
  zValidator('param', carHistoryParamSchema),
  zValidator('query', carHistoryQuerySchema),
  (c) => carHistoryController.getCarHistory(c, c.req.valid('param').vehicleId, c.req.valid('query'))
)

carHistoryRoutes.post('/service-reminders/:reminderId/dismiss', zValidator('param', reminderParamSchema), (c) =>
  carHistoryController.dismissReminder(c, c.req.valid('param').reminderId)
)

carHistoryRoutes.post('/service-reminders/:reminderId/snooze', zValidator('param', reminderParamSchema), (c) =>
  carHistoryController.snoozeReminder(c, c.req.valid('param').reminderId)
)
