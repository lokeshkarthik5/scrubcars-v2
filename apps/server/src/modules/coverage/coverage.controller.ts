import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { coverageService } from './coverage.service.js'
import type { CreateZoneInput, UpdateZoneInput } from './coverage.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function overview(c: AdminContext) {
  return c.json({ success: true, data: await coverageService.overview() })
}

export async function createZone(c: AdminContext, input: CreateZoneInput) {
  return c.json(
    { success: true, data: await coverageService.createZone(input) },
    201
  )
}

export async function updateZone(
  c: AdminContext,
  id: string,
  input: UpdateZoneInput
) {
  return c.json({
    success: true,
    data: await coverageService.updateZone(id, input),
  })
}

export async function removeZone(c: AdminContext, id: string) {
  return c.json({ success: true, data: await coverageService.removeZone(id) })
}
