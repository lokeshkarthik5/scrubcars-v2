import type { Context } from 'hono'
import {
  getTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { timeProposalsService } from './time-proposals.service.js'
import type {
  ChooseTimeInput,
  ProposalSlotsQuery,
  SuggestTimesInput,
} from './time-proposals.validation.js'

type ProposalsContext = Context<{ Variables: TenantVariables }>

function getAuth(c: ProposalsContext) {
  return c.get('auth')
}

/** The active company. Produced by resolveTenant, never by a request param. */
function getVendorId(c: ProposalsContext): string {
  return getTenant(c).vendorId
}

export async function getSlots(c: ProposalsContext, bookingId: string, query: ProposalSlotsQuery) {
  const slots = await timeProposalsService.getSlots(getVendorId(c), bookingId, query.date)
  return c.json({ success: true, data: slots })
}

export async function suggest(c: ProposalsContext, bookingId: string, input: SuggestTimesInput) {
  const booking = await timeProposalsService.suggest(getVendorId(c), getAuth(c).sub, bookingId, input)
  return c.json({ success: true, data: booking }, 201)
}

export async function withdraw(c: ProposalsContext, bookingId: string) {
  const booking = await timeProposalsService.withdraw(getVendorId(c), bookingId)
  return c.json({ success: true, data: booking })
}

export async function choose(c: ProposalsContext, bookingId: string, input: ChooseTimeInput) {
  const booking = await timeProposalsService.choose(getAuth(c).sub, bookingId, input.slot)
  return c.json({ success: true, data: booking })
}

export async function decline(c: ProposalsContext, bookingId: string) {
  const booking = await timeProposalsService.decline(getAuth(c).sub, bookingId)
  return c.json({ success: true, data: booking })
}
