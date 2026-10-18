import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { slotAlertsService } from './slot-alerts.service.js'
import type { CreateSlotAlertInput } from './slot-alerts.validation.js'

type SlotAlertsContext = Context<{ Variables: AuthVariables }>

/** The signed-in customer: the only user whose alerts are ever read or written. */
function getUserId(c: SlotAlertsContext): string {
  return c.get('auth').sub
}

export async function listSlotAlerts(c: SlotAlertsContext) {
  const data = await slotAlertsService.list(getUserId(c))
  return c.json({ success: true, data })
}

export async function createSlotAlert(c: SlotAlertsContext, input: CreateSlotAlertInput) {
  const data = await slotAlertsService.create(getUserId(c), input)
  return c.json({ success: true, data }, data.replaced ? 200 : 201)
}

export async function removeSlotAlert(c: SlotAlertsContext, id: string) {
  const data = await slotAlertsService.remove(getUserId(c), id)
  return c.json({ success: true, data })
}
