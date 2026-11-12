import type { Context } from 'hono'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { ownerDeleteService, type OwnerActor } from './owner-delete.service.js'
import type { OwnerCouponCodeDeleteInput, OwnerDeleteInput, OwnerTypedDeleteInput } from './owner-delete.validation.js'

type OwnerDeleteContext = Context<{ Variables: AuthVariables }>

/** The signed-in owner, for the audit row and the own-login check. */
function actorOf(c: OwnerDeleteContext, input: OwnerDeleteInput): OwnerActor {
  const admin = signedInAdmin(c)
  return { sub: admin.sub, name: input.actorName, loginId: admin.loginId }
}

export async function deleteReview(c: OwnerDeleteContext, id: string, input: OwnerDeleteInput) {
  const data = await ownerDeleteService.deleteReview(actorOf(c, input), id)
  return c.json({ success: true, data })
}

export async function deleteComplaint(c: OwnerDeleteContext, id: string, input: OwnerTypedDeleteInput) {
  const data = await ownerDeleteService.deleteComplaint(actorOf(c, input), id, input.confirmText)
  return c.json({ success: true, data })
}

export async function deleteBypassReport(c: OwnerDeleteContext, id: string, input: OwnerDeleteInput) {
  const data = await ownerDeleteService.deleteBypassReport(actorOf(c, input), id)
  return c.json({ success: true, data })
}

export async function deleteClaim(c: OwnerDeleteContext, id: string, input: OwnerTypedDeleteInput) {
  const data = await ownerDeleteService.deleteClaim(actorOf(c, input), id, input.confirmText)
  return c.json({ success: true, data })
}

export async function discountPreview(c: OwnerDeleteContext, id: string) {
  const data = await ownerDeleteService.discountPreview(id)
  return c.json({ success: true, data })
}

export async function deleteDiscountAnyway(c: OwnerDeleteContext, id: string, input: OwnerTypedDeleteInput) {
  const data = await ownerDeleteService.deleteDiscountAnyway(actorOf(c, input), id, input.confirmText)
  return c.json({ success: true, data })
}

export async function couponBatchPreview(c: OwnerDeleteContext, id: string) {
  const data = await ownerDeleteService.couponBatchPreview(id)
  return c.json({ success: true, data })
}

export async function deleteCouponBatch(c: OwnerDeleteContext, id: string, input: OwnerTypedDeleteInput) {
  const data = await ownerDeleteService.deleteCouponBatch(actorOf(c, input), id, input.confirmText)
  return c.json({ success: true, data })
}

export async function deleteCouponCode(c: OwnerDeleteContext, batchId: string, input: OwnerCouponCodeDeleteInput) {
  const data = await ownerDeleteService.deleteCouponCode(actorOf(c, input), batchId, input.code)
  return c.json({ success: true, data })
}

export async function deleteNotice(c: OwnerDeleteContext, id: string, input: OwnerDeleteInput) {
  const data = await ownerDeleteService.deleteNotice(actorOf(c, input), id)
  return c.json({ success: true, data })
}

export async function deleteGift(c: OwnerDeleteContext, id: string, input: OwnerTypedDeleteInput) {
  const data = await ownerDeleteService.deleteGift(actorOf(c, input), id, input.confirmText)
  return c.json({ success: true, data })
}

export async function deleteChallenge(c: OwnerDeleteContext, id: string, input: OwnerTypedDeleteInput) {
  const data = await ownerDeleteService.deleteChallenge(actorOf(c, input), id, input.confirmText)
  return c.json({ success: true, data })
}

export async function listZoneSignups(c: OwnerDeleteContext, zoneId: string) {
  const data = await ownerDeleteService.listZoneSignups(zoneId)
  return c.json({ success: true, data })
}

export async function removeZoneSignup(
  c: OwnerDeleteContext,
  zoneId: string,
  userId: string,
  input: OwnerDeleteInput
) {
  const data = await ownerDeleteService.removeZoneSignup(actorOf(c, input), zoneId, userId)
  return c.json({ success: true, data })
}

export async function deleteAdminLogin(c: OwnerDeleteContext, id: string, input: OwnerTypedDeleteInput) {
  const data = await ownerDeleteService.deleteAdminLogin(actorOf(c, input), id, input.confirmText)
  return c.json({ success: true, data })
}

export async function deleteJobPhoto(c: OwnerDeleteContext, id: string, input: OwnerDeleteInput) {
  const data = await ownerDeleteService.deleteJobPhoto(actorOf(c, input), id)
  return c.json({ success: true, data })
}
