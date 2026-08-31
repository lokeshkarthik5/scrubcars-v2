import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as reviewsController from './reviews.controller.js'
import {
  createReviewSchema,
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
