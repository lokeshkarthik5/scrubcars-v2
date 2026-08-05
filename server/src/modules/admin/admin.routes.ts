import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  authMiddleware,
  requireAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { rateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as adminController from './admin.controller.js'
import {
  createVendorSchema,
  listBookingsQuerySchema,
  loginSchema,
  updateVendorSchema,
} from './admin.validation.js'

export const adminRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireAdmin] as const

const vendorIdParamSchema = z.object({ id: z.string().uuid() })

adminRoutes.post('/login', rateLimiter, zValidator('json', loginSchema), (c) =>
  adminController.login(c, c.req.valid('json'))
)
adminRoutes.post('/logout', adminController.logout)
adminRoutes.get('/me', ...adminMiddleware, adminController.getMe)

adminRoutes.get('/vendors', ...adminMiddleware, adminController.listVendors)
adminRoutes.post(
  '/vendors',
  ...adminMiddleware,
  zValidator('json', createVendorSchema),
  (c) => adminController.createVendor(c, c.req.valid('json'))
)
adminRoutes.get(
  '/vendors/:id',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.getVendor(c, c.req.valid('param').id)
)
adminRoutes.patch(
  '/vendors/:id',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', updateVendorSchema),
  (c) => adminController.updateVendor(c, c.req.valid('param').id, c.req.valid('json'))
)
adminRoutes.patch(
  '/vendors/:id/verify',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.verifyVendor(c, c.req.valid('param').id)
)
adminRoutes.patch(
  '/vendors/:id/archive',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.archiveVendor(c, c.req.valid('param').id)
)
adminRoutes.patch(
  '/vendors/:id/unarchive',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.unarchiveVendor(c, c.req.valid('param').id)
)
adminRoutes.delete(
  '/vendors/:id',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.deleteVendor(c, c.req.valid('param').id)
)

adminRoutes.get(
  '/bookings',
  ...adminMiddleware,
  zValidator('query', listBookingsQuerySchema),
  (c) => adminController.listBookings(c, c.req.valid('query'))
)
