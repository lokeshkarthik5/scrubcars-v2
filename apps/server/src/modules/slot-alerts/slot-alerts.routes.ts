import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import * as slotAlertsController from './slot-alerts.controller.js'
import { createSlotAlertSchema, slotAlertParamSchema } from './slot-alerts.validation.js'

// "Notify me if a slot opens" (0047): GET and POST /users/me/slot-alerts,
// DELETE /users/me/slot-alerts/:id. Mounted at /users/me inside the users
// routes (users.routes.ts), which already require a signed-in customer for
// everything under them; no auth is added a second time here. The customer
// is always the session's, never a parameter.
export const slotAlertsRoutes = new Hono<{ Variables: AuthVariables }>()

slotAlertsRoutes.get('/slot-alerts', slotAlertsController.listSlotAlerts)

slotAlertsRoutes.post('/slot-alerts', zValidator('json', createSlotAlertSchema), (c) =>
  slotAlertsController.createSlotAlert(c, c.req.valid('json'))
)

slotAlertsRoutes.delete('/slot-alerts/:id', zValidator('param', slotAlertParamSchema), (c) =>
  slotAlertsController.removeSlotAlert(c, c.req.valid('param').id)
)
