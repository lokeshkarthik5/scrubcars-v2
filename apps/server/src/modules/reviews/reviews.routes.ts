import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  adminSignedJson,
  authMiddleware,
  requireCustomer,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { requireVendorRole, resolveTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import * as reviewsController from './reviews.controller.js'
import {
  createReviewSchema,
  hideReviewSchema,
  replySchema,
  reportReviewSchema,
  reviewIdParamSchema,
  showReviewSchema,
  vendorIdParamSchema,
} from './reviews.validation.js'

export const reviewsRoutes = new Hono<{ Variables: AuthVariables }>()

reviewsRoutes.post(
  '/',
  authMiddleware,
  requireCustomer,
  zValidator('json', createReviewSchema),
  (c) => reviewsController.createReview(c, c.req.valid('json'))
)

reviewsRoutes.get(
  '/me',
  authMiddleware,
  requireCustomer,
  reviewsController.listMyReviews
)

reviewsRoutes.get(
  '/vendors/:vendorId',
  zValidator('param', vendorIdParamSchema),
  (c) => reviewsController.listVendorReviews(c, c.req.valid('param').vendorId)
)

// The garage page's rating block (0065): score (none for a new garage), the
// stars 5 to 1, the tags and what it is known for. Public, like the list.
reviewsRoutes.get(
  '/vendors/:vendorId/summary',
  zValidator('param', vendorIdParamSchema),
  (c) => reviewsController.vendorReviewSummary(c, c.req.valid('param').vendorId)
)

// Report a review to the team (0065, Apple 1.2): any signed-in account.
reviewsRoutes.post(
  '/:reviewId/report',
  authMiddleware,
  zValidator('param', reviewIdParamSchema),
  zValidator('json', reportReviewSchema),
  (c) => reviewsController.reportReview(c, c.req.valid('param').reviewId, c.req.valid('json'))
)

// ─── The garage's own (0065) ─────────────────────────────────────────────────

/**
 * Mounted at /vendors/me/reviews (vendors.routes.ts). The owner seat only:
 * no widening, so it is vendor_admin and an operator gets a 403 (default
 * deny); the garage is always the tenant resolveTenant produced. A reply or
 * a report is the garage's own: a Detlio support session is refused.
 */
export const garageReviewRoutes = new Hono<{ Variables: TenantVariables }>()

const ownerMiddleware = [authMiddleware, resolveTenant, requireVendorRole('vendor_admin')] as const

garageReviewRoutes.get('/', ...ownerMiddleware, reviewsController.listGarageReviews)

garageReviewRoutes.put(
  '/:reviewId/reply',
  ...ownerMiddleware,
  zValidator('param', reviewIdParamSchema),
  zValidator('json', replySchema),
  (c) => reviewsController.replyAsGarage(c, c.req.valid('param').reviewId, c.req.valid('json'))
)

garageReviewRoutes.post(
  '/:reviewId/report',
  ...ownerMiddleware,
  zValidator('param', reviewIdParamSchema),
  zValidator('json', reportReviewSchema),
  (c) => reviewsController.reportAsGarage(c, c.req.valid('param').reviewId, c.req.valid('json'))
)

// ─── Admin (0065) ────────────────────────────────────────────────────────────

/**
 * Mounted at the root of /api/v1/admin (admin.routes.ts) for the cookie's
 * sake. Super-admin only; writes are signed by the session and audited.
 *
 *   GET  /vendors/:vendorId/reviews   every review of a garage, and its score
 *   POST /reviews/:reviewId/hide      { reason }
 *   POST /reviews/:reviewId/show
 */
export const adminReviewRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminReviewRoutes.get(
  '/vendors/:vendorId/reviews',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => reviewsController.listAdminReviews(c, c.req.valid('param').vendorId)
)

adminReviewRoutes.post(
  '/reviews/:reviewId/hide',
  ...adminMiddleware,
  zValidator('param', reviewIdParamSchema),
  adminSignedJson(hideReviewSchema),
  (c) => reviewsController.hideReview(c, c.req.valid('param').reviewId, c.req.valid('json'))
)

adminReviewRoutes.post(
  '/reviews/:reviewId/show',
  ...adminMiddleware,
  zValidator('param', reviewIdParamSchema),
  adminSignedJson(showReviewSchema),
  (c) => reviewsController.showReview(c, c.req.valid('param').reviewId, c.req.valid('json').actorName)
)
