import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { vendorBinService } from './vendor-bin.service.js'
import type {
  BinVendorInput,
  DeleteVendorForeverInput,
  RestoreVendorInput,
} from './vendor-bin.validation.js'

type VendorBinContext = Context<{ Variables: AuthVariables }>

export async function binPreview(c: VendorBinContext, id: string) {
  const data = await vendorBinService.binPreview(id)
  return c.json({ success: true, data })
}

// Each write takes the token's subject for the audit row, beside the name
// the person typed: the shared admin login would otherwise make every one
// 'admin'.

export async function bin(c: VendorBinContext, id: string, input: BinVendorInput) {
  const data = await vendorBinService.bin(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}

export async function restore(c: VendorBinContext, id: string, input: RestoreVendorInput) {
  const data = await vendorBinService.restore(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}

export async function deletePreview(c: VendorBinContext, id: string) {
  const data = await vendorBinService.deletePreview(id)
  return c.json({ success: true, data })
}

export async function deleteForever(
  c: VendorBinContext,
  id: string,
  input: DeleteVendorForeverInput
) {
  const data = await vendorBinService.deleteForever(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}
