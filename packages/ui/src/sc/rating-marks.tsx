'use client'

import { cn } from '@repo/core/utils'
import { useT } from '@repo/core/i18n'
import {
  GOOGLE_MAPS_ATTRIBUTION,
  GOOGLE_RATING_LABEL,
  SHOW_GOOGLE_G,
  ratingFigure,
} from '@repo/core/ratings'

/**
 * The two rating marks (Google rating for new garages, 21 Nov 2026; the
 * native twin is packages/native-ui/src/rating-marks.tsx).
 *
 * - **d.** is Detlio's own rating, in place of the amber star wherever a
 *   garage's overall rating shows: a lowercase d in the wordmark's bold
 *   letters with the logo's round red dot (the brand red token,
 *   --color-brand-red, #EF3240). Each customer's own 1–5 stars stay stars.
 * - **G** is Google's rating: Google's multicolour G, always with the words
 *   "Google Maps" in the same card (GoogleMapsText).
 *
 * The two never sit in one figure and are never added together.
 */

/**
 * Detlio's mark. `rating` names it for screen readers ("Detlio rating
 * 4.8"); the figure beside it can then be hidden from them. Sized by `size`
 * (the d's font size in px); the colour is the text's own.
 */
export function DetlioMark({
  size = 15,
  rating,
  className,
}: {
  size?: number
  rating?: number | null
  className?: string
}) {
  const t = useT()
  const label =
    rating === undefined || rating === null
      ? t('Detlio rating')
      : t('Detlio rating {rating}', { rating: ratingFigure(rating) })
  const dot = Math.round(size * 0.27 * 100) / 100
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex shrink-0 items-baseline leading-none', className)}
    >
      <span
        aria-hidden="true"
        className="font-sans font-bold tracking-[-0.03em]"
        style={{ fontSize: size, lineHeight: 1 }}
      >
        d
      </span>
      <i
        aria-hidden="true"
        className="inline-block rounded-full bg-brand-red"
        style={{ width: dot, height: dot, marginLeft: Math.round(size * 0.07 * 100) / 100 }}
      />
    </span>
  )
}

/**
 * Google's multicolour G. Google's brand rules may need Google's permission
 * for the G; the words "Google Maps" (GoogleMapsText) are what meets
 * Google's attribution rule. SHOW_GOOGLE_G (packages/core/src/ratings.ts)
 * turns the G off everywhere in one line, leaving the words alone; the
 * screen-reader name stays.
 */
export function GoogleMark({ size = 14, className }: { size?: number; className?: string }) {
  const t = useT()
  if (!SHOW_GOOGLE_G) return <span className="sr-only">{t(GOOGLE_RATING_LABEL)}</span>
  return (
    <svg
      role="img"
      aria-label={t(GOOGLE_RATING_LABEL)}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn('block shrink-0', className)}
    >
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  )
}

/**
 * Google's attribution, with every Google rating in the same card: the
 * words "Google Maps", exactly, never translated (translate="no"),
 * shortened, wrapped or run into other text; white, in a plain sans
 * (Google's Roboto where the device has it), 12px.
 */
export function GoogleMapsText({ className }: { className?: string }) {
  return (
    <span
      translate="no"
      className={cn('whitespace-nowrap text-[12px] font-normal leading-[1.35] tracking-normal text-white', className)}
      style={{ fontFamily: 'Roboto, Arial, sans-serif' }}
    >
      {GOOGLE_MAPS_ATTRIBUTION}
    </span>
  )
}
