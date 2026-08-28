import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  requireCustomer,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { rateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as discountsController from './discounts.controller.js'
import {
  createDiscountSchema,
  discountIdParamSchema,
  listDiscountsQuerySchema,
  updateDiscountSchema,
  validateDiscountSchema,
} from './discounts.validation.js'

// Customer-facing preview. Rate limited on top of the global limiter: a code
// endpoint is the one place in this API where guessing is worth something.
export const discountsRoutes = new Hono<{ Variables: AuthVariables }>()

discountsRoutes.post(
  '/validate',
  rateLimiter,
  authMiddleware,
  requireCustomer,
  zValidator('json', validateDiscountSchema),
  (c) => discountsController.validateDiscount(c, c.req.valid('json'))
)

// Admin CRUD. Mounted under /api/v1/admin/discounts (see admin.routes.ts) —
// the admin session cookie is scoped to path=/api/v1/admin, so these routes
// cannot live anywhere else or the browser will not send it.
export const adminDiscountRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminDiscountRoutes.get(
  '/',
  ...adminMiddleware,
  zValidator('query', listDiscountsQuerySchema),
  (c) => discountsController.listDiscounts(c, c.req.valid('query'))
)

// Registered before '/:id' so "vendors" is never read as a discount id.
adminDiscountRoutes.get(
  '/vendors',
  ...adminMiddleware,
  discountsController.listVendorOptions
)

adminDiscountRoutes.post(
  '/',
  ...adminMiddleware,
  zValidator('json', createDiscountSchema),
  (c) => discountsController.createDiscount(c, c.req.valid('json'))
)

adminDiscountRoutes.get(
  '/:id',
  ...adminMiddleware,
  zValidator('param', discountIdParamSchema),
  (c) => discountsController.getDiscount(c, c.req.valid('param').id)
)

adminDiscountRoutes.patch(
  '/:id',
  ...adminMiddleware,
  zValidator('param', discountIdParamSchema),
  zValidator('json', updateDiscountSchema),
  (c) =>
    discountsController.updateDiscount(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)

adminDiscountRoutes.delete(
  '/:id',
  ...adminMiddleware,
  zValidator('param', discountIdParamSchema),
  (c) => discountsController.deleteDiscount(c, c.req.valid('param').id)
)
