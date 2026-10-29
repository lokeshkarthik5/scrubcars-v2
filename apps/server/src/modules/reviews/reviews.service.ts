import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import {
  REVIEW_TAG_LABELS,
  garageRating,
  isReviewTag,
  knownFor,
  orderedTagCounts,
  replyEditable,
  replyRefusal,
  type ReviewTag,
} from '../../lib/ratings.js'
import { vendorInBin } from '../../lib/vendor-bin.js'
import { toPublicReviewResponse } from './reviews.public.js'
import { reviewsRepository, type RatingAggregate } from './reviews.repository.js'
import { isInBin } from '../vendors/vendors.predicates.js'

const log = logger.child({ module: 'reviews' })
import type { ReviewRecord } from './reviews.repository.js'
import type { CreateReviewInput, HideReviewInput, ReplyInput, ReportReviewInput } from './reviews.validation.js'

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
    tags: review.tags ?? [],
    reply: review.reply && review.repliedAt ? { text: review.reply, repliedAt: review.repliedAt.toISOString() } : null,
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

function reviewNotFound() {
  return new AppError(404, 'Review not found', 'REVIEW_NOT_FOUND')
}

function vendorNotFound() {
  return new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
}

function alreadyReported() {
  return new AppError(409, 'You have already reported this review. The team will look at it.', 'REVIEW_ALREADY_REPORTED')
}

// ─── The rating, for any reader (0065) ───────────────────────────────────────

/** A tag as the apps show it. */
function tagView(tag: ReviewTag) {
  return { tag, label: REVIEW_TAG_LABELS[tag] }
}

/**
 * The score customers, the garage and admin see, from the counted reviews
 * (lib/ratings.ts): no score for a new garage, the tag counts, and what it
 * is known for.
 */
export function ratingSummary(
  aggregate: RatingAggregate | undefined,
  tagCounts: Array<{ tag: string; count: number }>
) {
  const rating = garageRating(aggregate ?? null)
  const top = knownFor(tagCounts)
  return {
    ...rating,
    tags: orderedTagCounts(tagCounts),
    knownFor: top ? tagView(top) : null,
  }
}

/**
 * Many garages' scores in two grouped reads, for the garage list, search,
 * the map and Home: each garage's rating, count, whether it is new and what
 * it is known for. A garage with no counted review is new with 0.
 */
export async function ratingsFor(vendorIds: string[]) {
  const [aggregates, tags] = await Promise.all([
    reviewsRepository.ratingAggregates(vendorIds),
    reviewsRepository.tagCounts(vendorIds),
  ])
  const byVendor = new Map(aggregates.map((row) => [row.vendorId, row]))
  return new Map(
    vendorIds.map((id) => {
      const rating = garageRating(byVendor.get(id) ?? null)
      const top = knownFor(tags.filter((row) => row.vendorId === id))
      return [id, { ...rating, knownFor: top ? tagView(top) : null }]
    })
  )
}

/** The stars 5 to 1 with how many counted reviews gave each. */
function starRows(counts: Array<{ stars: number; count: number }>) {
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.find((row) => row.stars === stars)?.count ?? 0 }))
}

/** The admin's and the garage's view of one review's reports and reply. */
function replyView(review: { reply: string | null; repliedAt: Date | null; replyUpdatedAt: Date | null }, now: Date) {
  if (!review.reply || !review.repliedAt) return null
  return {
    text: review.reply,
    repliedAt: review.repliedAt.toISOString(),
    updatedAt: review.replyUpdatedAt?.toISOString() ?? null,
    editableUntil: new Date(review.repliedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    editable: replyEditable(review.repliedAt, now),
  }
}

function tagsOf(review: { tags: string[] | null }) {
  return (review.tags ?? []).filter(isReviewTag).map(tagView)
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
      tags: input.tags,
    })

    log.info(
      { reviewId: review.id, userId, vendorId: booking.vendorId, rating: input.rating, tags: input.tags?.length ?? 0 },
      'review:created'
    )

    return toReviewResponse(review)
  },

  async listMyReviews(userId: string) {
    const reviews = await reviewsRepository.listReviewsForUser(userId)
    return reviews.map(toReviewResponse)
  },

  async listVendorReviews(vendorId: string) {
    await assertPublicGarage(vendorId)
    // Public: anyone can load this without signing in. Counted reviews only.
    const reviews = await reviewsRepository.listReviewsForVendor(vendorId)
    return reviews.map(toPublicReviewResponse)
  },

  /**
   * The garage page's rating block (0065, mockup frame C): the score (none
   * for a new garage), how many counted reviews, the stars 5 to 1, the tags
   * and what it is known for. Public.
   */
  async vendorSummary(vendorId: string) {
    await assertPublicGarage(vendorId)
    const [aggregates, tags, stars] = await Promise.all([
      reviewsRepository.ratingAggregates([vendorId]),
      reviewsRepository.tagCounts([vendorId]),
      reviewsRepository.starCounts(vendorId),
    ])
    return { ...ratingSummary(aggregates[0], tags), stars: starRows(stars) }
  },

  /**
   * Anyone signed in reports a review to the team (0065; Apple 1.2): one
   * report per person and review, never their own, never one already
   * hidden. The team is told on Telegram.
   */
  async reportReview(userId: string, reviewId: string, input: ReportReviewInput) {
    const review = await reviewsRepository.findForReport(reviewId)
    if (!review || review.hiddenAt) throw reviewNotFound()
    if (review.userId === userId) {
      throw new AppError(409, "You can't report your own review. You can contact us instead.", 'REVIEW_OWN')
    }
    const report = await reviewsRepository.insertReport({
      reviewId,
      reporter: 'customer',
      userId,
      vendorId: null,
      reason: input.reason,
    })
    if (!report) throw alreadyReported()
    alertReviewReported(review, 'customer', input.reason)
    log.info({ reviewId, reportId: report.id, reporter: 'customer' }, 'review:reported')
    return { reported: true }
  },

  // ─── The garage's own (owner seat; the tenant from resolveTenant) ─────────

  /** The garage's Reviews screen (mockup frame E): its score and its counted reviews. */
  async listForGarage(vendorId: string, now = new Date()) {
    const [aggregates, tags, rows] = await Promise.all([
      reviewsRepository.ratingAggregates([vendorId]),
      reviewsRepository.tagCounts([vendorId]),
      reviewsRepository.listForGarage(vendorId),
    ])
    return {
      summary: ratingSummary(aggregates[0], tags),
      reviews: rows.map((row) => ({
        ...toPublicReviewResponse(row),
        tags: tagsOf(row),
        reply: replyView(row, now),
        // Never replied, or still within the 24 hours of its first reply.
        canReply: !row.repliedAt || replyEditable(row.repliedAt, now),
        reportedByYou: row.reportedByGarage,
      })),
    }
  },

  /**
   * The garage's one public reply (0065): posted at any time, changed for 24
   * hours from when it was first posted. A Test booking's review is not the
   * garage's to see (404); a hidden one takes no reply.
   */
  async replyAsGarage(vendorId: string, userId: string, reviewId: string, input: ReplyInput, now = new Date()) {
    const review = await reviewsRepository.findForGarage(vendorId, reviewId)
    if (!review || review.markedTest) throw reviewNotFound()
    const refusal = replyRefusal(review, input.text, now)
    switch (refusal) {
      case 'review_hidden':
        throw new AppError(409, 'Detlio has hidden this review, so it takes no reply.', 'REVIEW_HIDDEN')
      case 'window_closed':
        throw new AppError(409, 'A reply can be changed for 24 hours after it is posted.', 'REPLY_LOCKED')
      case 'empty':
      case 'too_long':
        throw new AppError(400, 'Write a reply of up to 1000 characters.', 'REPLY_INVALID')
    }
    const saved = await reviewsRepository.setReply({
      reviewId,
      vendorId,
      text: input.text.trim(),
      by: userId,
      seenRepliedAt: review.repliedAt,
      at: now,
    })
    if (!saved) {
      throw new AppError(409, 'This review changed meanwhile. Reload to see it as it is now.', 'REVIEW_CHANGED')
    }
    log.info({ reviewId, vendorId, edit: Boolean(review.repliedAt) }, 'review:replied')
    return { reply: replyView(saved, now) }
  },

  /** The garage reports a review to the team (0065). Garages can't hide reviews. */
  async reportAsGarage(vendorId: string, userId: string, reviewId: string, input: ReportReviewInput) {
    const review = await reviewsRepository.findForGarage(vendorId, reviewId)
    if (!review || review.markedTest || review.hiddenAt) throw reviewNotFound()
    const report = await reviewsRepository.insertReport({
      reviewId,
      reporter: 'garage',
      userId,
      vendorId,
      reason: input.reason,
    })
    if (!report) throw alreadyReported()
    const full = await reviewsRepository.findForReport(reviewId)
    if (full) alertReviewReported(full, 'garage', input.reason)
    log.info({ reviewId, reportId: report.id, reporter: 'garage', vendorId }, 'review:reported')
    return { reported: true }
  },

  // ─── Admin (super-admin) ──────────────────────────────────────────────────

  /**
   * A garage's Reviews section (mockup frame F): every review, Test
   * bookings' and hidden ones included, each saying whether it counts and
   * why not, with its reports; and the garage's score as customers see it.
   */
  async listForAdmin(vendorId: string, now = new Date()) {
    const garage = await reviewsRepository.findVendorById(vendorId)
    if (!garage || garage.purgedAt) throw vendorNotFound()
    const [aggregates, tags, rows] = await Promise.all([
      reviewsRepository.ratingAggregates([vendorId]),
      reviewsRepository.tagCounts([vendorId]),
      reviewsRepository.listForAdmin(vendorId),
    ])
    return {
      summary: ratingSummary(aggregates[0], tags),
      reviews: rows.map((row) => {
        const test = row.booking?.markedTestAt != null
        return {
          id: row.id,
          rating: row.rating,
          comment: row.comment,
          tags: tagsOf(row),
          createdAt: row.createdAt.toISOString(),
          reviewer: row.user?.name ?? null,
          booking: row.booking
            ? {
                id: row.booking.id,
                reference: row.booking.id.slice(0, 8).toUpperCase(),
                scheduledAt: row.booking.scheduledAt.toISOString(),
                serviceNames: (row.booking.items ?? []).map((item) => item.name),
              }
            : null,
          // Whether it counts, and why not: a Test booking never does; a
          // hidden one stays in the record.
          counts: !test && !row.hiddenAt,
          test,
          hidden: row.hiddenAt
            ? { at: row.hiddenAt.toISOString(), by: row.hiddenBy, reason: row.hiddenReason }
            : null,
          reply: replyView(row, now),
          reports: row.reports.map((report) => ({
            id: report.id,
            reporter: report.reporter,
            reason: report.reason,
            at: report.createdAt.toISOString(),
          })),
        }
      }),
    }
  },

  /** Hides a review from every score and list, with the reason. Audited. */
  async hide(reviewId: string, sub: string, input: HideReviewInput, now = new Date()) {
    const review = await reviewsRepository.findForAdmin(reviewId)
    if (!review) throw reviewNotFound()
    if (review.vendorDeletedAt) throw vendorInBin()
    if (review.hiddenAt) throw new AppError(409, 'This review is already hidden.', 'REVIEW_ALREADY_HIDDEN')
    const hidden = await reviewsRepository.hide(reviewId, { sub, name: input.actorName }, input.reason, now)
    if (!hidden) throw new AppError(409, 'This review is already hidden.', 'REVIEW_ALREADY_HIDDEN')
    log.info({ reviewId, vendorId: hidden.vendorId, by: input.actorName }, 'review:hidden')
    return { id: reviewId, hidden: true }
  },

  /** Shows a hidden review again. Audited, with who had hidden it and why. */
  async show(reviewId: string, sub: string, actorName: string) {
    const review = await reviewsRepository.findForAdmin(reviewId)
    if (!review) throw reviewNotFound()
    if (review.vendorDeletedAt) throw vendorInBin()
    if (!review.hiddenAt) throw new AppError(409, 'This review is not hidden.', 'REVIEW_NOT_HIDDEN')
    const shown = await reviewsRepository.show(reviewId, { sub, name: actorName })
    if (!shown) throw new AppError(409, 'This review is not hidden.', 'REVIEW_NOT_HIDDEN')
    log.info({ reviewId, vendorId: shown.vendorId, by: actorName }, 'review:shown')
    return { id: reviewId, hidden: false }
  },
}

/** A garage page that exists and is not in the Bin. */
async function assertPublicGarage(vendorId: string) {
  const vendor = await reviewsRepository.findVendorById(vendorId)
  // A garage in the Bin has no page, so its reviews are not shown either.
  if (!vendor || isInBin(vendor)) throw vendorNotFound()
  return vendor
}

/**
 * Tells the team a review was reported: the garage, the stars, who reported
 * it (a customer or the garage) and both texts, quoted and cut short. No
 * name or phone.
 */
function alertReviewReported(
  review: { id: string; vendorId: string; rating: number; comment: string | null; garage: string },
  reporter: 'customer' | 'garage',
  reason: string
) {
  alertOps({
    kind: 'review_reported',
    reviewId: review.id,
    vendorId: review.vendorId,
    garage: review.garage,
    rating: review.rating,
    comment: review.comment,
    reporter,
    reason,
  })
}
