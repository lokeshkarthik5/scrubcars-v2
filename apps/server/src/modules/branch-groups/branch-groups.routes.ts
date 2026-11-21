import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './branch-groups.controller.js'
import {
  branchServicesApplySchema,
  branchServicesPreviewSchema,
  groupMemberSchema,
  vendorIdParamSchema,
} from './branch-groups.validation.js'

/**
 * Branch groups (0081). Mounted at the admin root for the cookie's sake, as
 * the Bin is, beside the garage editor's own routes; admin only, as the
 * editor is. Every write is signed with the session's name and leaves one
 * admin_audit_log row.
 *
 *   GET  /vendors/:id/branches                   the Branches card: the group
 *                                                and its branches (group null:
 *                                                none)
 *   POST /vendors/:id/branches/link              "Link an existing garage"
 *   POST /vendors/:id/branches/remove            "Remove from group"
 *   POST /vendors/:id/branches/services/preview  what "All N branches" would
 *                                                change
 *   POST /vendors/:id/branches/services          "Save for all N branches" or
 *                                                Delete at all of them, in one
 *                                                transaction, only when the
 *                                                plan is the one previewed
 *
 * The link answers are the card again, so the panel redraws from one reply.
 */
export const adminBranchGroupRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const
const idParam = zValidator('param', vendorIdParamSchema)

adminBranchGroupRoutes.get('/vendors/:id/branches', ...adminMiddleware, idParam, (c) =>
  controller.branchesOf(c, c.req.valid('param').id)
)

adminBranchGroupRoutes.post('/vendors/:id/branches/link', ...adminMiddleware, idParam, adminSignedJson(groupMemberSchema), (c) =>
  controller.link(c, c.req.valid('param').id, c.req.valid('json'))
)

adminBranchGroupRoutes.post('/vendors/:id/branches/remove', ...adminMiddleware, idParam, adminSignedJson(groupMemberSchema), (c) =>
  controller.unlink(c, c.req.valid('param').id, c.req.valid('json'))
)

adminBranchGroupRoutes.post(
  '/vendors/:id/branches/services/preview',
  ...adminMiddleware,
  idParam,
  zValidator('json', branchServicesPreviewSchema),
  (c) => controller.previewServices(c, c.req.valid('param').id, c.req.valid('json'))
)

adminBranchGroupRoutes.post(
  '/vendors/:id/branches/services',
  ...adminMiddleware,
  idParam,
  adminSignedJson(branchServicesApplySchema),
  (c) => controller.applyServices(c, c.req.valid('param').id, c.req.valid('json'))
)
