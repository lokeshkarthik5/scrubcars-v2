import type { Context } from 'hono'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { conditionCheckService } from './condition-check.service.js'
import type { AddMarkInput, ConditionAnswerInput } from './condition-check.validation.js'

type ConditionContext = Context<{ Variables: TenantVariables }>

/** The active company. Produced by resolveTenant, never by a request param. */
function vendorIdOf(c: ConditionContext): string {
  return getTenant(c).vendorId
}

// ─── The garage ──────────────────────────────────────────────────────────────

export async function readPhoto(c: ConditionContext, bookingId: string, photoId: string) {
  const data = await conditionCheckService.readPhoto(vendorIdOf(c), bookingId, photoId)
  return c.json({ success: true, data })
}

export async function addMark(c: ConditionContext, bookingId: string, input: AddMarkInput) {
  const data = await conditionCheckService.addMark(vendorIdOf(c), bookingId, input)
  return c.json({ success: true, data }, 201)
}

export async function removeMark(c: ConditionContext, bookingId: string, markId: string) {
  const data = await conditionCheckService.setMarkRemoved(vendorIdOf(c), bookingId, markId, true)
  return c.json({ success: true, data })
}

export async function restoreMark(c: ConditionContext, bookingId: string, markId: string) {
  const data = await conditionCheckService.setMarkRemoved(vendorIdOf(c), bookingId, markId, false)
  return c.json({ success: true, data })
}

export async function send(c: ConditionContext, bookingId: string) {
  const data = await conditionCheckService.send(vendorIdOf(c), c.get('auth').sub, bookingId)
  return c.json({ success: true, data })
}

export async function garageWasThere(c: ConditionContext, bookingId: string, markId: string) {
  const data = await conditionCheckService.garageWasThere(vendorIdOf(c), bookingId, markId)
  return c.json({ success: true, data })
}

// ─── The customer ────────────────────────────────────────────────────────────
//
// The user id is always the session's (authMiddleware), never a parameter:
// a booking that is not theirs is a 404 in the service.

export async function answer(c: ConditionContext, bookingId: string, input: ConditionAnswerInput) {
  const data = await conditionCheckService.answer(c.get('auth').sub, bookingId, input)
  return c.json({ success: true, data })
}

export async function customerAlreadyThere(c: ConditionContext, bookingId: string, markId: string) {
  const data = await conditionCheckService.customerAlreadyThere(c.get('auth').sub, bookingId, markId)
  return c.json({ success: true, data })
}
