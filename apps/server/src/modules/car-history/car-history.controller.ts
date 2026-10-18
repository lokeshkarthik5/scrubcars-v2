import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { carHistoryService } from './car-history.service.js'
import type { CarHistoryQuery } from './car-history.validation.js'

type CarHistoryContext = Context<{ Variables: AuthVariables }>

/** The signed-in customer: the only one whose cars and reminders are ever read or written. */
function getUserId(c: CarHistoryContext): string {
  return c.get('auth').sub
}

export async function getCarHistory(c: CarHistoryContext, vehicleId: string, query: CarHistoryQuery) {
  const data = await carHistoryService.getHistory(getUserId(c), vehicleId, query)
  return c.json({ success: true, data })
}

export async function dismissReminder(c: CarHistoryContext, reminderId: string) {
  const data = await carHistoryService.dismissReminder(getUserId(c), reminderId)
  return c.json({ success: true, data })
}

export async function snoozeReminder(c: CarHistoryContext, reminderId: string) {
  const data = await carHistoryService.snoozeReminder(getUserId(c), reminderId)
  return c.json({ success: true, data })
}
