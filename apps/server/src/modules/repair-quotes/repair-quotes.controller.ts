import type { Context } from 'hono'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { repairQuotesService } from './repair-quotes.service.js'
import type { AdminListQuery, AnswerInput, BriefInput, CreateRequestInput, UploadUrlInput } from './repair-quotes.validation.js'

type CustomerContext = Context<{ Variables: AuthVariables }>
type GarageContext = Context<{ Variables: TenantVariables }>
type AdminContext = Context<{ Variables: AuthVariables }>

/** The signed-in customer: the only user a request is ever made or read for. */
const customerId = (c: CustomerContext) => c.get('auth').sub

/** The garage resolveTenant produced: never a parameter. */
const garageId = (c: GarageContext) => getTenant(c).vendorId

// ─── Public ──────────────────────────────────────────────────────────────────

export function config(c: Context) {
  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ success: true, data: repairQuotesService.config() })
}

// ─── The customer ────────────────────────────────────────────────────────────

export async function uploadUrl(c: CustomerContext, input: UploadUrlInput) {
  const data = await repairQuotesService.uploadUrl(customerId(c), input)
  return c.json({ success: true, data })
}

export async function brief(c: CustomerContext, input: BriefInput) {
  const data = await repairQuotesService.brief(customerId(c), input)
  return c.json({ success: true, data })
}

export async function create(c: CustomerContext, input: CreateRequestInput) {
  const data = await repairQuotesService.create(customerId(c), input)
  return c.json({ success: true, data }, 201)
}

export async function listMine(c: CustomerContext) {
  const data = await repairQuotesService.listMine(customerId(c))
  return c.json({ success: true, data })
}

export async function getMine(c: CustomerContext, id: string) {
  const data = await repairQuotesService.getMine(customerId(c), id)
  return c.json({ success: true, data })
}

export async function cancelMine(c: CustomerContext, id: string) {
  const data = await repairQuotesService.cancelMine(customerId(c), id)
  return c.json({ success: true, data })
}

export async function nextFree(c: CustomerContext, id: string, quoteId: string) {
  const data = await repairQuotesService.nextFree(customerId(c), id, quoteId)
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data })
}

export async function book(c: CustomerContext, id: string, quoteId: string, scheduledAt: string) {
  const data = await repairQuotesService.book(customerId(c), id, quoteId, scheduledAt)
  return c.json({ success: true, data }, 201)
}

// ─── The garage ──────────────────────────────────────────────────────────────

export async function listForGarage(c: GarageContext, scope: 'open' | 'closed') {
  const data = await repairQuotesService.listForGarage(garageId(c), scope)
  return c.json({ success: true, data })
}

export async function waitingCount(c: GarageContext) {
  const data = await repairQuotesService.waitingCount(garageId(c))
  return c.json({ success: true, data })
}

export async function answer(c: GarageContext, quoteId: string, input: AnswerInput) {
  const data = await repairQuotesService.answer(garageId(c), c.get('auth').sub, quoteId, input)
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listForAdmin(c: AdminContext, query: AdminListQuery) {
  const data = await repairQuotesService.listForAdmin(query)
  return c.json({ success: true, data })
}

export async function garageSetting(c: AdminContext, vendorId: string) {
  const data = await repairQuotesService.garageSetting(vendorId)
  return c.json({ success: true, data })
}

export async function setGarageSetting(c: AdminContext, vendorId: string, enabled: boolean) {
  const data = await repairQuotesService.setGarageSetting(vendorId, enabled, signedInAdmin(c).name)
  return c.json({ success: true, data })
}
