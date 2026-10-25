import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from '../../lib/env.js'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { notFoundUnless } from '../../middleware/feature-switch.middleware.js'
import * as giftCreditController from './gift-credit.controller.js'
import {
  adjustCreditSchema,
  customerIdParamSchema,
  findCustomerSchema,
} from './gift-credit.validation.js'

/** Off with the rest of Gift a wash (GIFTS_ENABLED): a 404 before auth runs. */
const giftsOn = notFoundUnless(() => env.giftsEnabled)

/**
 * The customer's own Detlio credit. Mounted at /users/me/credit
 * (users.routes.ts), after that file's authMiddleware + requireCustomer.
 */
export const customerCreditRoutes = new Hono<{ Variables: AuthVariables }>()

customerCreditRoutes.get('/', giftsOn, giftCreditController.getMyCredit)

/**
 * Admin → Gifts → Customer credit: the customers holding credit, one
 * customer's credit found by phone (in the body), and a manual adjustment
 * with a reason and the typed name, written to admin_audit_log. Super-admin
 * only; mounted at /admin/gifts/credit (admin.routes.ts).
 */
export const adminCreditRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [giftsOn, authMiddleware, requireSuperAdmin] as const

adminCreditRoutes.get('/balances', ...adminMiddleware, giftCreditController.adminBalances)
adminCreditRoutes.post('/find', ...adminMiddleware, zValidator('json', findCustomerSchema), (c) =>
  giftCreditController.adminFind(c, c.req.valid('json').phone)
)
adminCreditRoutes.get('/customers/:userId', ...adminMiddleware, zValidator('param', customerIdParamSchema), (c) =>
  giftCreditController.adminCustomer(c, c.req.valid('param').userId)
)
adminCreditRoutes.post(
  '/customers/:userId/adjust',
  ...adminMiddleware,
  zValidator('param', customerIdParamSchema),
  zValidator('json', adjustCreditSchema),
  (c) => giftCreditController.adminAdjust(c, c.req.valid('param').userId, c.req.valid('json'))
)
