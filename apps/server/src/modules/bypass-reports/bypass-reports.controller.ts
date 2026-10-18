import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { bypassReportsService } from './bypass-reports.service.js'
import type {
  ConfirmBypassReportInput,
  CreateBypassReportInput,
  DismissBypassReportInput,
  ListBypassReportsQuery,
} from './bypass-reports.validation.js'

type BypassContext = Context<{ Variables: AuthVariables }>

// ─── The customer's own ──────────────────────────────────────────────────────

/** The signed-in customer: the only user id a report is ever written or read for. */
function getUserId(c: BypassContext): string {
  return c.get('auth').sub
}

export async function createReport(c: BypassContext, input: CreateBypassReportInput) {
  const data = await bypassReportsService.submit(getUserId(c), input)
  return c.json({ success: true, data }, 201)
}

export async function listMyReports(c: BypassContext) {
  const data = await bypassReportsService.listMine(getUserId(c))
  return c.json({ success: true, data })
}

export async function getBookingStatus(c: BypassContext, bookingId: string) {
  const data = await bypassReportsService.statusForBooking(getUserId(c), bookingId)
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────
// Each action takes the token's subject, so the audit row names the session.

export async function listReports(c: BypassContext, query: ListBypassReportsQuery) {
  const data = await bypassReportsService.list(query)
  return c.json({ success: true, data })
}

export async function getReport(c: BypassContext, id: string) {
  const data = await bypassReportsService.get(id)
  return c.json({ success: true, data })
}

export async function confirmReport(c: BypassContext, id: string, input: ConfirmBypassReportInput) {
  const data = await bypassReportsService.confirm(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}

export async function dismissReport(c: BypassContext, id: string, input: DismissBypassReportInput) {
  const data = await bypassReportsService.dismiss(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}

export async function getGarageStrikes(c: BypassContext, vendorId: string) {
  const data = await bypassReportsService.forGarage(vendorId)
  return c.json({ success: true, data })
}

export async function getDropOff(c: BypassContext) {
  const data = await bypassReportsService.dropOff()
  return c.json({ success: true, data })
}
