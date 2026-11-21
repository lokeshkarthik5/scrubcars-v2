/**
 * The rating: one definition of what counts and how it is shown, used by the
 * customer's garage list, search, map and garage page, the garage portal,
 * admin, the tiers and Statistics (owner, 29 Oct 2026: "These should never be
 * counted towards our rating").
 *
 * - A review **counts** when its booking is not marked Test and admin has not
 *   hidden it (`isCountedReview`; the SQL twin is COUNTED_REVIEW in
 *   modules/reviews/reviews.predicates.ts). Nothing else reads reviews for a
 *   score.
 * - **Fewer than 3 counted reviews** is a new garage: no star score, "New on
 *   Detlio" instead (`garageRating`), and sorting by rating places it at a
 *   neutral `NEW_GARAGE_SORT_RATING` rather than at its one 5.0.
 * - **Tags** come from a fixed list: good ones for 4-5 stars, problems for
 *   1-3 (`reviewTagsRefusal`). A garage is **known for** its top good tag once
 *   5 or more customers picked it (`knownFor`).
 * - **The garage's reply**: one per review, public, editable for 24 hours
 *   from when it was first posted (`replyRefusal`).
 *
 * Pure: no database, no clock (the caller passes now). Words and numbers are
 * twinned in packages/core/src/ratings.ts (ratings.parity.test.ts).
 */

export const RATING_RULES = {
  /** Counted reviews before a garage has a star score. */
  minCountedReviews: 3,
  /** Customers who picked a good tag before the garage is "known for" it. */
  knownForMinCustomers: 5,
  /** How long the garage may change its reply, from when it first posted it. */
  replyEditHours: 24,
  replyMaxLength: 1000,
  reasonMinLength: 3,
  reportReasonMaxLength: 500,
  hideReasonMaxLength: 300,
} as const

/**
 * Where a new garage sits when customers sort by rating: between a well-rated
 * garage and a poorly rated one, never above every rated garage because of
 * one 5-star review.
 */
export const NEW_GARAGE_SORT_RATING = 4

export const POSITIVE_REVIEW_TAGS = [
  'on_time',
  'spotless_finish',
  'friendly',
  'good_value',
] as const
export const NEGATIVE_REVIEW_TAGS = [
  'missed_spots',
  'late',
  'damp_interior',
  'rude',
] as const
export const REVIEW_TAGS = [
  ...POSITIVE_REVIEW_TAGS,
  ...NEGATIVE_REVIEW_TAGS,
] as const

export type PositiveReviewTag = (typeof POSITIVE_REVIEW_TAGS)[number]
export type ReviewTag = (typeof REVIEW_TAGS)[number]

export const REVIEW_TAG_LABELS: Record<ReviewTag, string> = {
  on_time: 'On time',
  spotless_finish: 'Spotless finish',
  friendly: 'Friendly',
  good_value: 'Good value',
  missed_spots: 'Missed spots',
  late: 'Late',
  damp_interior: 'Damp/wet interior',
  rude: 'Rude',
}

export function isReviewTag(value: string): value is ReviewTag {
  return (REVIEW_TAGS as readonly string[]).includes(value)
}

export function isPositiveTag(tag: ReviewTag): tag is PositiveReviewTag {
  return (POSITIVE_REVIEW_TAGS as readonly string[]).includes(tag)
}

/** The tags a review with these stars may carry. */
export function tagsForRating(rating: number): readonly ReviewTag[] {
  return rating >= 4 ? POSITIVE_REVIEW_TAGS : NEGATIVE_REVIEW_TAGS
}

export type ReviewTagsRefusal = 'unknown_tag' | 'wrong_tone' | 'duplicate'

/**
 * Why these tags can't go with these stars, or null. Unknown words, a good
 * tag on a 1-3 star review (or a problem on a 4-5), and the same tag twice
 * are refused.
 */
export function reviewTagsRefusal(
  rating: number,
  tags: readonly string[]
): ReviewTagsRefusal | null {
  if (tags.some((tag) => !isReviewTag(tag))) return 'unknown_tag'
  if (new Set(tags).size !== tags.length) return 'duplicate'
  const allowed = tagsForRating(rating) as readonly string[]
  if (tags.some((tag) => !allowed.includes(tag))) return 'wrong_tone'
  return null
}

/** Whether a review counts toward any score, list or tier. */
export function isCountedReview(review: {
  hiddenAt: Date | null
  bookingMarkedTest: boolean
}): boolean {
  return review.hiddenAt === null && !review.bookingMarkedTest
}

export interface GarageRating {
  /** One decimal place; null for a new garage (fewer than 3 counted reviews). */
  rating: number | null
  /** Counted reviews. */
  reviewCount: number
  /** Fewer than 3 counted reviews: "New on Detlio" instead of stars. */
  isNew: boolean
}

/**
 * What customers and the garage see, from the counted reviews' average and
 * count (`average` null or `count` 0 when there are none).
 */
export function garageRating(
  counted: { average: number | null; count: number } | null | undefined
): GarageRating {
  const count = counted?.count ?? 0
  const average = counted?.average ?? null
  if (count < RATING_RULES.minCountedReviews || average === null) {
    return { rating: null, reviewCount: count, isNew: true }
  }
  return {
    rating: Number(average.toFixed(2)),
    reviewCount: count,
    isNew: false,
  }
}

/**
 * The garage's top good tag once enough customers picked it, or null. Ties go
 * to the earlier tag in the list.
 */
export function knownFor(
  tagCounts: ReadonlyArray<{ tag: string; count: number }>
): PositiveReviewTag | null {
  let best: { tag: PositiveReviewTag; count: number } | null = null
  for (const tag of POSITIVE_REVIEW_TAGS) {
    const count = tagCounts.find((row) => row.tag === tag)?.count ?? 0
    if (count < RATING_RULES.knownForMinCustomers) continue
    if (!best || count > best.count) best = { tag, count }
  }
  return best?.tag ?? null
}

/** Tag counts in the list's order, good ones first, leaving out zeros. */
export function orderedTagCounts(
  tagCounts: ReadonlyArray<{ tag: string; count: number }>
): Array<{ tag: ReviewTag; label: string; count: number; positive: boolean }> {
  return REVIEW_TAGS.flatMap((tag) => {
    const count = tagCounts.find((row) => row.tag === tag)?.count ?? 0
    return count > 0
      ? [
          {
            tag,
            label: REVIEW_TAG_LABELS[tag],
            count,
            positive: isPositiveTag(tag),
          },
        ]
      : []
  })
}

export type ReplyRefusal =
  'review_hidden' | 'window_closed' | 'empty' | 'too_long'

/**
 * Whether the garage may post or change its reply now. The first reply may
 * come at any time; it may be changed for 24 hours from when it was first
 * posted, and never after. A hidden review takes no reply.
 */
export function replyRefusal(
  review: { hiddenAt: Date | null; repliedAt: Date | null },
  text: string,
  now: Date
): ReplyRefusal | null {
  if (review.hiddenAt) return 'review_hidden'
  const trimmed = text.trim()
  if (trimmed.length === 0) return 'empty'
  if (trimmed.length > RATING_RULES.replyMaxLength) return 'too_long'
  if (review.repliedAt && !replyEditable(review.repliedAt, now))
    return 'window_closed'
  return null
}

/** Whether a reply first posted at `repliedAt` may still be changed. */
export function replyEditable(repliedAt: Date, now: Date): boolean {
  return (
    now.getTime() <
    repliedAt.getTime() + RATING_RULES.replyEditHours * 60 * 60 * 1000
  )
}

/** A reason typed for a report or a hide: trimmed, 3 characters up to the limit. */
export function reasonProblem(
  reason: string,
  max: number
): 'too_short' | 'too_long' | null {
  const trimmed = reason.trim()
  if (trimmed.length < RATING_RULES.reasonMinLength) return 'too_short'
  if (trimmed.length > max) return 'too_long'
  return null
}

// ─── Google's rating for a new garage (21 Nov 2026) ─────────────────────────

/**
 * A garage the team linked to its Google listing shows Google's rating,
 * named as Google's ("Google Maps" beside it), until it has 5 counted Detlio
 * reviews; from then on Detlio's own rating is the main one and Google's is
 * only a small line on the garage page. The two are never added together,
 * and sorting by rating reads Detlio's only. A garage with no Google listing
 * keeps the rule above (stars from the 3rd counted review).
 *
 * Where the numbers come from: the garage's lead (`leads.vendor_id`, unique,
 * so at most one), its `google_rating` / `google_review_count`, read from
 * Google on `google_fetched_at` and read again every 29 days by the nightly
 * refresh (lib/places/refresh.ts). Google's terms: never shown once they are
 * 30 days old. Never on a map. Words twinned in packages/core/src/ratings.ts.
 */
export const GOOGLE_RATING_RULES = {
  /** Counted Detlio reviews from which Detlio's rating takes over. */
  detlioTakesOverAt: 5,
  /** Google's figures are never shown once this old (Google's terms). */
  holdDays: 30,
} as const

/** Google's rating as the apps show it: always named as Google's. */
export interface GoogleRating {
  /** 0 to 5, one decimal. */
  rating: number
  reviewCount: number
}

const GOOGLE_HOLD_MS = GOOGLE_RATING_RULES.holdDays * 24 * 60 * 60 * 1000

/**
 * The Google rating a garage's lead holds that may still be shown, or null:
 * no listing read, read 30 days ago or more, or a place with no rating (or
 * no reviews) on Google.
 */
export function heldGoogleRating(
  lead:
    | {
        googleRating: string | number | null
        googleReviewCount: number | null
        googleFetchedAt: Date | null
      }
    | null
    | undefined,
  now: Date
): GoogleRating | null {
  if (!lead || !lead.googleFetchedAt) return null
  if (now.getTime() - lead.googleFetchedAt.getTime() >= GOOGLE_HOLD_MS) return null
  if (lead.googleRating === null || lead.googleReviewCount === null) return null
  const rating = Number(lead.googleRating)
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return null
  if (lead.googleReviewCount <= 0) return null
  return { rating: Math.round(rating * 10) / 10, reviewCount: lead.googleReviewCount }
}

/** Whether Google's rating is the main one: there is one, and fewer than 5 counted Detlio reviews. */
export function googleIsMain(google: GoogleRating | null, countedReviews: number): boolean {
  return google !== null && countedReviews < GOOGLE_RATING_RULES.detlioTakesOverAt
}

/**
 * What a garage card carries (the list, search, Saved, the rescue's other
 * garages): Google's rating only while it is the main one, and never on a
 * map's payload.
 */
export function cardGoogleRating(
  google: GoogleRating | null,
  countedReviews: number,
  options: { map: boolean }
): GoogleRating | null {
  if (options.map) return null
  return googleIsMain(google, countedReviews) ? google : null
}
