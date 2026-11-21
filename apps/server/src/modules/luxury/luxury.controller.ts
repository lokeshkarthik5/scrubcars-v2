import type { Context } from 'hono'
import { userIdFromSubject } from '../../lib/admin-actor.js'
import type { LuxuryDecision } from '../../lib/luxury.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { luxuryService } from './luxury.service.js'
import type {
  EditBrandsInput,
  LuxuryPhotoUploadInput,
  NoteDecisionInput,
  SendApplicationInput,
} from './luxury.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>
type VendorContext = Context<{ Variables: TenantVariables }>

// The garage is always the tenant resolveTenant produced, never a parameter.
export async function getGarageLuxury(c: VendorContext) {
  const data = await luxuryService.getForGarage(getTenant(c).vendorId)
  return c.json({ success: true, data })
}

export async function createPhotoUploadUrl(c: VendorContext, input: LuxuryPhotoUploadInput) {
  const data = await luxuryService.createPhotoUploadUrl(getTenant(c).vendorId, input)
  return c.json({ success: true, data })
}

export async function sendApplication(c: VendorContext, input: SendApplicationInput) {
  const data = await luxuryService.send(getTenant(c).vendorId, userIdFromSubject(c.get('auth').sub), input)
  return c.json({ success: true, data })
}

export async function getAdminLuxury(c: AdminContext, vendorId: string) {
  const data = await luxuryService.getForAdmin(vendorId)
  return c.json({ success: true, data })
}

export async function decide(
  c: AdminContext,
  vendorId: string,
  decision: LuxuryDecision,
  input: { actorName: string } & Partial<Pick<NoteDecisionInput, 'note'>>
) {
  const data = await luxuryService.decide(vendorId, decision, input.note ?? null, {
    sub: c.get('auth').sub,
    name: input.actorName,
  })
  return c.json({ success: true, data })
}

export async function editBrands(c: AdminContext, vendorId: string, input: EditBrandsInput) {
  const data = await luxuryService.editBrands(vendorId, input, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data })
}
