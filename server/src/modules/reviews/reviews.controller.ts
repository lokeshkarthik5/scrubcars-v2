import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { reviewsService } from './reviews.service.js'
import type { CreateReviewInput } from './reviews.validation.js'

type ReviewsContext = Context<{ Variables: AuthVariables }>

function getUserId(c: ReviewsContext): string {
  return c.get('auth').sub
}

export async function createReview(
  c: ReviewsContext,
  input: CreateReviewInput
) {
  const review = await reviewsService.createReview(getUserId(c), input)

  return c.json(
    {
      success: true,
      data: review,
    },
    201
  )
}

export async function listMyReviews(c: ReviewsContext) {
  const reviews = await reviewsService.listMyReviews(getUserId(c))

  return c.json({
    success: true,
    data: reviews,
  })
}

export async function listVendorReviews(
  c: ReviewsContext,
  vendorId: string
) {
  const reviews = await reviewsService.listVendorReviews(vendorId)

  return c.json({
    success: true,
    data: reviews,
  })
}
