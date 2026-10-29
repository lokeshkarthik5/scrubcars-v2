/**
 * "What's included" from a service's description. Garages and admin write
 * descriptions as plain text, an optional intro line and then the points as
 * "- " lines; this reads them back so the customer sees a ticked list in the
 * service sheet and the first few points on the service card. A description
 * with no points is left exactly as written (the sheet shows it as before).
 */

export type ServiceDescription = {
  /** The lines before the first point, as written; null when there are none. */
  intro: string | null
  /** Each point's text, without its "-", "•", "*" or "1." marker. */
  points: string[]
  /**
   * Lines after the points that are not points themselves ("Takes about an
   * hour."), shown under the list as a plain note; null when there are none.
   */
  note: string | null
}

/**
 * A point's marker: "-", "•", "*" (and the dashes and dots phones type),
 * with or without a space after it, or "1." / "1)" followed by a space so
 * "1.5 hours" stays words.
 */
const POINT = /^\s*(?:[-•*–—▪●◦‣]\s*|\d{1,2}[.)]\s+)(.*)$/

/** An intro that only announces the list, which the sheet's heading already does. */
const LIST_LABEL =
  /^(?:what'?s included|what is included|includes?|included|what you get)\s*:?$/i

const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text)

/** Blank lines at either end dropped, and runs of blank lines made one. */
function tidyBlock(lines: string[]): string | null {
  const out: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' && (out.length === 0 || out[out.length - 1] === ''))
      continue
    out.push(trimmed)
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.length > 0 ? out.join('\n') : null
}

/**
 * Splits a description into its intro, its points and any note after them.
 *
 * - A point is a line starting with a marker (see POINT); one with no
 *   letters or digits ("-", "---") is dropped.
 * - An indented line straight after a point carries that point on (a long
 *   point wrapped by hand); any other plain line after the first point goes
 *   to the note, so a closing remark is never shown ticked.
 * - An intro of only "Includes:" or "What's included:" is dropped: the
 *   sheet's own heading says it.
 * - No points at all: the intro is the whole text, trimmed and otherwise
 *   untouched.
 */
export function parseServiceDescription(
  text: string | null | undefined
): ServiceDescription {
  const source = (text ?? '').replace(/\r\n?/g, '\n')
  const lines = source.split('\n')
  const firstPoint = lines.findIndex((line) => POINT.test(line))
  if (firstPoint === -1) {
    const whole = source.trim()
    return { intro: whole === '' ? null : whole, points: [], note: null }
  }

  const introLines = lines.slice(0, firstPoint)
  // Drop a closing "Includes:" from the intro (only when it is the last line).
  const lastIntro = [...introLines]
    .reverse()
    .findIndex((line) => line.trim() !== '')
  if (lastIntro !== -1) {
    const at = introLines.length - 1 - lastIntro
    if (LIST_LABEL.test(introLines[at].trim())) introLines.splice(at, 1)
  }

  const points: string[] = []
  const noteLines: string[] = []
  // Whether the line before was a point (so an indented line continues it).
  let afterPoint = false
  for (const line of lines.slice(firstPoint)) {
    const match = POINT.exec(line)
    if (match) {
      const point = match[1].trim()
      if (hasWords(point)) {
        points.push(point)
        afterPoint = true
      } else {
        afterPoint = false
      }
      continue
    }
    if (line.trim() === '') {
      afterPoint = false
      if (noteLines.length > 0) noteLines.push('')
      continue
    }
    if (afterPoint && /^\s+/.test(line) && points.length > 0) {
      points[points.length - 1] = `${points[points.length - 1]} ${line.trim()}`
      continue
    }
    afterPoint = false
    noteLines.push(line)
  }

  return { intro: tidyBlock(introLines), points, note: tidyBlock(noteLines) }
}

/** How many points the service sheet shows before "+N more". */
export const SHEET_POINTS = 5

/**
 * The sheet's list: the first SHEET_POINTS points, and how many more sit
 * behind "+N more" (0 when none). Expanded, every point and 0.
 */
export function sheetPoints(
  points: readonly string[],
  expanded: boolean
): { shown: string[]; more: number } {
  if (expanded || points.length <= SHEET_POINTS)
    return { shown: [...points], more: 0 }
  return {
    shown: points.slice(0, SHEET_POINTS),
    more: points.length - SHEET_POINTS,
  }
}

/** At most this many points on a service card… */
export const CARD_POINTS = 3
/** …and only while the joined text fits about two lines of a 360px card. */
export const CARD_POINTS_CHARS = 56

/**
 * A service card's line: the first points joined with " · " ("Foam wash ·
 * Vacuum · Dashboard polish") and how many are left ("+1"). Up to
 * CARD_POINTS of them, fewer when they would not fit CARD_POINTS_CHARS, but
 * always the first. Null with no points: the card shows the description.
 */
export function cardPointsLine(
  points: readonly string[]
): { text: string; more: number } | null {
  if (points.length === 0) return null
  const shown = [points[0]]
  let length = points[0].length
  for (const point of points.slice(1, CARD_POINTS)) {
    length += 3 + point.length
    if (length > CARD_POINTS_CHARS) break
    shown.push(point)
  }
  return { text: shown.join(' · '), more: points.length - shown.length }
}
