/**
 * A sleek coupé in side profile, facing left: the one car drawing the gift
 * cards, the scratch-card prizes and Detlio Wrapped share. Plain SVG path
 * strings, so the screen draws them as <svg> and the Wrapped image draws the
 * very same shapes on its canvas (Path2D). No make or model: it is a
 * silhouette, traced loosely after the approved sports car on Home.
 */

/** The drawing's box: 600 × 180, ground at y = 175. */
export const CAR_VIEWBOX = { width: 600, height: 180 } as const

/** The body, wheel arches cut out. */
export const CAR_BODY =
  'M22 140C14 132 12 116 18 106C22 98 34 92 52 88C100 80 160 72 222 58C252 40 290 22 336 16C384 11 430 14 470 28C500 38 532 50 566 58C582 62 590 70 591 82L590 118C589 132 582 142 572 144L531 146A47 47 0 0 0 439 146L171 148A47 47 0 0 0 79 148L40 146C30 146 24 144 22 140Z'

/** The side glass, one piece. */
export const CAR_GLASS =
  'M238 60C264 42 298 29 338 24C378 20 418 23 450 34C458 37 457 44 448 46L252 64C241 65 233 63 238 60Z'

/** The B-pillar splitting the glass. */
export const CAR_PILLAR = 'M372 22L370 56'

/** The shoulder line that catches the light. */
export const CAR_SHOULDER = 'M44 103C160 89 380 72 586 70'

/** The roof's rim of light, from the windshield over the fastback. */
export const CAR_ROOFLINE = 'M224 57C254 39 292 22 336 16C384 11 430 14 470 28C500 38 532 50 566 58'

/** The headlight sliver at the nose. */
export const CAR_HEADLIGHT = 'M28 101L72 92L68 98L32 106Z'

/** The tail light sliver: the drawing's one touch of red. */
export const CAR_TAILLIGHT = 'M568 62L590 73L590 79L566 68Z'

/** The two wheels: centre and tyre radius. */
export const CAR_WHEELS = [
  { cx: 125, cy: 135, r: 40 },
  { cx: 485, cy: 135, r: 40 },
] as const
