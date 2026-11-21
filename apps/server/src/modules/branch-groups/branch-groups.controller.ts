import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { branchGroupsService } from './branch-groups.service.js'
import type {
  BranchServicesApplyInput,
  BranchServicesPreviewInput,
  GroupMemberInput,
} from './branch-groups.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function branchesOf(c: AdminContext, vendorId: string) {
  return c.json({ success: true, data: await branchGroupsService.branchesOf(vendorId) })
}

export async function link(c: AdminContext, vendorId: string, input: GroupMemberInput) {
  const data = await branchGroupsService.link(vendorId, input.vendorId, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data })
}

export async function unlink(c: AdminContext, vendorId: string, input: GroupMemberInput) {
  const data = await branchGroupsService.unlink(vendorId, input.vendorId, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data })
}

export async function previewServices(c: AdminContext, vendorId: string, input: BranchServicesPreviewInput) {
  return c.json({ success: true, data: await branchGroupsService.previewServices(vendorId, input.change) })
}

export async function applyServices(c: AdminContext, vendorId: string, input: BranchServicesApplyInput) {
  const data = await branchGroupsService.applyServices(vendorId, input.change, input.key, {
    sub: c.get('auth').sub,
    name: input.actorName,
  })
  return c.json({ success: true, data })
}
