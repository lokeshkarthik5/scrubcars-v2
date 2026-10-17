import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { payoutsService } from './payouts.service.js'
import type {
  EarningsStatementQuery,
  PayoutAccountInput,
  RecordPayoutInput,
} from './payouts.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>
type VendorContext = Context<{ Variables: TenantVariables }>

// ─── The garage's own ────────────────────────────────────────────────────────

/** The garage is always the tenant resolveTenant produced, never a parameter. */
export async function getStatement(c: VendorContext, query: EarningsStatementQuery) {
  const data = await payoutsService.statement(getTenant(c).vendorId, query)
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listPayouts(c: AdminContext) {
  const data = await payoutsService.list()
  return c.json({ success: true, data })
}

export async function getGaragePayouts(c: AdminContext, vendorId: string) {
  const data = await payoutsService.garage(vendorId)
  return c.json({ success: true, data })
}

/** The session's subject goes on the row beside the typed name. */
export async function recordPayout(c: AdminContext, vendorId: string, input: RecordPayoutInput) {
  const data = await payoutsService.record(c.get('auth').sub, vendorId, input)
  return c.json({ success: true, data }, 201)
}

export async function getPayoutAccount(c: AdminContext, vendorId: string) {
  const data = await payoutsService.account(vendorId)
  return c.json({ success: true, data })
}

export async function savePayoutAccount(c: AdminContext, vendorId: string, input: PayoutAccountInput) {
  const data = await payoutsService.saveAccount(vendorId, input)
  return c.json({ success: true, data })
}

export async function removePayoutAccount(c: AdminContext, vendorId: string) {
  const data = await payoutsService.removeAccount(vendorId)
  return c.json({ success: true, data })
}
