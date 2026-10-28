import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { byClientIp } from '../../middleware/rate-limit.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { agreementsService } from './agreements.service.js'
import type { AcceptAgreementInput, AgreementUploadUrlInput, PublishAgreementInput } from './agreements.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>
type VendorContext = Context<{ Variables: TenantVariables }>

// ─── The garage's own ────────────────────────────────────────────────────────
// The garage is always the tenant resolveTenant produced, never a parameter.

export async function getGarageAgreement(c: VendorContext) {
  const data = await agreementsService.getForGarage(getTenant(c).vendorId)
  return c.json({ success: true, data })
}

export async function acceptAgreement(c: VendorContext, input: AcceptAgreementInput) {
  const tenant = getTenant(c)
  const data = await agreementsService.accept(
    tenant.vendorId,
    { userId: c.get('auth').sub, viaSupport: tenant.viaSuperAdmin, ip: byClientIp(c) },
    input
  )
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listAgreements(c: AdminContext) {
  const data = await agreementsService.listForAdmin()
  return c.json({ success: true, data })
}

export async function createAgreementUploadUrl(c: AdminContext, input: AgreementUploadUrlInput) {
  const data = await agreementsService.createUploadUrl(input)
  return c.json({ success: true, data })
}

export async function publishAgreement(c: AdminContext, input: PublishAgreementInput) {
  const data = await agreementsService.publish(c.get('auth').sub, input)
  return c.json({ success: true, data }, 201)
}
