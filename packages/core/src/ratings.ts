import { msg, t, tn } from './i18n/translate'

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
  on_time: msg('On time'),
  spotless_finish: msg('Spotless finish'),
  friendly: msg('Friendly'),
  good_value: msg('Good value'),
  missed_spots: msg('Missed spots'),
  late: msg('Late'),
  damp_interior: msg('Damp/wet interior'),
  rude: msg('Rude'),
}

/** The tags a review with these stars may carry: good ones for 4-5, problems for 1-3. */
export function tagsForRating(rating: number): readonly ReviewTag[] {
  return rating >= 4 ? POSITIVE_REVIEW_TAGS : NEGATIVE_REVIEW_TAGS
}

/** What a garage card says in place of stars for a new garage. */
export const NEW_GARAGE_LABEL = msg('New on Detlio')

/** "2 reviews so far" under "New on Detlio"; nothing with none. */
export function newGarageReviewsLine(count: number): string | null {
  if (count <= 0) return null
  return tn(count, '{count} review so far', '{count} reviews so far')
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

// ─── Google's rating for a new garage, and the two marks (21 Nov 2026) ──────

/**
 * Twin of the API's GOOGLE_RATING_RULES (apps/server/src/lib/ratings.ts,
 * ratings.parity.test.ts): a garage linked to its Google listing shows
 * Google's rating, named as Google's, until it has 5 counted Detlio
 * reviews; then Detlio's own rating takes over and Google's is only a small
 * "Also" line in the garage page's Reviews tab. Never on a map, never added
 * to Detlio's, never a link to Google.
 */
export const GOOGLE_RATING_RULES = {
  detlioTakesOverAt: 5,
  holdDays: 30,
} as const

/** Google's rating as the API sends it (`google` on a garage). */
export interface GoogleRating {
  rating: number
  reviewCount: number
}

/**
 * Google's attribution, shown with every Google rating in the same card
 * (Google's Places policy): exactly these words, never translated, shortened
 * or split, in a plain sans at 12px or more.
 */
export const GOOGLE_MAPS_ATTRIBUTION = 'Google Maps'

/**
 * Whether the multicolour Google "G" shows beside Google's rating. Google's
 * brand rules may need Google's permission for the G; the words "Google
 * Maps" are what meets the attribution rule. If Google objects, set this to
 * false and the website shows the words alone; the apps read its twin in
 * packages/native-ui/src/rating-words.ts (that package does not depend on
 * core), which rating-words.test.ts holds equal to this one.
 */
export const SHOW_GOOGLE_G = true

/** Google's rating when it is the main one on this garage, else null. */
export function mainGoogleRating(vendor: {
  reviewCount: number
  google?: GoogleRating | null
}): GoogleRating | null {
  const google = vendor.google ?? null
  return google && vendor.reviewCount < GOOGLE_RATING_RULES.detlioTakesOverAt
    ? google
    : null
}

/** Google's rating for the quiet "Also … Google Maps" line, once Detlio's has taken over; else null. */
export function alsoGoogleRating(vendor: {
  reviewCount: number
  google?: GoogleRating | null
}): GoogleRating | null {
  const google = vendor.google ?? null
  return google && vendor.reviewCount >= GOOGLE_RATING_RULES.detlioTakesOverAt
    ? google
    : null
}

/** What a garage's rating cell shows: Google's, Detlio's own (the d. mark), or nothing ("New"). */
export type RatingShown =
  | { kind: 'google'; google: GoogleRating }
  | { kind: 'detlio'; rating: number; reviewCount: number }
  | { kind: 'new' }

export function ratingShown(vendor: {
  rating: number | null
  reviewCount: number
  isNew?: boolean
  google?: GoogleRating | null
}): RatingShown {
  const google = mainGoogleRating(vendor)
  if (google) return { kind: 'google', google }
  if (vendor.rating !== null && hasStarScore(vendor))
    return { kind: 'detlio', rating: vendor.rating, reviewCount: vendor.reviewCount }
  return { kind: 'new' }
}

/** One decimal, as every rating is shown ("4.0", not "4"). */
export function ratingFigure(rating: number): string {
  return rating.toFixed(1)
}

/** The d. mark's spoken name with its figure: "Detlio rating 4.8". */
export function detlioRatingLabel(rating: number): string {
  return t('Detlio rating {rating}', { rating: ratingFigure(rating) })
}

/** The Google mark's spoken name. */
export const GOOGLE_RATING_LABEL = msg('Google rating')

/** "Google rating 4.6, 312 reviews, Google Maps": one line for screen readers. */
export function googleRatingSpoken(google: GoogleRating): string {
  return `${tn(google.reviewCount, 'Google rating {rating}, {count} review', 'Google rating {rating}, {count} reviews', {
    rating: ratingFigure(google.rating),
  })}, ${GOOGLE_MAPS_ATTRIBUTION}.`
}

/** The garage page's honest line under Google's rating. */
export const DETLIO_REVIEWS_ONLY_LINE = msg('Reviews here come only from customers who booked on Detlio.')
/** After Detlio's own count, once it has taken over. */
export const FROM_REAL_BOOKINGS = msg('from real Detlio bookings')
/** In the Reviews tab of a garage with no Detlio review yet but a Google rating. */
export const NO_DETLIO_REVIEWS_YET = msg('No Detlio reviews yet')
