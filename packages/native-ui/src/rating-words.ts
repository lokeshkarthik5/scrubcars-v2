/**
 * The rating marks' fixed words and the G's switch for the apps
 * (rating-marks.tsx). This package does not depend on @repo/core, so these
 * twin core's (packages/core/src/ratings.ts), held to it by
 * rating-words.test.ts: change one, change both.
 */

/** Google's attribution, exactly, never translated, shortened or split. */
export const GOOGLE_MAPS_ATTRIBUTION = 'Google Maps';

/**
 * Whether Google's multicolour G shows beside Google's rating. Google's brand
 * rules may need Google's permission for the G; the words "Google Maps" meet
 * the attribution rule. Set to false (here and in core's SHOW_GOOGLE_G) to
 * show the words alone.
 */
export const SHOW_GOOGLE_G = true;

/** The G's spoken name. */
export const GOOGLE_RATING_LABEL = 'Google rating';

/** One decimal, as every rating is shown. */
export function ratingFigure(rating: number): string {
  return rating.toFixed(1);
}
