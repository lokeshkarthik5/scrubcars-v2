import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { garageClosureService } from './garage-closure.service.js'
import type { RequestClosureInput } from './garage-closure.validation.js'

type GarageContext = Context<{ Variables: TenantVariables }>

export async function getMine(c: GarageContext) {
  return c.json({ success: true, data: await garageClosureService.get(getTenant(c).vendorId) })
}

export async function requestMine(c: GarageContext, input: RequestClosureInput) {
  const tenant = getTenant(c)
  const data = await garageClosureService.request(tenant.vendorId, c.get('auth').sub, Boolean(tenant.viaSuperAdmin), input)
  return c.json({ success: true, data }, 201)
}

export async function cancelMine(c: GarageContext) {
  const tenant = getTenant(c)
  const data = await garageClosureService.cancel(tenant.vendorId, c.get('auth').sub, Boolean(tenant.viaSuperAdmin))
  return c.json({ success: true, data })
}

export async function listOpen(c: Context<{ Variables: AuthVariables }>) {
  return c.json({ success: true, data: await garageClosureService.listOpen() })
}

export async function getForGarage(c: Context<{ Variables: AuthVariables }>, vendorId: string) {
  return c.json({ success: true, data: await garageClosureService.get(vendorId) })
}
