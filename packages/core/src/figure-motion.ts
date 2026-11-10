/**
 * The two ways a figure moves in the customer app (customer UI round, Nov
 * 2026, "the finish"): it counts up from nothing once, when its card first
 * comes into view, and a figure that changes rolls like an odometer. Pure, so
 * the numbers a frame shows are tested without a browser; the components that
 * draw them (@repo/ui/finish/odometer) only ask for frames.
 */

/** The ease every count-up shares: quick at first, settling at the end. */
export function easeOutCubic(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  return 1 - Math.pow(1 - p, 3)
}

/** How long a count-up runs, in ms. Under the finish's ~0.6 s rule plus a beat. */
export const COUNT_UP_MS = 800

/**
 * The figure a count-up shows `elapsed` ms in: from 0 to `to`, with the
 * decimals the settled figure has, and exactly `to` once the time is up, so
 * the last frame never reads 4.49 for 4.5.
 */
export function countUpFrame(
  to: number,
  elapsed: number,
  decimals = 0,
  duration: number = COUNT_UP_MS
): string {
  if (!Number.isFinite(to)) return ''
  if (elapsed >= duration) return to.toFixed(decimals)
  return (to * easeOutCubic(elapsed / duration)).toFixed(decimals)
}

/** One place of an odometer: a digit that rolls, or a sign that stands still. */
export interface OdometerPlace {
  char: string
  /** A digit 0–9 rolls between values; anything else (₹ , . km) is fixed. */
  digit: number | null
}

/**
 * A figure as the odometer draws it, place by place. Places are matched from
 * the right when the figure changes, so ₹999 → ₹1,049 rolls the units, tens
 * and hundreds in place and adds the new places at the left.
 */
export function odometerPlaces(figure: string): OdometerPlace[] {
  return Array.from(figure).map((char) => ({
    char,
    digit: /^[0-9]$/.test(char) ? Number(char) : null,
  }))
}

/**
 * Which way each place rolls from one figure to the next, matched from the
 * right: up when the figure grew, down when it shrank, none for a place that
 * did not change. One direction for the whole figure, as a counter turns.
 */
export function odometerRoll(from: number, to: number): 'up' | 'down' | 'none' {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return 'none'
  return to > from ? 'up' : 'down'
}
