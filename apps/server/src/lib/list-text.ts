/**
 * Lists kept as plain text: an optional intro, then one "- " line per point.
 *
 * Service descriptions are stored this way (owner, 28 Oct 2026: "no new
 * storage"), so the garage app, the AI and old data keep working, and the
 * admin editor's Points mode reads and writes it. A mark's old note reads
 * its "- " lines as checklist items the same way.
 *
 * Reading is forgiving, as people paste lists from WhatsApp and notes:
 * a line starting "-", "•", "*", "·" or "1." / "1)" is a point. Writing is
 * always the one shape: the intro on its own line, then "- " lines.
 *
 * Twin: packages/core/src/list-text.ts (list-text.parity.test.ts). Pure.
 */

/** A line that is a point: its marker, then the text. */
const POINT_LINE = /^\s*(?:[-*·]|\d{1,2}[.)])\s+(\S.*)$/
/** "•" is often typed straight against the word. */
const BULLET_LINE = /^\s*•\s*(\S.*)$/

/** The point a line holds, trimmed, or null when it is not a point. */
export function pointOf(line: string): string | null {
  const match = POINT_LINE.exec(line) ?? BULLET_LINE.exec(line)
  if (!match) return null
  const text = match[1].trim()
  return text.length > 0 ? text : null
}

/**
 * Splits text into its intro and its points. Lines that are not points are
 * the intro, in order, wherever they stand (blank lines dropped); points keep
 * their order.
 */
export function splitListText(text: string | null | undefined): {
  intro: string
  points: string[]
} {
  const intro: string[] = []
  const points: string[] = []
  for (const line of (text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const point = pointOf(line)
    if (point !== null) points.push(point)
    else if (line.trim()) intro.push(line.trim())
  }
  return { intro: intro.join('\n'), points }
}

/** Whether the text holds at least one point line. */
export function hasPoints(text: string | null | undefined): boolean {
  return splitListText(text).points.length > 0
}

/**
 * The stored shape: the intro (when there is one), then "- " lines. Empty
 * points are dropped and each point is one line.
 */
export function joinListText(intro: string, points: readonly string[]): string {
  const lines = points
    .map((point) => point.replace(/\s+/g, ' ').trim())
    .filter((point) => point.length > 0)
    .map((point) => `- ${point}`)
  const head = intro.trim()
  return [head, ...lines].filter((line) => line.length > 0).join('\n')
}
