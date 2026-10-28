import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { bookingRequestsService } from './booking-requests.service.js'
import type {
  AcceptRequestInput,
  AdminCancelRequestInput,
  AdminRequestsQuery,
  CreateRequestInput,
  GarageRequestsQuery,
  WindowsQuery,
} from './booking-requests.validation.js'

type CustomerContext = Context<{ Variables: AuthVariables }>
type GarageContext = Context<{ Variables: TenantVariables }>

/** The signed-in customer: the only user a request is ever made or read for. */
function customerId(c: CustomerContext): string {
  return c.get('auth').sub
}

/** The garage resolveTenant produced: never a parameter. */
function garageId(c: GarageContext): string {
  return getTenant(c).vendorId
}

// ─── Public ──────────────────────────────────────────────────────────────────

export async function windows(c: Context, query: WindowsQuery) {
  const data = await bookingRequestsService.windows(query)
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data })
}

// ─── The customer ────────────────────────────────────────────────────────────

export async function create(c: CustomerContext, input: CreateRequestInput) {
  const data = await bookingRequestsService.create(customerId(c), input)
  return c.json({ success: true, data }, 201)
}

export async function listMine(c: CustomerContext) {
  const data = await bookingRequestsService.listForCustomer(customerId(c))
  return c.json({ success: true, data: { items: data } })
}

export async function getMine(c: CustomerContext, id: string) {
  const data = await bookingRequestsService.getForCustomer(customerId(c), id)
  return c.json({ success: true, data })
}

export async function cancelMine(c: CustomerContext, id: string) {
  const data = await bookingRequestsService.cancel(customerId(c), id)
  return c.json({ success: true, data })
}

// ─── The garage ──────────────────────────────────────────────────────────────

export async function listForGarage(c: GarageContext, query: GarageRequestsQuery) {
  // What the garage earns is money: the owner seat's alone, like Earnings.
  const isOwner = getTenant(c).role === 'vendor_admin'
  const data = await bookingRequestsService.listForGarage(garageId(c), isOwner, query.scope)
  return c.json({ success: true, data })
}

export async function waitingCount(c: GarageContext) {
  const data = await bookingRequestsService.waitingCount(garageId(c))
  return c.json({ success: true, data })
}

export async function startTimes(c: GarageContext, id: string) {
  const data = await bookingRequestsService.startTimes(garageId(c), id)
  return c.json({ success: true, data })
}

export async function accept(c: GarageContext, id: string, input: AcceptRequestInput) {
  // The answer carries `earn` for the owner seat only, as the list does.
  const isOwner = getTenant(c).role === 'vendor_admin'
  const data = await bookingRequestsService.accept(garageId(c), c.get('auth').sub, id, input, isOwner)
  return c.json({ success: true, data })
}

export async function decline(c: GarageContext, id: string) {
  const data = await bookingRequestsService.decline(garageId(c), c.get('auth').sub, id)
  return c.json({ success: true, data })
}

// ─── Admin (0064) ────────────────────────────────────────────────────────────

export async function listForAdmin(c: CustomerContext, query: AdminRequestsQuery) {
  const data = await bookingRequestsService.listForAdmin({ filter: query.filter, zoneSlug: query.zone })
  return c.json({ success: true, data })
}

export async function cancelByAdmin(c: CustomerContext, id: string, input: AdminCancelRequestInput) {
  const data = await bookingRequestsService.cancelByAdmin(id, {
    reason: input.reason,
    actorName: input.actorName,
    actorSub: c.get('auth').sub,
  })
  return c.json({ success: true, data })
}
