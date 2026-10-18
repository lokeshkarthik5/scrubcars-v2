import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { dataResetService } from './data-reset.service.js'
import type { ExecuteInput, PreviewInput } from './data-reset.validation.js'

type DataResetContext = Context<{ Variables: AuthVariables }>

export function getConfig(c: DataResetContext) {
  return c.json({ success: true, data: dataResetService.config() })
}

export async function preview(c: DataResetContext, input: PreviewInput) {
  const data = await dataResetService.preview(input)
  return c.json({ success: true, data })
}

// Takes the token's subject for the audit row, beside the name the person
// typed: the shared admin login would otherwise make every run 'admin'.
export async function execute(c: DataResetContext, input: ExecuteInput) {
  const data = await dataResetService.execute(c.get('auth').sub, input)
  return c.json({ success: true, data })
}
