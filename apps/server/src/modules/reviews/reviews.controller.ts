import type { Context } from 'hono'
import { AppError } from '../../lib/errors.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { reviewsService } from './reviews.service.js'
import type { CreateReviewInput, HideReviewInput, ReplyInput, ReportReviewInput } from './reviews.validation.js'

type ReviewsContext = Context<{ Variables: AuthVariables }>
type GarageContext = Context<{ Variables: TenantVariables }>

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

export async function vendorReviewSummary(c: ReviewsContext, vendorId: string) {
  const data = await reviewsService.vendorSummary(vendorId)
  return c.json({ success: true, data })
}

export async function reportReview(c: ReviewsContext, reviewId: string, input: ReportReviewInput) {
  const data = await reviewsService.reportReview(getUserId(c), reviewId, input)
  return c.json({ success: true, data }, 201)
}

// ─── The garage's own ────────────────────────────────────────────────────────
// The garage is always the tenant resolveTenant produced, never a parameter.

/** A reply or a report speaks for the garage: its own people, never Detlio's support session. */
function refuseSupportSession(c: GarageContext) {
  if (getTenant(c).viaSuperAdmin) {
    throw new AppError(
      403,
      "A reply or a report comes from the garage's own team. Detlio hides reviews from admin.",
      'REVIEWS_SUPPORT_SESSION'
    )
  }
}

export async function listGarageReviews(c: GarageContext) {
  const data = await reviewsService.listForGarage(getTenant(c).vendorId)
  return c.json({ success: true, data })
}

export async function replyAsGarage(c: GarageContext, reviewId: string, input: ReplyInput) {
  refuseSupportSession(c)
  const data = await reviewsService.replyAsGarage(getTenant(c).vendorId, c.get('auth').sub, reviewId, input)
  return c.json({ success: true, data })
}

export async function reportAsGarage(c: GarageContext, reviewId: string, input: ReportReviewInput) {
  refuseSupportSession(c)
  const data = await reviewsService.reportAsGarage(getTenant(c).vendorId, c.get('auth').sub, reviewId, input)
  return c.json({ success: true, data }, 201)
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listAdminReviews(c: ReviewsContext, vendorId: string) {
  const data = await reviewsService.listForAdmin(vendorId)
  return c.json({ success: true, data })
}

export async function hideReview(c: ReviewsContext, reviewId: string, input: HideReviewInput) {
  const data = await reviewsService.hide(reviewId, c.get('auth').sub, input)
  return c.json({ success: true, data })
}

export async function showReview(c: ReviewsContext, reviewId: string, actorName: string) {
  const data = await reviewsService.show(reviewId, c.get('auth').sub, actorName)
  return c.json({ success: true, data })
}
