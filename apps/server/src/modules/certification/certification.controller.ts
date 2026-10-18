import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { certificationService } from './certification.service.js'
import type { CertifyInput, RecordCheckInput, RevokeInput } from './certification.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>
type VendorContext = Context<{ Variables: TenantVariables }>

// ─── The garage's own ────────────────────────────────────────────────────────
// The garage is always the tenant resolveTenant produced, never a parameter.

export async function getGarageCertification(c: VendorContext) {
  const data = await certificationService.getForGarage(getTenant(c).vendorId)
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function getAdminCertification(c: AdminContext, vendorId: string) {
  const data = await certificationService.getForAdmin(vendorId)
  return c.json({ success: true, data })
}

export async function recordCheck(c: AdminContext, vendorId: string, input: RecordCheckInput) {
  const data = await certificationService.recordCheck(vendorId, c.get('auth').sub, input)
  return c.json({ success: true, data })
}

export async function certify(c: AdminContext, vendorId: string, input: CertifyInput) {
  const data = await certificationService.certify(vendorId, c.get('auth').sub, input)
  return c.json({ success: true, data })
}

export async function revoke(c: AdminContext, vendorId: string, input: RevokeInput) {
  const data = await certificationService.revoke(vendorId, c.get('auth').sub, input)
  return c.json({ success: true, data })
}
