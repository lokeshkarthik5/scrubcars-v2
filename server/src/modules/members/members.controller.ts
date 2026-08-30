import type { Context } from 'hono'
import {
  getTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { membersService } from './members.service.js'
import type {
  AddMemberInput,
  TransferOwnershipInput,
  UpdateMemberInput,
} from './members.validation.js'

type MembersContext = Context<{ Variables: TenantVariables }>

function getVendorId(c: MembersContext): string {
  return getTenant(c).vendorId
}

function getActorId(c: MembersContext): string {
  return c.get('auth').sub
}

export async function listMembers(c: MembersContext) {
  const members = await membersService.listMembers(getVendorId(c))

  return c.json({ success: true, data: members })
}

export async function addMember(c: MembersContext, input: AddMemberInput) {
  const member = await membersService.addMember(
    getVendorId(c),
    getActorId(c),
    input
  )

  return c.json({ success: true, data: member }, 201)
}

export async function updateMember(
  c: MembersContext,
  membershipId: string,
  input: UpdateMemberInput
) {
  const member = await membersService.updateMember(
    getVendorId(c),
    getActorId(c),
    membershipId,
    input
  )

  return c.json({ success: true, data: member })
}

export async function removeMember(c: MembersContext, membershipId: string) {
  await membersService.removeMember(
    getVendorId(c),
    getActorId(c),
    membershipId
  )

  return c.json({ success: true })
}

export async function leaveCompany(c: MembersContext) {
  await membersService.leaveCompany(getVendorId(c), getActorId(c))

  return c.json({ success: true })
}

export async function transferOwnership(
  c: MembersContext,
  input: TransferOwnershipInput
) {
  const vendor = await membersService.transferOwnership(
    getVendorId(c),
    getActorId(c),
    input
  )

  return c.json({ success: true, data: { id: vendor.id, ownerId: vendor.ownerId } })
}
