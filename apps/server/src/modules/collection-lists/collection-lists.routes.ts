import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as controller from './collection-lists.controller.js'
import {
  closeCollectionListSchema,
  createCollectionListsSchema,
  itemIdParamSchema,
  listCollectionListsQuerySchema,
  listIdParamSchema,
  updateCollectionItemSchema,
} from './collection-lists.validation.js'

/**
 * Collection lists (0059, "Send to team"): things a teammate is to collect
 * from a few garages. Mounted at the root of /api/v1/admin (admin.routes.ts)
 * for the admin cookie's path, like the marks. Super-admin only; every
 * write is signed with the session's name (adminSignedJson).
 */
export const adminCollectionListRoutes = new Hono<{
  Variables: AuthVariables
}>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

// One list per collector, at most 50 garages each. A failed Telegram post
// never fails it: that list's telegramSentAt stays null.
adminCollectionListRoutes.post(
  '/collection-lists',
  ...adminMiddleware,
  adminSignedJson(createCollectionListsSchema),
  (c) => controller.create(c, c.req.valid('json'))
)

// ?scope=mine|all&open=true|false. `mine` is none for the shared env login.
adminCollectionListRoutes.get(
  '/collection-lists',
  ...adminMiddleware,
  zValidator('query', listCollectionListsQuerySchema),
  (c) => controller.list(c, c.req.valid('query'))
)

adminCollectionListRoutes.post(
  '/collection-lists/:id/close',
  ...adminMiddleware,
  zValidator('param', listIdParamSchema),
  adminSignedJson(closeCollectionListSchema),
  (c) => controller.close(c, c.req.valid('param').id)
)

// Tick or untick an item, with an optional note.
adminCollectionListRoutes.patch(
  '/collection-items/:id',
  ...adminMiddleware,
  zValidator('param', itemIdParamSchema),
  adminSignedJson(updateCollectionItemSchema),
  (c) => controller.updateItem(c, c.req.valid('param').id, c.req.valid('json'))
)
