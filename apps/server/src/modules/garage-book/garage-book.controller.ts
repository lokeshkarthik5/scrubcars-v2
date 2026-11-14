import type { Context } from 'hono'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { userIdFromSubject } from '../../lib/admin-actor.js'
import { garageBookService, type Viewer } from './garage-book.service.js'
import { garageBookRepository } from './garage-book.repository.js'
import type {
  CreateCustomerInput,
  CreateJobInput,
  CustomersQuery,
  MarkPaidInput,
  ReminderMessageInput,
  StatsQuery,
  UpdateCustomerInput,
  UpdateJobInput,
} from './garage-book.validation.js'

type GarageContext = Context<{ Variables: TenantVariables }>
type AdminContext = Context<{ Variables: AuthVariables }>

/** The garage resolveTenant produced, the person and their seat: never a parameter. */
function viewer(c: GarageContext): Viewer {
  const tenant = getTenant(c)
  return { vendorId: tenant.vendorId, userId: c.get('auth').sub, role: tenant.role }
}

// Money and phone numbers are never cached on a shared device or proxy.
function noStore(c: Context) {
  c.header('Cache-Control', 'private, no-store')
}

export async function today(c: GarageContext, date: string | undefined) {
  noStore(c)
  return c.json({ success: true, data: await garageBookService.today(viewer(c), date) })
}

export async function services(c: GarageContext) {
  return c.json({ success: true, data: await garageBookService.services(viewer(c)) })
}

export async function createJob(c: GarageContext, input: CreateJobInput) {
  const { job, created } = await garageBookService.createJob(viewer(c), input)
  // 201 for a new job; 200 for a resend of one already written.
  return c.json({ success: true, data: { ...job, created } }, created ? 201 : 200)
}

export async function updateJob(c: GarageContext, id: string, input: UpdateJobInput) {
  return c.json({ success: true, data: await garageBookService.updateJob(viewer(c), id, input) })
}

export async function customers(c: GarageContext, query: CustomersQuery) {
  noStore(c)
  return c.json({ success: true, data: await garageBookService.customers(viewer(c), query) })
}

export async function customer(c: GarageContext, id: string) {
  noStore(c)
  return c.json({ success: true, data: await garageBookService.customer(viewer(c), id) })
}

export async function createCustomer(c: GarageContext, input: CreateCustomerInput) {
  return c.json({ success: true, data: await garageBookService.createCustomer(viewer(c), input) }, 201)
}

export async function updateCustomer(c: GarageContext, id: string, input: UpdateCustomerInput) {
  return c.json({ success: true, data: await garageBookService.updateCustomer(viewer(c), id, input) })
}

export async function reminders(c: GarageContext) {
  noStore(c)
  return c.json({ success: true, data: await garageBookService.reminders(viewer(c)) })
}

export async function saveMessage(c: GarageContext, input: ReminderMessageInput) {
  return c.json({ success: true, data: await garageBookService.saveMessage(viewer(c), input) })
}

export async function sendReminder(c: GarageContext, id: string) {
  return c.json({ success: true, data: await garageBookService.sendReminder(viewer(c), id) })
}

export async function owed(c: GarageContext) {
  noStore(c)
  return c.json({ success: true, data: await garageBookService.owed(viewer(c)) })
}

export async function markPaid(c: GarageContext, id: string, input: MarkPaidInput) {
  return c.json({ success: true, data: await garageBookService.markPaid(viewer(c), id, input) })
}

export async function stats(c: GarageContext, query: StatsQuery) {
  noStore(c)
  return c.json({ success: true, data: await garageBookService.stats(viewer(c), query) })
}

export async function exportBook(c: GarageContext) {
  const { bytes, filename } = await garageBookService.exportBook(viewer(c))
  noStore(c)
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(bytes as unknown as ArrayBuffer)
}

/** Detlio staff's read-only look at a garage's book, logged before it is read. */
export async function adminView(c: AdminContext, vendorId: string) {
  const actor = signedInAdmin(c)
  await garageBookRepository.logAdminAccess({
    userId: userIdFromSubject(actor.sub),
    actorSub: actor.sub,
    actorName: actor.name,
    vendorId,
    endpoint: c.req.path,
  })
  noStore(c)
  return c.json({ success: true, data: await garageBookService.adminView(vendorId) })
}
