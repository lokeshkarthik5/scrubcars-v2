import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { behaviourService } from './behaviour.service.js'
import type { BehaviourQuery } from './behaviour.validation.js'

type BehaviourContext = Context<{ Variables: AuthVariables }>

export async function getBehaviour(c: BehaviourContext, query: BehaviourQuery) {
  const data = await behaviourService.report(query)
  return c.json({ success: true, data })
}
