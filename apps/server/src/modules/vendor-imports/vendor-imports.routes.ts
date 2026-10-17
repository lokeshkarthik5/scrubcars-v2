import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { aiImportRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as vendorImportsController from './vendor-imports.controller.js'
import { extractImportSchema, ownerAccountSchema } from './vendor-imports.validation.js'

// Add garage's import. Mounted under /api/v1/admin/vendor-imports (see
// admin.routes.ts) for the same cookie reason as discounts: the admin
// session cookie is scoped to path=/api/v1/admin. Super-admin only.
export const adminVendorImportRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

// Photos and PDFs (read by the AI) or a Tally responses file (read by fixed
// rules) in, drafts of the garage out. Saves nothing; the files are never
// stored. Rate limited per admin: each photo read is a paid request.
adminVendorImportRoutes.post(
  '/extract',
  ...adminMiddleware,
  aiImportRateLimiter,
  zValidator('json', extractImportSchema),
  (c) => vendorImportsController.extract(c, c.req.valid('json'))
)

// Who an owner phone already belongs to, so the form can say whose account
// Create will attach the garage to. A POST, though it changes nothing, so
// the phone number travels in the body and never sits in a URL (or the
// platform's request logs).
adminVendorImportRoutes.post(
  '/owner-account',
  ...adminMiddleware,
  zValidator('json', ownerAccountSchema),
  (c) => vendorImportsController.ownerAccount(c, c.req.valid('json'))
)
