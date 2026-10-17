import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { aiService } from './ai.service.js'
import type { DescribeServiceInput } from './ai.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function getConfig(c: AdminContext) {
  return c.json({ success: true, data: aiService.config() })
}

export async function describeService(c: AdminContext, input: DescribeServiceInput) {
  const data = await aiService.describeService(input)
  return c.json({ success: true, data })
}
