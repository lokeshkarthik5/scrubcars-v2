import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware, requireCustomer } from '../../middleware/auth.middleware.js'
import { conditionReadRateLimiter } from '../../middleware/rate-limit.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as controller from './condition-check.controller.js'
import {
  addMarkSchema,
  conditionAnswerSchema,
  conditionJobParamSchema,
  conditionMarkParamSchema,
  conditionPhotoParamSchema,
} from './condition-check.validation.js'

/**
 * The car condition check (0075), the garage's side, mounted at
 * /vendors/me/bookings so the company is always the one resolveTenant
 * produced. Widened to operators like the job photos: whoever takes the
 * car takes the walk-round. Every route is a 404 for a job of another
 * garage, and while the check is off for this one.
 */
export const conditionCheckRoutes = new Hono<{ Variables: TenantVariables }>()

const jobMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin', 'vendor_operator'),
] as const

// Detlio looks at one photo (a paid request: limited per person per hour).
conditionCheckRoutes.post(
  '/:id/condition/photos/:photoId/read',
  ...jobMiddleware,
  conditionReadRateLimiter,
  zValidator('param', conditionPhotoParamSchema),
  (c) => controller.readPhoto(c, c.req.valid('param').id, c.req.valid('param').photoId)
)

conditionCheckRoutes.post(
  '/:id/condition/marks',
  ...jobMiddleware,
  zValidator('param', conditionJobParamSchema),
  zValidator('json', addMarkSchema),
  (c) => controller.addMark(c, c.req.valid('param').id, c.req.valid('json'))
)

conditionCheckRoutes.post(
  '/:id/condition/marks/:markId/remove',
  ...jobMiddleware,
  zValidator('param', conditionMarkParamSchema),
  (c) => controller.removeMark(c, c.req.valid('param').id, c.req.valid('param').markId)
)

conditionCheckRoutes.post(
  '/:id/condition/marks/:markId/restore',
  ...jobMiddleware,
  zValidator('param', conditionMarkParamSchema),
  (c) => controller.restoreMark(c, c.req.valid('param').id, c.req.valid('param').markId)
)

conditionCheckRoutes.post(
  '/:id/condition/marks/:markId/was-there',
  ...jobMiddleware,
  zValidator('param', conditionMarkParamSchema),
  (c) => controller.garageWasThere(c, c.req.valid('param').id, c.req.valid('param').markId)
)

conditionCheckRoutes.post(
  '/:id/condition/send',
  ...jobMiddleware,
  zValidator('param', conditionJobParamSchema),
  (c) => controller.send(c, c.req.valid('param').id)
)

/**
 * The customer's side, mounted at /bookings: their answer to the before
 * check, and "It was already there" on a possible new mark. Only the
 * booking's own customer; for anyone else the booking does not exist.
 */
export const customerConditionCheckRoutes = new Hono<{ Variables: TenantVariables }>()

const customerMiddleware = [authMiddleware, requireCustomer] as const

customerConditionCheckRoutes.post(
  '/:id/condition/answer',
  ...customerMiddleware,
  zValidator('param', conditionJobParamSchema),
  zValidator('json', conditionAnswerSchema),
  (c) => controller.answer(c, c.req.valid('param').id, c.req.valid('json'))
)

customerConditionCheckRoutes.post(
  '/:id/condition/marks/:markId/already-there',
  ...customerMiddleware,
  zValidator('param', conditionMarkParamSchema),
  (c) => controller.customerAlreadyThere(c, c.req.valid('param').id, c.req.valid('param').markId)
)
