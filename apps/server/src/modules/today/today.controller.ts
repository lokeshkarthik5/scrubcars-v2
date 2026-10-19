import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { todayService } from './today.service.js'

type TodayContext = Context<{ Variables: AuthVariables }>

export async function getToday(c: TodayContext) {
  const data = await todayService.summary()
  return c.json({ success: true, data })
}
