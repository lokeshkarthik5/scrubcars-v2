/**
 * The big figure on the coupon offer tile's stub, and the description rule
 * the tile shares with the admin's "Preview on Home".
 *
 * The stub is a fixed 104px, so the figure has to fit it whatever the admin
 * typed: a percentage at 40px, a rupee amount at 34px that steps down as the
 * number grows, or FREE. Kept pure (no React, no DOM) so Home and the admin
 * preview pick the same size for the same discount, and so it can be tested.
 */

export type OfferFigure =
  | { kind: 'percent'; value: number }
  | { kind: 'amount'; rupees: number }
  | { kind: 'free' }

/**
 * Size steps, as the approved mockup draws them:
 * - `percent` — 40px, with a 18px raised "%".
 * - `amount` — 34px, up to "999" (₹100).
 * - `amount-sm` — 26px, four and five digits ("1,000" to "99,999").
 * - `amount-xs` — 20px, a lakh and up ("1,00,000"); not in the mockup, but
 *   26px would run past the stub's edge.
 * - `free` — 26px, regular weight.
 */
export type OfferFigureSize =
  'percent' | 'amount' | 'amount-sm' | 'amount-xs' | 'free'

export interface OfferFigureDisplay {
  size: OfferFigureSize
  /** Set small before the value: "₹" for an amount. */
  prefix: string | null
  /** The number, grouped the Indian way ("1,000", "1,00,000"), or "FREE". */
  value: string
  /** Set small and raised after the value: "%" for a percentage. */
  suffix: string | null
  /** The figure as one string, for a label: "20%", "₹1,000", "FREE". */
  text: string
}

const rupeeDigits = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const percentDigits = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1,
})

/** The admin preview feeds half-typed input; anything unusable shows as 0. */
function positive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function formatOfferFigure(figure: OfferFigure): OfferFigureDisplay {
  if (figure.kind === 'free') {
    return {
      size: 'free',
      prefix: null,
      value: 'FREE',
      suffix: null,
      text: 'FREE',
    }
  }

  if (figure.kind === 'percent') {
    const value = percentDigits.format(positive(figure.value))
    return {
      size: 'percent',
      prefix: null,
      value,
      suffix: '%',
      text: `${value}%`,
    }
  }

  const value = rupeeDigits.format(Math.round(positive(figure.rupees)))
  // Counted on the grouped string, commas included, as the mockup does:
  // "999" stays at 34px, "1,000" (5 characters) steps down.
  const size: OfferFigureSize =
    value.length > 6 ? 'amount-xs' : value.length > 4 ? 'amount-sm' : 'amount'
  return { size, prefix: '₹', value, suffix: null, text: `₹${value}` }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The admin's description, minus the code if they typed it in as well
 * ("Up to ₹300 · Code DETAIL20" → "Up to ₹300"): the tile always shows the
 * code from the Code field, so leaving it in would show it twice.
 */
export function stripOfferCode(
  description: string,
  code: string | null | undefined
): string {
  const text = (description ?? '').trim()
  const c = (code ?? '').trim()
  if (!c) return text
  return text
    .replace(
      new RegExp(`\\s*·?\\s*(?:code\\s+)?${escapeRegExp(c)}(?![\\w])`, 'i'),
      ''
    )
    .replace(/^\s*·\s*/, '')
    .trim()
}
