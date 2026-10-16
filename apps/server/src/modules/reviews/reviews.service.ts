import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { toPublicReviewResponse } from './reviews.public.js'
import { reviewsRepository } from './reviews.repository.js'
import { isInBin } from '../vendors/vendors.predicates.js'

const log = logger.child({ module: 'reviews' })
import type { ReviewRecord } from './reviews.repository.js'
import type { CreateReviewInput } from './reviews.validation.js'

type ReviewWithRelations = ReviewRecord & {
  user?: {
    id: string
    name: string
    phone: string
  } | null
  vendor?: {
    id: string
    businessName: string
  } | null
  booking?: {
    id: string
    scheduledAt: Date
    items?: Array<{ name: string }> | null
    service?: {
      id: string
      name: string
    } | null
  } | null
}

function toReviewResponse(review: ReviewWithRelations) {
  return {
    id: review.id,
    bookingId: review.bookingId,
    userId: review.userId,
    vendorId: review.vendorId,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    user: review.user
      ? {
          id: review.user.id,
          name: review.user.name,
          phone: review.user.phone,
        }
      : null,
    vendor: review.vendor
      ? {
          id: review.vendor.id,
          businessName: review.vendor.businessName,
        }
      : null,
    booking: review.booking
      ? {
          id: review.booking.id,
          scheduledAt: review.booking.scheduledAt.toISOString(),
          // Every service the review is about. The client renders the summary
          // label; `service` below is the deprecated first item.
          serviceNames: (review.booking.items ?? []).map((item) => item.name),
          service: review.booking.service
            ? {
                id: review.booking.service.id,
                name: review.booking.service.name,
              }
            : null,
        }
      : null,
  }
}

export const reviewsService = {
  async createReview(userId: string, input: CreateReviewInput) {
    const booking = await reviewsRepository.findBookingById(input.bookingId)

    if (!booking || booking.userId !== userId) {
      throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
    }

    if (booking.status !== 'completed') {
      throw new AppError(
        400,
        'Reviews can only be added after booking is completed',
        'BOOKING_NOT_COMPLETED'
      )
    }

    if (booking.review) {
      throw new AppError(
        409,
        'Review already exists for this booking',
        'REVIEW_ALREADY_EXISTS'
      )
    }

    const [review] = await reviewsRepository.createReview({
      bookingId: booking.id,
      userId,
      vendorId: booking.vendorId,
      rating: input.rating,
      comment: input.comment,
    })

    log.info({ reviewId: review.id, userId, vendorId: booking.vendorId, rating: input.rating }, 'review:created')

    return toReviewResponse(review)
  },

  async listMyReviews(userId: string) {
    const reviews = await reviewsRepository.listReviewsForUser(userId)
    return reviews.map(toReviewResponse)
  },

  async listVendorReviews(vendorId: string) {
    const vendor = await reviewsRepository.findVendorById(vendorId)

    // A garage in the Bin has no page, so its reviews are not shown either.
    if (!vendor || isInBin(vendor)) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    // Public: anyone can load this without signing in.
    const reviews = await reviewsRepository.listReviewsForVendor(vendorId)
    return reviews.map(toPublicReviewResponse)
  },
}
