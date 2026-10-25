import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { giftCreditService } from './gift-credit.service.js'
import type { AdjustCreditInput } from './gift-credit.validation.js'

type AuthContext = Context<{ Variables: AuthVariables }>

/** The customer's own Detlio credit (the session's id, never a parameter). */
export async function getMyCredit(c: AuthContext) {
  return c.json({ success: true, data: await giftCreditService.myCredit(c.get('auth').sub) })
}

export async function adminBalances(c: AuthContext) {
  return c.json({ success: true, data: { customers: await giftCreditService.topBalances() } })
}

export async function adminFind(c: AuthContext, phone: string) {
  return c.json({ success: true, data: await giftCreditService.findCustomer(phone) })
}

export async function adminCustomer(c: AuthContext, userId: string) {
  return c.json({ success: true, data: await giftCreditService.customerCredit(userId) })
}

export async function adminAdjust(c: AuthContext, userId: string, input: AdjustCreditInput) {
  return c.json({
    success: true,
    data: await giftCreditService.adjust({ userId, ...input, actorSub: c.get('auth').sub }),
  })
}
