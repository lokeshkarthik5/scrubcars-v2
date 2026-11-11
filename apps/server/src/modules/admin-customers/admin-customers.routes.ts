import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireOwner,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './admin-customers.controller.js'
import {
  customerIdParamSchema,
  customerSearchQuerySchema,
  deleteCustomerSchema,
} from './admin-customers.validation.js'

/**
 * The Customers page (owner, 10 Nov 2026), mounted at /api/v1/admin/customers:
 *
 *   GET    /?q=            search by phone or name (any super-admin)
 *   GET    /:id            one customer (any super-admin)
 *   GET    /:id/deletion   what Delete customer account would do (any super-admin)
 *   DELETE /:id            Delete customer account { confirmText: their phone } (owner only)
 *
 * The delete is the customer's own anonymise (modules/account), run from
 * admin: only a garage owner is refused, everything else open is ended
 * quietly first. 403 ADMIN_OWNER_ONLY for any admin but the owner.
 */
export const adminCustomerRoutes = new Hono<{ Variables: AuthVariables }>()

const admin = [authMiddleware, requireSuperAdmin] as const
const idParam = zValidator('param', customerIdParamSchema)

adminCustomerRoutes.get('/', ...admin, zValidator('query', customerSearchQuerySchema), (c) =>
  controller.search(c, c.req.valid('query'))
)
adminCustomerRoutes.get('/:id', ...admin, idParam, (c) => controller.getCustomer(c, c.req.valid('param').id))
adminCustomerRoutes.get('/:id/deletion', ...admin, idParam, (c) =>
  controller.deletionPreview(c, c.req.valid('param').id)
)
adminCustomerRoutes.delete('/:id', ...admin, requireOwner, idParam, adminSignedJson(deleteCustomerSchema), (c) =>
  controller.deleteCustomer(c, c.req.valid('param').id, c.req.valid('json'))
)
