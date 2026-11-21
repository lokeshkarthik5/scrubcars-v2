import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireOwnerForBackup,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { backupRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as controller from './garage-backup.controller.js'
import { backupPageQuerySchema, backupTableParamSchema, startBackupSchema } from './garage-backup.validation.js'

/**
 * Back up all garages (owner-approved screens, 18 Nov 2026), mounted at the
 * root of /api/v1/admin:
 *
 *   GET  /backup/last              "Last backup: 14 Nov, 9:12 pm by Mathew"
 *   GET  /backup                   the sheets, their row counts and columns
 *   POST /backup/started           { full } records the download; gives its id
 *   GET  /backup/:table?backup=&cursor=&full=0|1
 *                                  one page of one sheet, masked unless full=1
 *
 * Owner only: the owner's login or the shared break-glass login, as the
 * deletes; any other admin is 403 ADMIN_OWNER_ONLY, and garages and
 * customers never pass requireSuperAdmin. A page needs its download's audit
 * row (same admin, within two hours; full numbers only if it says so), so
 * every download is recorded before a row is read. Rate limited per admin.
 */
export const adminGarageBackupRoutes = new Hono<{ Variables: AuthVariables }>()

const owner = [authMiddleware, requireSuperAdmin, requireOwnerForBackup, backupRateLimiter] as const

adminGarageBackupRoutes.get('/backup/last', ...owner, (c) => controller.last(c))
adminGarageBackupRoutes.get('/backup', ...owner, (c) => controller.manifest(c))
adminGarageBackupRoutes.post('/backup/started', ...owner, adminSignedJson(startBackupSchema), (c) =>
  controller.start(c, c.req.valid('json'))
)
adminGarageBackupRoutes.get(
  '/backup/:table',
  ...owner,
  zValidator('param', backupTableParamSchema),
  zValidator('query', backupPageQuerySchema),
  (c) => controller.page(c, c.req.valid('param').table, c.req.valid('query'))
)
