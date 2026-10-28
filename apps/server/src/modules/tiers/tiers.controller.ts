import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { tiersService } from './tiers.service.js'
import type { TierHiddenInput, TierSwitchInput } from './tiers.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>
type VendorContext = Context<{ Variables: TenantVariables }>

export async function getPublicTierConfig(c: Context) {
  const data = await tiersService.publicConfig()
  // The same for everyone and rarely changed: a minute's cache is plenty.
  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ success: true, data })
}

// The garage is always the tenant resolveTenant produced, never a parameter.
export async function getGarageTier(c: VendorContext) {
  const data = await tiersService.getForGarage(getTenant(c).vendorId)
  return c.json({ success: true, data })
}

export async function getTierSettings(c: AdminContext) {
  const data = await tiersService.getSettings()
  return c.json({ success: true, data })
}

export async function setTierSwitch(c: AdminContext, input: TierSwitchInput) {
  const data = await tiersService.setSwitch(c.get('auth').sub, input)
  return c.json({ success: true, data })
}

export async function getAdminTier(c: AdminContext, vendorId: string) {
  const data = await tiersService.getForAdmin(vendorId)
  return c.json({ success: true, data })
}

export async function setTierHidden(c: AdminContext, vendorId: string, input: TierHiddenInput) {
  const data = await tiersService.setHidden(vendorId, c.get('auth').sub, input)
  return c.json({ success: true, data })
}
