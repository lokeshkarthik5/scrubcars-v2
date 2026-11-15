import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { signedInAdmin } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { pickupFeesService } from './pickup-fees.service.js'
import type { GarageFeeInput, LimitOverridesInput, PickupFeeSettingsInput } from './pickup-fees.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>
type VendorContext = Context<{ Variables: TenantVariables & AuthVariables }>

export async function getPublicConfig(c: Context) {
  const data = await pickupFeesService.publicConfig()
  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ success: true, data })
}

// The garage is always the tenant resolveTenant produced, never a parameter.
export async function getGarageFee(c: VendorContext) {
  const data = await pickupFeesService.getForGarage(getTenant(c).vendorId)
  return c.json({ success: true, data })
}

export async function setGarageFee(c: VendorContext, input: GarageFeeInput) {
  const tenant = getTenant(c)
  const data = await pickupFeesService.changeByGarage(
    tenant.vendorId,
    { userId: c.get('auth').sub, viaSupport: tenant.viaSuperAdmin },
    input
  )
  return c.json({ success: true, data })
}

export async function getSettings(c: AdminContext) {
  const data = await pickupFeesService.getSettings()
  return c.json({ success: true, data })
}

export async function saveSettings(c: AdminContext, input: PickupFeeSettingsInput) {
  const { actorName, ...settings } = input
  const data = await pickupFeesService.saveSettings(settings, { sub: c.get('auth').sub, name: actorName || signedInAdmin(c).name })
  return c.json({ success: true, data })
}

export async function getAdminGarage(c: AdminContext, vendorId: string) {
  const data = await pickupFeesService.getForAdmin(vendorId)
  return c.json({ success: true, data })
}

export async function setAdminGarageFee(c: AdminContext, vendorId: string, input: { fee: GarageFeeInput; actorName: string }) {
  const data = await pickupFeesService.setByAdmin(vendorId, input.fee, input.actorName)
  return c.json({ success: true, data })
}

export async function setLock(c: AdminContext, vendorId: string, input: { locked: boolean; actorName: string }) {
  const data = await pickupFeesService.setLock(vendorId, input.locked, input.actorName)
  return c.json({ success: true, data })
}

export async function setLimits(c: AdminContext, vendorId: string, input: { limits: LimitOverridesInput; actorName: string }) {
  const data = await pickupFeesService.setLimits(vendorId, input.limits, input.actorName)
  return c.json({ success: true, data })
}

export async function listForCheck(c: AdminContext, show: 'waiting' | 'approved' | 'kept') {
  const data = await pickupFeesService.listForCheck(show)
  return c.json({ success: true, data })
}

export async function decide(
  c: AdminContext,
  changeId: string,
  input: { decision: 'approved' | 'kept'; reason?: string; actorName: string }
) {
  const data = await pickupFeesService.decide(changeId, input.decision, input.reason ?? null, input.actorName)
  return c.json({ success: true, data })
}
