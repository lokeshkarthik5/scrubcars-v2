import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { alertsService } from './alerts.service.js'
import type { TelegramTestInput } from './alerts.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export function getTelegramStatus(c: AdminContext) {
  return c.json({ success: true, data: alertsService.telegramStatus() })
}

export async function sendTelegramTest(c: AdminContext, input: TelegramTestInput) {
  const data = await alertsService.sendTelegramTest(c.get('auth').sub, input)
  return c.json({ success: true, data })
}
