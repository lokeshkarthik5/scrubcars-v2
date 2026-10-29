/**
 * The rating's words and numbers for the apps (0065). The rules live in the
 * API, apps/server/src/lib/ratings.ts, whose twin this is
 * (ratings.parity.test.ts there): which tags go with which stars, how many
 * counted reviews before a garage has a star score, and how many customers
 * before it is "known for" a tag. The web shows "New on Detlio" from the
 * API's `isNew`; the iOS app's review form and the garage's reply read these.
 */

export const RATING_RULES = {
  minCountedReviews: 3,
  knownForMinCustomers: 5,
  replyEditHours: 24,
  replyMaxLength: 1000,
  reasonMinLength: 3,
  reportReasonMaxLength: 500,
  hideReasonMaxLength: 300,
} as const

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

/** The tags a review with these stars may carry: good ones for 4-5, problems for 1-3. */
export function tagsForRating(rating: number): readonly ReviewTag[] {
  return rating >= 4 ? POSITIVE_REVIEW_TAGS : NEGATIVE_REVIEW_TAGS
}

/** What a garage card says in place of stars for a new garage. */
export const NEW_GARAGE_LABEL = 'New on Detlio'

/** "2 reviews so far" under "New on Detlio"; nothing with none. */
export function newGarageReviewsLine(count: number): string | null {
  if (count <= 0) return null
  return `${count} ${count === 1 ? 'review' : 'reviews'} so far`
}

/**
 * Whether a garage shows a star score: it has counted reviews and is not new
 * (the API's `isNew`, 0065). A new garage shows NEW_GARAGE_LABEL instead.
 */
export function hasStarScore(vendor: {
  reviewCount: number
  isNew?: boolean
}): boolean {
  return vendor.reviewCount > 0 && !vendor.isNew
}

/**
 * Whether a garage's own list of counted reviews (GET /reviews/vendors/:id,
 * which leaves out Test bookings' and hidden ones since 0065) is too short
 * for a score: the garage portal's twin of the API's `isNew`.
 */
export function isNewGarage(countedReviews: number): boolean {
  return countedReviews < RATING_RULES.minCountedReviews
}
