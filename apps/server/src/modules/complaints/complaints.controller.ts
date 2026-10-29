import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { complaintsService } from './complaints.service.js'
import type {
  CloseComplaintInput,
  ComplaintAdminNoteInput,
  ComplaintLookupQuery,
  CreateComplaintInput,
  ListComplaintsQuery,
  LogComplaintInput,
  LoggedInErrorInput,
  ResolveComplaintInput,
} from './complaints.validation.js'

type ComplaintsContext = Context<{ Variables: AuthVariables }>

// ─── The customer's own ──────────────────────────────────────────────────────

/** The signed-in customer: the only user id a complaint is ever written or read for. */
function getUserId(c: ComplaintsContext): string {
  return c.get('auth').sub
}

export async function createComplaint(c: ComplaintsContext, input: CreateComplaintInput) {
  const data = await complaintsService.submit(getUserId(c), input)
  return c.json({ success: true, data }, 201)
}

export async function withdrawMyComplaint(c: ComplaintsContext, id: string) {
  const data = await complaintsService.withdraw(getUserId(c), id)
  return c.json({ success: true, data })
}

export async function listMyComplaints(c: ComplaintsContext) {
  const data = await complaintsService.listMine(getUserId(c))
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listComplaints(c: ComplaintsContext, query: ListComplaintsQuery) {
  const data = await complaintsService.list(query)
  return c.json({ success: true, data })
}

export async function logComplaint(c: ComplaintsContext, input: LogComplaintInput) {
  const data = await complaintsService.log(input)
  return c.json({ success: true, data }, 201)
}

export async function lookupForLog(c: ComplaintsContext, query: ComplaintLookupQuery) {
  const data = await complaintsService.lookup(query)
  return c.json({ success: true, data })
}

export async function getComplaint(c: ComplaintsContext, id: string) {
  const data = await complaintsService.get(id)
  return c.json({ success: true, data })
}

// Each action takes the token's subject, so the complaint names who did it.

export async function acknowledgeComplaint(c: ComplaintsContext, id: string) {
  const data = await complaintsService.acknowledge(c.get('auth').sub, id)
  return c.json({ success: true, data })
}

export async function resolveComplaint(c: ComplaintsContext, id: string, input: ResolveComplaintInput) {
  const data = await complaintsService.resolve(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}

export async function closeComplaint(c: ComplaintsContext, id: string, input: CloseComplaintInput) {
  const data = await complaintsService.close(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}

export async function setComplaintAdminNote(
  c: ComplaintsContext,
  id: string,
  input: ComplaintAdminNoteInput
) {
  const data = await complaintsService.setAdminNote(id, input)
  return c.json({ success: true, data })
}

export async function markLoggedInError(c: ComplaintsContext, id: string, input: LoggedInErrorInput) {
  const data = await complaintsService.markLoggedInError(c.get('auth').sub, id, input)
  return c.json({ success: true, data })
}

export async function undoLoggedInError(c: ComplaintsContext, id: string, actorName: string) {
  const data = await complaintsService.undoLoggedInError(c.get('auth').sub, id, actorName)
  return c.json({ success: true, data })
}
