import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { refundsService } from './refunds.service.js'
import type { ListRefundsQuery, RecordRefundInput, RefundNowInput } from './refunds.validation.js'

type RefundsContext = Context<{ Variables: AuthVariables }>

export async function listRefunds(c: RefundsContext, query: ListRefundsQuery) {
  const data = await refundsService.listRefunds(query)
  return c.json({ success: true, data })
}

// Takes the token's subject so the refund, its booking note and its alert
// all name whoever recorded it.
export async function recordRefund(c: RefundsContext, input: RecordRefundInput) {
  const data = await refundsService.recordRefund(c.get('auth').sub, input)
  return c.json({ success: true, data }, 201)
}

// The admin who pressed it signs the refund, its booking note and its alert.
export async function refundNow(c: RefundsContext, input: RefundNowInput) {
  const data = await refundsService.refundNow(c.get('auth').sub, input)
  return c.json({ success: true, data }, 201)
}
