import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { byClientIp } from '../../middleware/rate-limit.middleware.js'
import { couponsService } from './coupons.service.js'
import type { CreateBatchInput, RedeemCouponInput, VoidBatchInput, VoidCodeInput } from './coupons.validation.js'

type CustomerContext = Context<{ Variables: AuthVariables }>
type PublicContext = Context<{ Variables: Partial<AuthVariables> }>

// ─── Public (/coupons) ───────────────────────────────────────────────────────

/** The /c/<code> page; signed in or not (a signed-in viewer's wrong tries count against them too). */
export async function lookup(c: PublicContext, code: string) {
  // Only a customer session counts as "who": a garage seat's token reads as signed out.
  const auth = c.get('auth')
  const viewer = { userId: auth?.isCustomer ? auth.sub : null, ip: byClientIp(c) }
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await couponsService.lookup(code, viewer) })
}

// ─── Customer (/users/me/coupons) ────────────────────────────────────────────

export async function listMine(c: CustomerContext) {
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await couponsService.listMine(c.get('auth').sub) })
}

export async function redeem(c: CustomerContext, input: RedeemCouponInput) {
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await couponsService.redeem(c.get('auth').sub, input, byClientIp(c)) })
}

// ─── Admin (/admin/coupons) ──────────────────────────────────────────────────

export async function adminConfig(c: CustomerContext) {
  return c.json({ success: true, data: await couponsService.adminConfig() })
}

export async function listBatches(c: CustomerContext) {
  return c.json({ success: true, data: await couponsService.listBatches() })
}

export async function createBatch(c: CustomerContext, input: CreateBatchInput) {
  return c.json({ success: true, data: await couponsService.createBatch(input, c.get('auth').sub) }, 201)
}

export async function getBatch(c: CustomerContext, batchId: string) {
  return c.json({ success: true, data: await couponsService.getBatch(batchId) })
}

export async function listCodes(c: CustomerContext, batchId: string) {
  // Every code of the batch, for printing: never cached on the way.
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await couponsService.listCodes(batchId) })
}

export async function listRedemptions(c: CustomerContext, batchId: string) {
  return c.json({ success: true, data: await couponsService.listRedemptions(batchId) })
}

export async function voidBatch(c: CustomerContext, batchId: string, input: VoidBatchInput) {
  return c.json({ success: true, data: await couponsService.voidBatch(batchId, input, c.get('auth').sub) })
}

export async function voidCode(c: CustomerContext, batchId: string, input: VoidCodeInput) {
  return c.json({ success: true, data: await couponsService.voidCode(batchId, input, c.get('auth').sub) })
}
