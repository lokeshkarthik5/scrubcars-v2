import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { vendorImportsService } from './vendor-imports.service.js'
import type { ExtractImportInput, OwnerAccountInput } from './vendor-imports.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function extract(c: AdminContext, input: ExtractImportInput) {
  const data = await vendorImportsService.extract(input)
  return c.json({ success: true, data })
}

export async function ownerAccount(c: AdminContext, input: OwnerAccountInput) {
  const data = await vendorImportsService.ownerAccount(input.phone)
  return c.json({ success: true, data })
}
