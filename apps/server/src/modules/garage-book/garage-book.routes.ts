import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import { authMiddleware, requireSuperAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as controller from './garage-book.controller.js'
import {
  adminVendorParamSchema,
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
 * Garage Book (0069): the garage's own book, at /api/v1/vendors/me/book.
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
