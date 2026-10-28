import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './garage-board.controller.js'
import {
  setColourNamesSchema,
  setColourTagsSchema,
  setGarageTargetSchema,
} from './garage-board.validation.js'

/**
 * The Garages page's target counter and colour tags (0061). Mounted at
 * /api/v1/admin/garage-board. Super-admin only, as the rest of admin; every
 * write is signed with the session's name.
 *
 *   GET  /settings        the target and the colours' names
 *   PUT  /target          the onboarding target (team-wide)
 *   PUT  /colour-names    rename the colours (team-wide)
 *   POST /colour-tags     one colour on one garage or several
 */
export const adminGarageBoardRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminGarageBoardRoutes.get('/settings', ...adminMiddleware, controller.settings)

adminGarageBoardRoutes.put('/target', ...adminMiddleware, adminSignedJson(setGarageTargetSchema), (c) =>
  controller.setTarget(c, c.req.valid('json'))
)

adminGarageBoardRoutes.put('/colour-names', ...adminMiddleware, adminSignedJson(setColourNamesSchema), (c) =>
  controller.setColourNames(c, c.req.valid('json'))
)

adminGarageBoardRoutes.post('/colour-tags', ...adminMiddleware, adminSignedJson(setColourTagsSchema), (c) =>
  controller.setColourTags(c, c.req.valid('json'))
)
