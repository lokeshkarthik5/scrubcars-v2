import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import { authMiddleware, requireSuperAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import {
  aiImportRateLimiter,
  garageBookPublicRateLimiter,
  garageLinkBookRateLimiter,
} from '../../middleware/rate-limit.middleware.js'
import * as controller from './garage-book.controller.js'
import {
  adminVendorParamSchema,
  billTokenParamSchema,
  countStockSchema,
  createBillSchema,
  createExpenseSchema,
  createMemberSchema,
  createStockSchema,
  idParamSchema,
  importCommitSchema,
  importExtractSchema,
  jobRefParamSchema,
  linkBookSchema,
  milestoneKeyParamSchema,
  monthQuerySchema,
  paymentDetailsSchema,
  payQrUploadSchema,
  slugParamSchema,
  stockUsageSchema,
  supplierSchema,
  supplyOrderSchema,
  updateExpenseSchema,
  updateLinkSchema,
  updateMemberSchema,
  updateStockSchema,
  updateSupplierSchema,
  workersSchema,
  createCustomerSchema,
  createJobSchema,
  customerRefParamSchema,
  customersQuerySchema,
  jobIdParamSchema,
  markPaidSchema,
  reminderMessageSchema,
  statsQuerySchema,
  todayQuerySchema,
  updateCustomerSchema,
  updateJobSchema,
} from './garage-book.validation.js'

/**
 * Garage Book (0072): the garage's own book, at /api/v1/vendors/me/book.
 * Every route a 404 before auth while GARAGE_BOOK is off.
 *
 * Two seats. Any member (`seat`) adds and finishes jobs, sees customers and
 * sends reminders, and gets no money figure in any answer (the service
 * leaves them out for a vendor_operator). The owner (`owner`) also has Money
 * owed, Stats and the Excel download. A Detlio support session acts as the
 * owner, logged by resolveTenant.
 */
export const garageBookRoutes = new Hono<{ Variables: TenantVariables }>()

const on = notFoundUnless(() => env.garageBook)
const seat = [on, authMiddleware, resolveTenant, requireVendorRole('vendor_admin', 'vendor_operator')] as const
const owner = [on, authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

garageBookRoutes.get('/today', ...seat, zValidator('query', todayQuerySchema), (c) =>
  controller.today(c, c.req.valid('query').date)
)

garageBookRoutes.get('/services', ...seat, controller.services)

garageBookRoutes.post('/jobs', ...seat, zValidator('json', createJobSchema), (c) =>
  controller.createJob(c, c.req.valid('json'))
)
garageBookRoutes.patch(
  '/jobs/:id',
  ...seat,
  zValidator('param', jobIdParamSchema),
  zValidator('json', updateJobSchema),
  (c) => controller.updateJob(c, c.req.valid('param').id, c.req.valid('json'))
)

garageBookRoutes.get('/customers', ...seat, zValidator('query', customersQuerySchema), (c) =>
  controller.customers(c, c.req.valid('query'))
)
garageBookRoutes.post('/customers', ...seat, zValidator('json', createCustomerSchema), (c) =>
  controller.createCustomer(c, c.req.valid('json'))
)
garageBookRoutes.get('/customers/:id', ...seat, zValidator('param', customerRefParamSchema), (c) =>
  controller.customer(c, c.req.valid('param').id)
)
garageBookRoutes.patch(
  '/customers/:id',
  ...seat,
  zValidator('param', customerRefParamSchema),
  zValidator('json', updateCustomerSchema),
  (c) => controller.updateCustomer(c, c.req.valid('param').id, c.req.valid('json'))
)

garageBookRoutes.get('/reminders', ...seat, controller.reminders)
garageBookRoutes.put('/reminders/message', ...seat, zValidator('json', reminderMessageSchema), (c) =>
  controller.saveMessage(c, c.req.valid('json'))
)
garageBookRoutes.post('/reminders/:id/send', ...seat, zValidator('param', customerRefParamSchema), (c) =>
  controller.sendReminder(c, c.req.valid('param').id)
)

garageBookRoutes.get('/owed', ...owner, controller.owed)
garageBookRoutes.post(
  '/owed/:id/paid',
  ...owner,
  zValidator('param', customerRefParamSchema),
  zValidator('json', markPaidSchema),
  (c) => controller.markPaid(c, c.req.valid('param').id, c.req.valid('json'))
)
garageBookRoutes.get('/stats', ...owner, zValidator('query', statsQuerySchema), (c) =>
  controller.stats(c, c.req.valid('query'))
)
garageBookRoutes.get('/export.xlsx', ...owner, controller.exportBook)

// ─── Stages 2 and 3 (0073) ───────────────────────────────────────────────────
//
// Owner only: money (Expenses, the team's pay, Bills, Payment details, the
// booking link's settings, supply orders and prices, Import). Any seat: the
// team list without money, "who did it", stock levels and "Count it"
// without prices (the services leave the money out for staff).

// Team
garageBookRoutes.get('/team', ...seat, zValidator('query', monthQuerySchema), (c) =>
  controller.team(c, c.req.valid('query').month)
)
garageBookRoutes.post('/team', ...owner, zValidator('json', createMemberSchema), (c) =>
  controller.createMember(c, c.req.valid('json'))
)
garageBookRoutes.patch('/team/:id', ...owner, zValidator('param', idParamSchema), zValidator('json', updateMemberSchema), (c) =>
  controller.updateMember(c, c.req.valid('param').id, c.req.valid('json'))
)
garageBookRoutes.delete('/team/:id', ...owner, zValidator('param', idParamSchema), (c) =>
  controller.deleteMember(c, c.req.valid('param').id)
)
garageBookRoutes.put('/jobs/:ref/workers', ...seat, zValidator('param', jobRefParamSchema), zValidator('json', workersSchema), (c) =>
  controller.setWorkers(c, c.req.valid('param').ref, c.req.valid('json').memberIds)
)

// Expenses
garageBookRoutes.get('/expenses', ...owner, zValidator('query', monthQuerySchema), (c) =>
  controller.expenses(c, c.req.valid('query').month)
)
garageBookRoutes.post('/expenses', ...owner, zValidator('json', createExpenseSchema), (c) =>
  controller.createExpense(c, c.req.valid('json'))
)
garageBookRoutes.patch('/expenses/:id', ...owner, zValidator('param', idParamSchema), zValidator('json', updateExpenseSchema), (c) =>
  controller.updateExpense(c, c.req.valid('param').id, c.req.valid('json'))
)
garageBookRoutes.delete('/expenses/:id', ...owner, zValidator('param', idParamSchema), (c) =>
  controller.deleteExpense(c, c.req.valid('param').id)
)

// Bills
garageBookRoutes.post('/bills', ...owner, zValidator('json', createBillSchema), (c) =>
  controller.createBill(c, c.req.valid('json').ref)
)

// Payment details
garageBookRoutes.get('/payment-details', ...owner, controller.paymentDetails)
garageBookRoutes.post('/payment-details/qr/upload', ...owner, zValidator('json', payQrUploadSchema), (c) =>
  controller.payQrUpload(c, c.req.valid('json').contentType)
)
garageBookRoutes.put('/payment-details', ...owner, zValidator('json', paymentDetailsSchema), (c) =>
  controller.savePaymentDetails(c, c.req.valid('json'))
)

// Booking link
garageBookRoutes.get('/link', ...owner, controller.link)
garageBookRoutes.put('/link', ...owner, zValidator('json', updateLinkSchema), (c) =>
  controller.updateLink(c, c.req.valid('json'))
)

// Bring in your book. A photo read is a paid AI request: rate limited per person.
garageBookRoutes.post('/import/extract', ...owner, aiImportRateLimiter, zValidator('json', importExtractSchema), (c) =>
  controller.importExtract(c, c.req.valid('json'))
)
garageBookRoutes.post('/import/commit', ...owner, zValidator('json', importCommitSchema), (c) =>
  controller.importCommit(c, c.req.valid('json'))
)

// Stock
garageBookRoutes.get('/stock', ...seat, controller.stock)
garageBookRoutes.post('/stock', ...owner, zValidator('json', createStockSchema), (c) =>
  controller.createStockItem(c, c.req.valid('json'))
)
garageBookRoutes.get('/stock/:id', ...seat, zValidator('param', idParamSchema), (c) =>
  controller.stockItem(c, c.req.valid('param').id)
)
garageBookRoutes.patch('/stock/:id', ...owner, zValidator('param', idParamSchema), zValidator('json', updateStockSchema), (c) =>
  controller.updateStockItem(c, c.req.valid('param').id, c.req.valid('json'))
)
garageBookRoutes.delete('/stock/:id', ...owner, zValidator('param', idParamSchema), (c) =>
  controller.deleteStockItem(c, c.req.valid('param').id)
)
garageBookRoutes.post('/stock/:id/count', ...seat, zValidator('param', idParamSchema), zValidator('json', countStockSchema), (c) =>
  controller.countStock(c, c.req.valid('param').id, c.req.valid('json').level)
)
garageBookRoutes.put('/stock/:id/usage', ...owner, zValidator('param', idParamSchema), zValidator('json', stockUsageSchema), (c) =>
  controller.setStockUsage(c, c.req.valid('param').id, c.req.valid('json'))
)

// Suppliers and supply orders
garageBookRoutes.get('/suppliers', ...owner, controller.suppliers)
garageBookRoutes.post('/suppliers', ...owner, zValidator('json', supplierSchema), (c) =>
  controller.createSupplier(c, c.req.valid('json'))
)
garageBookRoutes.patch('/suppliers/:id', ...owner, zValidator('param', idParamSchema), zValidator('json', updateSupplierSchema), (c) =>
  controller.updateSupplier(c, c.req.valid('param').id, c.req.valid('json'))
)
garageBookRoutes.delete('/suppliers/:id', ...owner, zValidator('param', idParamSchema), (c) =>
  controller.deleteSupplier(c, c.req.valid('param').id)
)
garageBookRoutes.get('/supplies/orders', ...owner, controller.supplyOrders)
garageBookRoutes.post('/supplies/orders', ...owner, zValidator('json', supplyOrderSchema), (c) =>
  controller.createSupplyOrder(c, c.req.valid('json'))
)
garageBookRoutes.post('/supplies/orders/:id/received', ...owner, zValidator('param', idParamSchema), (c) =>
  controller.receiveSupplyOrder(c, c.req.valid('param').id)
)
garageBookRoutes.get('/supplies/suggest', ...owner, controller.suppliesSuggest)

// Moments: milestones (moment 6)
garageBookRoutes.get('/milestones', ...owner, controller.milestones)
garageBookRoutes.post('/milestones/:key/seen', ...owner, zValidator('param', milestoneKeyParamSchema), (c) =>
  controller.milestoneSeen(c, c.req.valid('param').key)
)

/**
 * /api/v1/public: Garage Book's two public pages, no sign-in. A 404 while
 * GARAGE_BOOK is off, as everything else in the book.
 *
 *   GET  /bills/:token     a bill's page (detlio.com/b/<token>)
 *   GET  /g/:slug          a garage's booking page (detlio.com/g/<slug>)
 *   POST /g/:slug/book     booking on it: no OTP, so limited per address
 *                          here and per phone in the service
 *
 * Neither answer ever carries a Detlio customer's phone.
 */
export const publicGarageBookRoutes = new Hono()

publicGarageBookRoutes.get('/bills/:token', on, garageBookPublicRateLimiter, zValidator('param', billTokenParamSchema), (c) =>
  controller.publicBill(c, c.req.valid('param').token)
)
publicGarageBookRoutes.get('/g/:slug', on, garageBookPublicRateLimiter, zValidator('param', slugParamSchema), (c) =>
  controller.publicLinkPage(c, c.req.valid('param').slug)
)
publicGarageBookRoutes.post(
  '/g/:slug/book',
  on,
  garageLinkBookRateLimiter,
  zValidator('param', slugParamSchema),
  zValidator('json', linkBookSchema),
  (c) => controller.publicLinkBook(c, c.req.valid('param').slug, c.req.valid('json'))
)

/**
 * GET /api/v1/admin/vendors/:id/book: Detlio staff's read-only view of a
 * garage's book (owner decision 4: Detlio can see all of it). Logged in
 * internal_access_log (or admin_audit_log for a personal admin login),
 * before it is read.
 */
export const adminGarageBookRoutes = new Hono<{ Variables: AuthVariables }>()

adminGarageBookRoutes.get(
  '/vendors/:id/book',
  on,
  authMiddleware,
  requireSuperAdmin,
  zValidator('param', adminVendorParamSchema),
  (c) => controller.adminView(c, c.req.valid('param').id)
)
