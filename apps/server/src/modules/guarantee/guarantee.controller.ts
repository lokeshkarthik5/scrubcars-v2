import type { Context } from 'hono'
import { AppError } from '../../lib/errors.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { guaranteeService } from './guarantee.service.js'
import type {
  AdminClaimsQuery,
  BookRedoInput,
  ClaimPhotoUploadInput,
  CreateClaimInput,
  DecideClaimInput,
  GarageClaimsQuery,
} from './guarantee.validation.js'

type CustomerContext = Context<{ Variables: AuthVariables }>
type GarageContext = Context<{ Variables: TenantVariables }>

/** The signed-in customer: the only user a claim is ever made or read for. */
function customerId(c: CustomerContext): string {
  return c.get('auth').sub
}

/** The garage resolveTenant produced: never a parameter. */
function garageId(c: GarageContext): string {
  return getTenant(c).vendorId
}

/**
 * Answering a claim commits the garage to a free redo or starts a dispute:
 * the garage's own people decide that. A Detlio support session decides from
 * admin instead.
 */
function refuseSupportSession(c: GarageContext) {
  if (getTenant(c).viaSuperAdmin) {
    throw new AppError(
      403,
      "A claim is answered by the garage's own team. Detlio decides from admin.",
      'GUARANTEE_SUPPORT_SESSION'
    )
  }
}

export function getConfig(c: Context) {
  return c.json({ success: true, data: guaranteeService.config() })
}

// ─── The customer ────────────────────────────────────────────────────────────

export async function forBooking(c: CustomerContext, bookingId: string) {
  const data = await guaranteeService.forBooking(customerId(c), bookingId)
  return c.json({ success: true, data })
}

export async function createUploadUrl(c: CustomerContext, bookingId: string, input: ClaimPhotoUploadInput) {
  const data = await guaranteeService.createUploadUrl(customerId(c), bookingId, input)
  return c.json({ success: true, data })
}

export async function submit(c: CustomerContext, input: CreateClaimInput) {
  const data = await guaranteeService.submit(customerId(c), input)
  return c.json({ success: true, data }, 201)
}

export async function redoSlots(c: CustomerContext, claimId: string, date: string) {
  const data = await guaranteeService.redoSlots(customerId(c), claimId, date)
  return c.json({ success: true, data })
}

export async function bookRedo(c: CustomerContext, claimId: string, input: BookRedoInput) {
  const data = await guaranteeService.bookRedo(customerId(c), claimId, input)
  return c.json({ success: true, data }, 201)
}

// ─── The garage ──────────────────────────────────────────────────────────────

export async function listForGarage(c: GarageContext, query: GarageClaimsQuery) {
  const data = await guaranteeService.listForGarage(garageId(c), query.scope)
  return c.json({ success: true, data })
}

export async function accept(c: GarageContext, claimId: string) {
  refuseSupportSession(c)
  const data = await guaranteeService.accept(garageId(c), c.get('auth').sub, claimId)
  return c.json({ success: true, data })
}

export async function dispute(c: GarageContext, claimId: string, note: string) {
  refuseSupportSession(c)
  const data = await guaranteeService.dispute(garageId(c), c.get('auth').sub, claimId, note)
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminList(c: CustomerContext, query: AdminClaimsQuery) {
  const data = await guaranteeService.adminList(query)
  return c.json({ success: true, data })
}

export async function adminGet(c: CustomerContext, id: string) {
  const data = await guaranteeService.adminGet(id)
  return c.json({ success: true, data })
}

export async function decide(c: CustomerContext, id: string, input: DecideClaimInput) {
  const data = await guaranteeService.decide(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}
