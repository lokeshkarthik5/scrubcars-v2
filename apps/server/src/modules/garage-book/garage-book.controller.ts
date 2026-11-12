import type { Context } from 'hono'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { userIdFromSubject } from '../../lib/admin-actor.js'
import { garageBookService, type Viewer } from './garage-book.service.js'
import { garageBookRepository } from './garage-book.repository.js'
import { billsService } from './garage-book-bills.service.js'
import { expensesService } from './garage-book-expenses.service.js'
import { importService } from './garage-book-import.service.js'
import { linkService } from './garage-book-link.service.js'
import { momentsService } from './garage-book-moments.service.js'
import { paymentDetailsService } from './garage-book-pay.service.js'
import { stockService } from './garage-book-stock.service.js'
import { teamService } from './garage-book-team.service.js'
import type { PayQrType } from '../../lib/garage-pay-qr-storage.js'
import type {
  CreateExpenseInput,
  CreateMemberInput,
  CreateStockInput,
  ImportCommitInput,
  ImportExtractInput,
  LinkBookInput,
  PaymentDetailsInput,
  StockUsageInput,
  SupplierInput,
  SupplyOrderInput,
  UpdateExpenseInput,
  UpdateLinkInput,
  UpdateMemberInput,
  UpdateStockInput,
  UpdateSupplierInput,
} from './garage-book.validation.js'
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

// ─── Stages 2 and 3 (0073) ───────────────────────────────────────────────────

const ok = <T>(c: Context, data: T, status: 200 | 201 = 200) => c.json({ success: true, data }, status)

export async function team(c: GarageContext, month: string | undefined) {
  noStore(c)
  return ok(c, await teamService.team(viewer(c), month))
}
export async function createMember(c: GarageContext, input: CreateMemberInput) {
  return ok(c, await teamService.createMember(viewer(c), input), 201)
}
export async function updateMember(c: GarageContext, id: string, input: UpdateMemberInput) {
  return ok(c, await teamService.updateMember(viewer(c), id, input))
}
export async function deleteMember(c: GarageContext, id: string) {
  return ok(c, await teamService.deleteMember(viewer(c), id))
}
export async function setWorkers(c: GarageContext, ref: string, memberIds: string[]) {
  return ok(c, await teamService.setWorkers(viewer(c), ref, memberIds))
}

export async function expenses(c: GarageContext, month: string | undefined) {
  noStore(c)
  return ok(c, await expensesService.month(viewer(c), month))
}
export async function createExpense(c: GarageContext, input: CreateExpenseInput) {
  return ok(c, await expensesService.create(viewer(c), input), 201)
}
export async function updateExpense(c: GarageContext, id: string, input: UpdateExpenseInput) {
  return ok(c, await expensesService.update(viewer(c), id, input))
}
export async function deleteExpense(c: GarageContext, id: string) {
  return ok(c, await expensesService.remove(viewer(c), id))
}

export async function createBill(c: GarageContext, ref: string) {
  noStore(c)
  const bill = await billsService.create(viewer(c), ref)
  return ok(c, bill, bill.created ? 201 : 200)
}

export async function paymentDetails(c: GarageContext) {
  noStore(c)
  return ok(c, await paymentDetailsService.get(viewer(c)))
}
export async function payQrUpload(c: GarageContext, contentType: PayQrType) {
  noStore(c)
  return ok(c, await paymentDetailsService.uploadQr(viewer(c), contentType))
}
export async function savePaymentDetails(c: GarageContext, input: PaymentDetailsInput) {
  noStore(c)
  return ok(c, await paymentDetailsService.save(viewer(c), input))
}

export async function link(c: GarageContext) {
  noStore(c)
  return ok(c, await linkService.get(viewer(c)))
}
export async function updateLink(c: GarageContext, input: UpdateLinkInput) {
  return ok(c, await linkService.update(viewer(c), input))
}

export async function importExtract(c: GarageContext, input: ImportExtractInput) {
  noStore(c)
  return ok(c, await importService.extract(viewer(c), input))
}
export async function importCommit(c: GarageContext, input: ImportCommitInput) {
  return ok(c, await importService.commit(viewer(c), input))
}

export async function stock(c: GarageContext) {
  noStore(c)
  return ok(c, await stockService.stock(viewer(c)))
}
export async function stockItem(c: GarageContext, id: string) {
  noStore(c)
  return ok(c, await stockService.item(viewer(c), id))
}
export async function createStockItem(c: GarageContext, input: CreateStockInput) {
  return ok(c, await stockService.createItem(viewer(c), input), 201)
}
export async function updateStockItem(c: GarageContext, id: string, input: UpdateStockInput) {
  return ok(c, await stockService.updateItem(viewer(c), id, input))
}
export async function deleteStockItem(c: GarageContext, id: string) {
  return ok(c, await stockService.deleteItem(viewer(c), id))
}
export async function countStock(c: GarageContext, id: string, level: number) {
  return ok(c, await stockService.count(viewer(c), id, level))
}
export async function setStockUsage(c: GarageContext, id: string, rows: StockUsageInput) {
  return ok(c, await stockService.setUsage(viewer(c), id, rows))
}

export async function suppliers(c: GarageContext) {
  noStore(c)
  return ok(c, await stockService.suppliers(viewer(c)))
}
export async function createSupplier(c: GarageContext, input: SupplierInput) {
  return ok(c, await stockService.createSupplier(viewer(c), input), 201)
}
export async function updateSupplier(c: GarageContext, id: string, input: UpdateSupplierInput) {
  return ok(c, await stockService.updateSupplier(viewer(c), id, input))
}
export async function deleteSupplier(c: GarageContext, id: string) {
  return ok(c, await stockService.deleteSupplier(viewer(c), id))
}
export async function supplyOrders(c: GarageContext) {
  noStore(c)
  return ok(c, await stockService.orders(viewer(c)))
}
export async function createSupplyOrder(c: GarageContext, input: SupplyOrderInput) {
  return ok(c, await stockService.createOrder(viewer(c), input), 201)
}
export async function receiveSupplyOrder(c: GarageContext, id: string) {
  return ok(c, await stockService.receive(viewer(c), id))
}
export async function suppliesSuggest(c: GarageContext) {
  noStore(c)
  return ok(c, await stockService.suggest(viewer(c)))
}

export async function milestones(c: GarageContext) {
  noStore(c)
  return ok(c, await momentsService.milestone(viewer(c)))
}
export async function milestoneSeen(c: GarageContext, key: string) {
  return ok(c, await momentsService.markSeen(viewer(c), key))
}

// ─── Public pages (no sign-in) ───────────────────────────────────────────────

/** A public page's answer: never cached by a shared proxy, never indexed. */
function publicHeaders(c: Context) {
  c.header('Cache-Control', 'private, no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
}

export async function publicBill(c: Context, token: string) {
  publicHeaders(c)
  return ok(c, await billsService.publicBill(token))
}
export async function publicLinkPage(c: Context, slug: string) {
  publicHeaders(c)
  return ok(c, await linkService.page(slug))
}
export async function publicLinkBook(c: Context, slug: string, input: LinkBookInput) {
  publicHeaders(c)
  const result = await linkService.book(slug, input)
  return ok(c, result, result.detlio ? 200 : 201)
}
