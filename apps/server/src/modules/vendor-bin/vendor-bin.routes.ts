import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
  adminSignedJson,
} from '../../middleware/auth.middleware.js'
import * as vendorBinController from './vendor-bin.controller.js'
import {
  binVendorSchema,
  deleteVendorForeverSchema,
  restoreVendorSchema,
  vendorIdParamSchema,
} from './vendor-bin.validation.js'

// The garage Bin: moving a garage there, restoring it, and deleting it
// forever from there (lib/vendor-bin.ts has the rules). Mounted at the root
// of /api/v1/admin (see admin.routes.ts), beside the other /vendors routes,
// because the admin session cookie is scoped to path=/api/v1/admin.
// Super-admin only, every write audited with the name the person typed.
export const adminVendorBinRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

// What moving it to the Bin would cancel: its bookings still to happen, and
// which are paid. Reads only.
adminVendorBinRoutes.get(
  '/vendors/:id/bin-preview',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => vendorBinController.binPreview(c, c.req.valid('param').id)
)

adminVendorBinRoutes.post(
  '/vendors/:id/bin',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(binVendorSchema),
  (c) => vendorBinController.bin(c, c.req.valid('param').id, c.req.valid('json'))
)

adminVendorBinRoutes.post(
  '/vendors/:id/restore',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(restoreVendorSchema),
  (c) => vendorBinController.restore(c, c.req.valid('param').id, c.req.valid('json'))
)

// What Delete forever would delete and keep, with the fingerprint the delete
// must match. Reads only.
adminVendorBinRoutes.get(
  '/vendors/:id/delete-preview',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => vendorBinController.deletePreview(c, c.req.valid('param').id)
)

// Delete forever. Only for a garage in the Bin, with its name typed out; the
// old outright delete (refused for any garage with bookings) is gone.
adminVendorBinRoutes.delete(
  '/vendors/:id',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  adminSignedJson(deleteVendorForeverSchema),
  (c) => vendorBinController.deleteForever(c, c.req.valid('param').id, c.req.valid('json'))
)
