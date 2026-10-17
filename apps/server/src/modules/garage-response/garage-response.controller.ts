import type { Context } from 'hono'
import type { TenantVariables } from '../../middleware/tenant.middleware.js'
import { garageResponseService } from './garage-response.service.js'

type GarageResponseContext = Context<{ Variables: TenantVariables }>

export async function otherGarages(c: GarageResponseContext, bookingId: string) {
  const data = await garageResponseService.otherGarages(c.get('auth').sub, bookingId)
  return c.json({ success: true, data })
}
