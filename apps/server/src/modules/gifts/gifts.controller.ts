import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { byClientIp } from '../../middleware/rate-limit.middleware.js'
import { giftsService } from './gifts.service.js'
import type { BuyGiftInput, CancelGiftInput, VerifyGiftInput } from './gifts.validation.js'

type CustomerContext = Context<{ Variables: AuthVariables }>
type PublicContext = Context<{ Variables: Partial<AuthVariables> }>

// ─── Public (/gifts) ─────────────────────────────────────────────────────────

export function getConfig(c: Context) {
  return c.json({ success: true, data: giftsService.config() })
}

/** Whoever holds the code; signed in or not (a signed-in viewer's wrong tries count against them too). */
export async function lookup(c: PublicContext, code: string) {
  // Only a customer session counts as "who": any other token (a garage
  // seat's) reads the same as signed out.
  const auth = c.get('auth')
  const viewer = { userId: auth?.isCustomer ? auth.sub : null, ip: byClientIp(c) }
  return c.json({ success: true, data: await giftsService.lookup(code, viewer) })
}

// ─── Customer (/users/me/gifts) ──────────────────────────────────────────────

export async function listMine(c: CustomerContext) {
  return c.json({ success: true, data: await giftsService.listMine(c.get('auth').sub) })
}

export async function getMine(c: CustomerContext, giftId: string) {
  return c.json({ success: true, data: await giftsService.getMine(c.get('auth').sub, giftId) })
}

export async function buy(c: CustomerContext, input: BuyGiftInput) {
  return c.json({ success: true, data: await giftsService.startPurchase(c.get('auth').sub, input) }, 201)
}

export async function verify(c: CustomerContext, giftId: string, input: VerifyGiftInput) {
  return c.json({ success: true, data: await giftsService.verifyPurchase(c.get('auth').sub, giftId, input) })
}

export async function issueLink(c: CustomerContext, giftId: string) {
  // The code is in this answer only: never cached by anything in between.
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await giftsService.issueLink(c.get('auth').sub, giftId) })
}

export async function redeem(c: CustomerContext, code: string) {
  return c.json({ success: true, data: await giftsService.redeem(c.get('auth').sub, code, byClientIp(c)) })
}

// ─── Admin (/admin/gifts) ────────────────────────────────────────────────────

export async function adminSummary(c: CustomerContext) {
  return c.json({ success: true, data: await giftsService.summary() })
}

export async function adminList(c: CustomerContext, status: 'all' | 'available' | 'redeemed' | 'expired' | 'cancelled') {
  return c.json({ success: true, data: await giftsService.listForAdmin(status) })
}

export async function adminCancel(c: CustomerContext, giftId: string, input: CancelGiftInput) {
  return c.json({ success: true, data: await giftsService.cancel(giftId, input, c.get('auth').sub) })
}
